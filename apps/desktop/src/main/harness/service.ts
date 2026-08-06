/**
 * Bring-your-own-harness (BYOH) orchestrator.
 *
 * Instead of calling an AI SDK model, this shells out to the user's *own*
 * locally installed agent CLI (claude, codex, ...) and lets it own
 * authentication — data-peek never stores or injects a token. The service owns
 * spawning, timeouts, prompt/model composition, structured-output validation,
 * and the grounded-ness rule; each adapter only knows its CLI's argv shape and
 * how to read its output.
 */

import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type {
  AIConfig,
  AIMessage,
  AIProvider,
  SchemaInfo,
  AIStructuredResponse,
  AIChatStreamEvent
} from '@shared/index'
import { DEFAULT_MODELS, isHarnessProvider } from '@shared/index'
import { claudeCodeAdapter } from './adapters/claude-code'
import { codexAdapter } from './adapters/codex'
import { antigravityAdapter } from './adapters/antigravity'
import { runHarnessProcess } from './runner'
import { extractPartialMessage } from './partial-json'
import type {
  HarnessAdapter,
  HarnessDetection,
  HarnessInput,
  HarnessProviderId,
  HarnessResult
} from './types'
import { getMcpRuntimeInfo } from '../mcp-runtime'
import {
  buildSystemPrompt,
  buildDashboardPrompt,
  responseSchema,
  dashboardSpecSchema,
  normalizeStructuredResponse,
  RESPONSE_JSON_SCHEMA_STRING,
  type DashboardSpec
} from '../ai-schema'
import { createLogger } from '../lib/logger'

const log = createLogger('harness-service')

const GENERATION_TIMEOUT_MS = 120_000
// Agentic runs make several tool round-trips, so they get a longer ceiling.
const AGENTIC_TIMEOUT_MS = 180_000
// Generating a whole dashboard verifies several queries — allow more time.
const DASHBOARD_TIMEOUT_MS = 300_000

const ADAPTERS: Record<HarnessProviderId, HarnessAdapter> = {
  'claude-cli': claudeCodeAdapter,
  'codex-cli': codexAdapter,
  'antigravity-cli': antigravityAdapter
}

function adapterFor(provider: AIProvider): HarnessAdapter {
  if (!isHarnessProvider(provider)) throw new Error(`${provider} is not a harness provider`)
  return ADAPTERS[provider as HarnessProviderId]
}

export function detectHarness(provider: AIProvider): Promise<HarnessDetection> {
  return adapterFor(provider).detect()
}

/** Pull the first balanced-looking JSON object out of a model reply. */
function extractJsonObject(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const body = (fenced ? fenced[1] : trimmed).trim()
  const first = body.indexOf('{')
  const last = body.lastIndexOf('}')
  if (first !== -1 && last > first) return body.slice(first, last + 1)
  return body
}

/** Compose the user-facing prompt from the conversation (mirrors the AI SDK path). */
function buildUserPrompt(messages: AIMessage[]): string {
  const last = messages[messages.length - 1]
  const history = messages
    .slice(0, -1)
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n')
  return history
    ? `Previous conversation:\n${history}\n\nUser's current request: ${last.content}`
    : last.content
}

/**
 * Instruction that turns on agentic mode: tells the model it can query the live
 * DB through the MCP tools and should ground its answer before replying.
 */
export function buildAgenticInstruction(connectionId: string): string {
  return `

## Live database access
You can query THIS database directly with your MCP tools (list_schemas, run_query, explain_query). Use connectionId "${connectionId}" for every call — do not call list_connections. Ground your answer in the real database: confirm table and column names, and where useful run or EXPLAIN the query (reads execute in a read-only, always-rolled-back transaction capped at 500 rows) before answering. Then reply with the JSON contract below, putting the verified SQL in the "sql" field.`
}

/**
 * Mirror of {@link buildAgenticInstruction} for non-agentic runs: without live
 * access, models invent plausible-sounding values ("There are 5 users.") or
 * degrade to type "message" instead of returning runnable SQL. Verified live
 * on codex (which is always non-agentic today, see codex.ts) — this flips the
 * same question from a fabricated message to a metric with correct SQL.
 */
export function buildNoLiveAccessInstruction(): string {
  return `

## No live database access
You CANNOT execute queries or see any data — only the schema above. For ANY question about the data itself (counts, totals, values, lists, examples), respond with type "query", "metric", or "chart" and put runnable SQL in the "sql" field: the app executes it and shows the real result. NEVER state, estimate, or guess data values in "message" — write it as an intro for the result, e.g. "Here's the total user count:".`
}

export interface HarnessMeta {
  /** The answer was produced agentically against the live DB (MCP + tool calls). */
  grounded: boolean
  /** Agentic mode was enabled for this call (MCP server up + saved connection). */
  agentic: boolean
  /** Turns reported by the CLI (>1 implies tool round-trips happened). */
  turns?: number
  /** CLI session id — pass back as resumeSessionId next turn for conversation memory. */
  sessionId?: string
}

/**
 * "Grounded" only if agentic AND the model actually took tool round-trips AND
 * no tool call was denied — a denied read means it couldn't query, so claiming
 * "grounded" would be false.
 */
function isGrounded(agentic: boolean, stats: { toolRoundTrips: number; denials: number }): boolean {
  return agentic && stats.toolRoundTrips > 0 && stats.denials === 0
}

/** Validate a harness reply (JSON string or decoded object) against a zod schema. */
function validatePayload(payload: unknown): AIStructuredResponse {
  let parsed: unknown
  if (typeof payload === 'string') {
    if (!payload.trim()) throw new Error('The CLI returned an empty result')
    try {
      parsed = JSON.parse(extractJsonObject(payload))
    } catch {
      throw new Error('Could not parse a JSON response from the model output')
    }
  } else {
    parsed = payload
  }
  const validated = responseSchema.safeParse(parsed)
  if (!validated.success) {
    throw new Error(
      `Model response did not match the expected schema: ${validated.error.issues[0]?.message ?? 'invalid shape'}`
    )
  }
  return normalizeStructuredResponse(validated.data)
}

/** Validate a harness reply against the dashboard spec schema. */
function validateDashboardPayload(payload: unknown): DashboardSpec {
  let parsed: unknown
  if (typeof payload === 'string') {
    if (!payload.trim()) throw new Error('The CLI returned an empty result')
    try {
      parsed = JSON.parse(extractJsonObject(payload))
    } catch {
      throw new Error('Could not parse a dashboard spec from the model output')
    }
  } else {
    parsed = payload
  }
  const validated = dashboardSpecSchema.safeParse(parsed)
  if (!validated.success) {
    throw new Error(
      `Dashboard spec did not match the expected shape: ${validated.error.issues[0]?.message ?? 'invalid'}`
    )
  }
  return validated.data
}

/** One harness execution: scratch dir, spawn, stream events, collect, clean up. */
async function executeHarness(
  adapter: HarnessAdapter,
  input: Omit<HarnessInput, 'workDir'>,
  timeoutMs: number,
  onEvent?: (event: AIChatStreamEvent) => void
): Promise<HarnessResult> {
  const workDir = mkdtempSync(join(tmpdir(), 'data-peek-harness-'))
  try {
    const request = adapter.buildRequest({ ...input, workDir })
    const run = adapter.createRun()
    let raw = ''
    let lastMessage = ''
    let lastActivity = ''
    const exit = await runHarnessProcess(
      request,
      { timeoutMs, cliLabel: adapter.cliLabel, notFoundMessage: adapter.notFoundMessage },
      (obj) => {
        const info = run.onLine(obj)
        if (!onEvent) return
        const delta = info.jsonDelta ?? info.textDelta
        if (delta) {
          raw += delta
          const message = extractPartialMessage(raw)
          if (message && message !== lastMessage) {
            lastMessage = message
            onEvent({ type: 'message', text: message })
          }
        }
        if (info.toolLabel && info.toolLabel !== lastActivity) {
          lastActivity = info.toolLabel
          onEvent({ type: 'activity', label: info.toolLabel })
        }
      }
    )
    return run.finish(exit)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

/** "" or 'default' means "use the CLI's own default model". */
function resolveModel(config: AIConfig): string {
  const configured =
    config.model && config.model !== 'default' ? config.model : DEFAULT_MODELS[config.provider]
  return configured === 'default' ? '' : configured
}

function metaFrom(agentic: boolean, result: HarnessResult): HarnessMeta {
  return {
    grounded: isGrounded(agentic, result.stats),
    agentic,
    turns: result.stats.toolRoundTrips + 1,
    sessionId: result.stats.sessionId
  }
}

export async function generateChatResponseViaHarness(
  config: AIConfig,
  messages: AIMessage[],
  schemas: SchemaInfo[],
  dbType: string,
  connectionId?: string
): Promise<{ success: boolean; data?: AIStructuredResponse; error?: string; meta?: HarnessMeta }> {
  try {
    const adapter = adapterFor(config.provider)
    const model = resolveModel(config)
    const userPrompt = buildUserPrompt(messages)

    const mcpInfo = getMcpRuntimeInfo()
    // Agentic mode needs a running MCP server, a saved connection the server
    // can address by id, and an adapter that can actually act on tool calls in
    // headless mode (see codex.ts for why codex fails that last check).
    const agentic = mcpInfo !== null && !!connectionId && adapter.capabilities.agentic

    let systemPrompt = buildSystemPrompt(schemas, dbType)
    let mcp: HarnessInput['mcp']
    let timeoutMs = GENERATION_TIMEOUT_MS
    if (agentic && mcpInfo && connectionId) {
      systemPrompt += buildAgenticInstruction(connectionId)
      mcp = { ...mcpInfo, connectionId }
      timeoutMs = AGENTIC_TIMEOUT_MS
    } else {
      systemPrompt += buildNoLiveAccessInstruction()
    }

    log.debug('Running harness', { provider: config.provider, model, agentic })
    const result = await executeHarness(
      adapter,
      {
        kind: 'chat',
        userPrompt,
        systemPrompt,
        model,
        jsonSchema: RESPONSE_JSON_SCHEMA_STRING,
        stream: false,
        mcp
      },
      timeoutMs
    )
    return { success: true, data: validatePayload(result.payload), meta: metaFrom(agentic, result) }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('generateChatResponseViaHarness error:', message)
    return { success: false, error: message }
  }
}

/**
 * Streaming variant of {@link generateChatResponseViaHarness}. Same inputs,
 * same final return shape — but pushes incremental `AIChatStreamEvent`s through
 * `onEvent` as the CLI streams: the assistant prose (extracted live from the
 * partial JSON) and a label for each grounding/tool step. The authoritative
 * structured response is still parsed from the terminal result.
 */
export async function generateChatResponseViaHarnessStream(
  config: AIConfig,
  messages: AIMessage[],
  schemas: SchemaInfo[],
  dbType: string,
  connectionId: string | undefined,
  resumeSessionId: string | undefined,
  onEvent: (event: AIChatStreamEvent) => void
): Promise<{ success: boolean; data?: AIStructuredResponse; error?: string; meta?: HarnessMeta }> {
  try {
    const adapter = adapterFor(config.provider)
    const model = resolveModel(config)
    // Only honour resume when the adapter supports it; when resuming, the CLI
    // restores prior turns server-side, so we send only the latest user message
    // instead of replaying the whole transcript.
    const resume = adapter.capabilities.resume ? resumeSessionId : undefined
    const userPrompt = resume ? messages[messages.length - 1].content : buildUserPrompt(messages)

    const mcpInfo = getMcpRuntimeInfo()
    const agentic = mcpInfo !== null && !!connectionId && adapter.capabilities.agentic

    let systemPrompt = buildSystemPrompt(schemas, dbType)
    let mcp: HarnessInput['mcp']
    let timeoutMs = GENERATION_TIMEOUT_MS
    if (agentic && mcpInfo && connectionId) {
      systemPrompt += buildAgenticInstruction(connectionId)
      mcp = { ...mcpInfo, connectionId }
      timeoutMs = AGENTIC_TIMEOUT_MS
    } else {
      systemPrompt += buildNoLiveAccessInstruction()
    }

    log.debug('Running harness (streaming)', {
      provider: config.provider,
      model,
      agentic,
      resume: !!resume
    })
    const result = await executeHarness(
      adapter,
      {
        kind: 'chat',
        userPrompt,
        systemPrompt,
        model,
        jsonSchema: RESPONSE_JSON_SCHEMA_STRING,
        stream: adapter.capabilities.streaming,
        resumeSessionId: resume,
        mcp
      },
      timeoutMs,
      onEvent
    )
    return { success: true, data: validatePayload(result.payload), meta: metaFrom(agentic, result) }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('generateChatResponseViaHarnessStream error:', message)
    return { success: false, error: message }
  }
}

/**
 * Generate a whole dashboard spec by driving the user's local agent CLI
 * agentically against the live DB (requires the MCP server + a saved connection).
 */
export async function generateDashboardViaHarness(
  provider: AIProvider,
  prompt: string,
  schemas: SchemaInfo[],
  dbType: string,
  connectionId: string
): Promise<{ success: boolean; spec?: DashboardSpec; error?: string }> {
  try {
    const adapter = adapterFor(provider)
    // Dashboards are generated against the live DB, so an adapter that can't
    // ground itself agentically can't be trusted with dashboard generation either.
    if (!adapter.capabilities.dashboard || !adapter.capabilities.agentic) {
      return {
        success: false,
        error: 'Dashboard generation is not supported by this harness yet.'
      }
    }
    const mcpInfo = getMcpRuntimeInfo()
    if (!mcpInfo) {
      return {
        success: false,
        error: 'Enable the MCP server so the assistant can query your database.'
      }
    }
    const defaultModel = DEFAULT_MODELS[provider]
    const model = defaultModel === 'default' ? '' : defaultModel
    const systemPrompt =
      buildDashboardPrompt(schemas, dbType) +
      `\n\nUse connectionId "${connectionId}" for every tool call; do not call list_connections. Verify each widget's SQL against the live database before returning.`
    const userPrompt = prompt.trim() || 'Design a useful overview dashboard for this database.'

    log.debug('Running harness (dashboard)', { provider, model })
    const result = await executeHarness(
      adapter,
      {
        kind: 'dashboard',
        userPrompt,
        systemPrompt,
        model,
        jsonSchema: undefined,
        stream: false,
        mcp: { ...mcpInfo, connectionId }
      },
      DASHBOARD_TIMEOUT_MS
    )
    return { success: true, spec: validateDashboardPayload(result.payload) }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('generateDashboardViaHarness error:', message)
    return { success: false, error: message }
  }
}
