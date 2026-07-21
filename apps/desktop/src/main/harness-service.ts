/**
 * Bring-your-own-harness (BYOH) — Claude Code CLI provider.
 *
 * Instead of calling an AI SDK model, this shells out to the user's *own*
 * locally installed `claude` binary and lets it own authentication (their
 * subscription or their key — data-peek never stores or injects a token). We
 * drive the official CLI as an orchestrator; we do not reimplement the agent
 * loop or reuse OAuth tokens.
 *
 * Phase 1 (this module): one-shot, structured-output parity with the AI SDK
 * path — spawn `claude -p --output-format json`, parse the result into the same
 * AIStructuredResponse the renderer already understands. Phase 2 (later) wires
 * the harness to data-peek's MCP server for real agentic execution.
 */

import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type {
  AIConfig,
  AIMessage,
  SchemaInfo,
  AIStructuredResponse,
  AIChatStreamEvent
} from '@shared/index'
import { DEFAULT_MODELS } from '@shared/index'
import {
  buildSystemPrompt,
  responseSchema,
  normalizeStructuredResponse,
  buildDashboardPrompt,
  dashboardSpecSchema,
  RESPONSE_JSON_SCHEMA_STRING,
  type DashboardSpec
} from './ai-schema'
import { classifyStreamLine, extractPartialMessage } from './harness-stream'
import { getMcpRuntimeInfo, type McpRuntimeInfo } from './mcp-runtime'
import { createLogger } from './lib/logger'

const log = createLogger('harness-service')

const GENERATION_TIMEOUT_MS = 120_000
// Agentic runs make several tool round-trips, so they get a longer ceiling.
const AGENTIC_TIMEOUT_MS = 180_000
// Generating a whole dashboard verifies several queries — allow more time.
const DASHBOARD_TIMEOUT_MS = 300_000
const DETECT_TIMEOUT_MS = 10_000

/** Common places the `claude` binary lands that a GUI-launched app's PATH misses. */
function candidateBinDirs(): string[] {
  const home = homedir()
  return [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    join(home, '.local', 'bin'),
    join(home, '.claude', 'local'),
    join(home, '.bun', 'bin'),
    join(home, '.npm-global', 'bin')
  ]
}

/**
 * PATH augmented with common install dirs. A packaged Electron app launched from
 * the GUI does not inherit the login-shell PATH on macOS, so `claude` is often
 * invisible without this. (A production build should also shell-resolve PATH;
 * this covers the common cases for the spike.)
 */
function augmentedPath(): string {
  const extra = candidateBinDirs().join(':')
  return process.env.PATH ? `${process.env.PATH}:${extra}` : extra
}

/** Resolve the `claude` binary: explicit override, then known dirs, then bare name. */
export function resolveClaudeBinary(): string {
  const override = process.env.DATA_PEEK_CLAUDE_PATH
  if (override && existsSync(override)) return override
  for (const dir of candidateBinDirs()) {
    const candidate = join(dir, 'claude')
    if (existsSync(candidate)) return candidate
  }
  // Last resort: rely on the augmented PATH at spawn time.
  return 'claude'
}

/**
 * Build the argv for a structured generation call. Pure — unit-tested.
 * With `stream: true` the CLI emits NDJSON (stream-json) with token-level deltas
 * instead of a single buffered JSON envelope.
 */
export interface HarnessArgOpts {
  /** NDJSON token streaming (stream-json + verbose + partial messages). */
  stream?: boolean
  /** Serialized JSON Schema for native structured output (`--json-schema`). */
  jsonSchema?: string
  /** Resume a prior CLI session so the model keeps conversation memory. */
  resumeSessionId?: string
}

export function buildHarnessArgs(
  userPrompt: string,
  systemPrompt: string,
  model: string,
  opts?: HarnessArgOpts
): string[] {
  const args = [
    '-p',
    userPrompt,
    '--output-format',
    opts?.stream ? 'stream-json' : 'json',
    '--append-system-prompt',
    systemPrompt,
    '--model',
    model
  ]
  // stream-json requires --verbose; token-level deltas require partial messages.
  if (opts?.stream) args.push('--verbose', '--include-partial-messages')
  // Native structured output: the CLI constrains + validates the reply to schema.
  if (opts?.jsonSchema) args.push('--json-schema', opts.jsonSchema)
  // Multi-turn memory: continue the prior conversation server-side.
  if (opts?.resumeSessionId) args.push('--resume', opts.resumeSessionId)
  return args
}

// Server name registered in the generated mcp-config. No hyphen so the derived
// tool ids (`mcp__<server>__<tool>`) stay unambiguous in --allowedTools.
export const MCP_SERVER_NAME = 'datapeek'

// Only the read tools are exposed to the agent — never execute_statement (which
// would trip the in-app approval dialog and can't be answered in headless mode).
export const MCP_READ_TOOLS = ['list_schemas', 'run_query', 'explain_query'] as const

/** Fully-qualified Claude Code tool ids for our MCP read tools. */
export function mcpAllowedTools(serverName: string = MCP_SERVER_NAME): string[] {
  return MCP_READ_TOOLS.map((t) => `mcp__${serverName}__${t}`)
}

/** Inline mcp-config JSON pointing Claude Code at data-peek's running MCP server. */
export function buildMcpConfigJson(
  info: McpRuntimeInfo,
  serverName: string = MCP_SERVER_NAME
): string {
  return JSON.stringify({
    mcpServers: {
      [serverName]: {
        type: 'http',
        url: info.url,
        headers: { Authorization: `Bearer ${info.token}` }
      }
    }
  })
}

/**
 * Build the argv for an agentic call: same structured one-shot, plus the MCP
 * server and an allow-list of just its read tools so it runs non-interactively.
 * Pure — unit-tested.
 */
export function buildAgenticHarnessArgs(
  userPrompt: string,
  systemPrompt: string,
  model: string,
  mcpConfigJson: string,
  allowedTools: string[],
  opts?: HarnessArgOpts
): string[] {
  return [
    ...buildHarnessArgs(userPrompt, systemPrompt, model, opts),
    '--mcp-config',
    mcpConfigJson,
    // Use ONLY this config's MCP server — ignore the user's global/project MCP
    // servers. Without this, a pre-existing 'data-peek' entry collides and the
    // read tools land under a different namespace than our allow-list, so they
    // require approval and get denied in headless mode (grounding silently fails).
    '--strict-mcp-config',
    '--allowedTools',
    allowedTools.join(',')
  ]
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

/**
 * Parse `claude -p --output-format json` stdout into an AIStructuredResponse.
 * The outer object carries metadata + a `result` string; the model's actual
 * reply is that string, which must contain the JSON matching responseSchema.
 * Pure — unit-tested against real and malformed outputs.
 */
export function parseHarnessResult(stdout: string): AIStructuredResponse {
  let outer: unknown
  try {
    outer = JSON.parse(stdout)
  } catch {
    throw new Error('Claude CLI did not return valid JSON (is --output-format json supported?)')
  }
  return parseResultEnvelope(outer)
}

/**
 * Parse an already-decoded CLI result envelope into an AIStructuredResponse.
 * Shared by the one-shot (`json`) and streaming (`stream-json`) paths — the
 * streaming path hands us the parsed `result` frame directly.
 */
export function parseResultEnvelope(outer: unknown): AIStructuredResponse {
  const envelope = (outer ?? {}) as Record<string, unknown>
  if (envelope.is_error) {
    const msg =
      typeof envelope.result === 'string' ? envelope.result : 'Claude CLI reported an error'
    throw new Error(msg)
  }

  // Native structured output (--json-schema): the CLI already validated the
  // object against our schema, so use it directly. Fall back to parsing the
  // `result` text for older CLIs / the non-schema path.
  let parsed: unknown
  if (envelope.structured_output && typeof envelope.structured_output === 'object') {
    parsed = envelope.structured_output
  } else {
    const resultText = typeof envelope.result === 'string' ? envelope.result : ''
    if (!resultText.trim()) throw new Error('Claude CLI returned an empty result')
    try {
      parsed = JSON.parse(extractJsonObject(resultText))
    } catch {
      throw new Error('Could not parse a JSON response from the model output')
    }
  }

  const validated = responseSchema.safeParse(parsed)
  if (!validated.success) {
    throw new Error(
      `Model response did not match the expected schema: ${
        validated.error.issues[0]?.message ?? 'invalid shape'
      }`
    )
  }
  return normalizeStructuredResponse(validated.data)
}

interface RunResult {
  stdout: string
  stderr: string
  code: number | null
}

/**
 * Env for the spawned CLI. We deliberately DROP ANTHROPIC_API_KEY /
 * ANTHROPIC_AUTH_TOKEN so `claude` uses its own configured login (the user's
 * claude.ai subscription) instead of whatever API key happens to be in the
 * environment — the whole point of BYOH is to ride the local CLI's auth.
 * (Driving a subscription from a third-party app is a ToS gray area; that's an
 * accepted product decision here, see the claude-cli provider notes.)
 */
function harnessEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = { ...process.env, PATH: augmentedPath() }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  return env as NodeJS.ProcessEnv
}

/** Spawn a process with the augmented PATH and the CLI's own auth. */
function runProcess(bin: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      env: harnessEnv(),
      shell: false
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Claude CLI timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)

    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(
        (err as NodeJS.ErrnoException).code === 'ENOENT'
          ? new Error('Claude CLI not found. Install it and run `claude` once to sign in.')
          : err
      )
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, code })
    })
  })
}

export interface HarnessDetection {
  available: boolean
  path?: string
  version?: string
  error?: string
}

/** Detect whether the user has a usable `claude` CLI installed. */
export async function detectClaudeCli(): Promise<HarnessDetection> {
  const bin = resolveClaudeBinary()
  try {
    const { stdout, code } = await runProcess(bin, ['--version'], DETECT_TIMEOUT_MS)
    if (code !== 0) return { available: false, path: bin, error: 'claude --version failed' }
    return { available: true, path: bin, version: stdout.trim() }
  } catch (err) {
    return { available: false, error: err instanceof Error ? err.message : String(err) }
  }
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
 * Instruction that turns on Phase 2: tells the model it can query the live DB
 * through the MCP tools and should ground its answer before replying.
 */
export function buildAgenticInstruction(connectionId: string): string {
  return `

## Live database access
You can query THIS database directly with your MCP tools (list_schemas, run_query, explain_query). Use connectionId "${connectionId}" for every call — do not call list_connections. Ground your answer in the real database: confirm table and column names, and where useful run or EXPLAIN the query (reads execute in a read-only, always-rolled-back transaction capped at 500 rows) before answering. Then reply with the JSON contract below, putting the verified SQL in the "sql" field.`
}

/**
 * Generate a structured chat response by driving the user's local `claude` CLI.
 *
 * When data-peek's MCP server is running and the chat is on a saved connection,
 * the harness runs *agentically* — it can query the live DB through the MCP read
 * tools to ground its answer — then returns the same structured contract. Falls
 * back to one-shot generation otherwise.
 */
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

/** num_turns + permission-denial count + session id from a decoded CLI envelope. */
function readEnvelopeStatsFromObject(env: Record<string, unknown>): {
  turns?: number
  denials: number
  sessionId?: string
} {
  const turns = typeof env.num_turns === 'number' ? env.num_turns : undefined
  const denials = Array.isArray(env.permission_denials) ? env.permission_denials.length : 0
  const sessionId = typeof env.session_id === 'string' ? env.session_id : undefined
  return { turns, denials, sessionId }
}

/** Read num_turns + permission-denial count + session id from the CLI envelope. */
function readEnvelopeStats(stdout: string): {
  turns?: number
  denials: number
  sessionId?: string
} {
  try {
    return readEnvelopeStatsFromObject(JSON.parse(stdout) as Record<string, unknown>)
  } catch {
    return { denials: 0 }
  }
}

/**
 * "Grounded" only if agentic AND the model actually took tool round-trips
 * (turns > 1) AND no tool call was denied — a denied read means it couldn't
 * query, so claiming "grounded" would be false.
 */
function isGrounded(agentic: boolean, turns: number | undefined, denials: number): boolean {
  return agentic && (turns ?? 0) > 1 && denials === 0
}

export async function generateChatResponseViaHarness(
  config: AIConfig,
  messages: AIMessage[],
  schemas: SchemaInfo[],
  dbType: string,
  connectionId?: string
): Promise<{ success: boolean; data?: AIStructuredResponse; error?: string; meta?: HarnessMeta }> {
  try {
    const bin = resolveClaudeBinary()
    const model = config.model || DEFAULT_MODELS['claude-cli']
    const userPrompt = buildUserPrompt(messages)

    const mcp = getMcpRuntimeInfo()
    // Agentic mode needs both a running MCP server and a saved connection the
    // server can address by id.
    const agentic = mcp !== null && !!connectionId

    let args: string[]
    let timeoutMs: number
    // Native structured output via --json-schema (no prose-only instruction needed).
    if (agentic && mcp && connectionId) {
      const systemPrompt =
        buildSystemPrompt(schemas, dbType) + buildAgenticInstruction(connectionId)
      args = buildAgenticHarnessArgs(
        userPrompt,
        systemPrompt,
        model,
        buildMcpConfigJson(mcp),
        mcpAllowedTools(),
        { jsonSchema: RESPONSE_JSON_SCHEMA_STRING }
      )
      timeoutMs = AGENTIC_TIMEOUT_MS
    } else {
      const systemPrompt = buildSystemPrompt(schemas, dbType)
      args = buildHarnessArgs(userPrompt, systemPrompt, model, {
        jsonSchema: RESPONSE_JSON_SCHEMA_STRING
      })
      timeoutMs = GENERATION_TIMEOUT_MS
    }

    log.debug('Running claude CLI', { bin, model, agentic })
    const { stdout, stderr, code } = await runProcess(bin, args, timeoutMs)
    // The CLI puts its real error in the stdout JSON envelope (e.g. is_error +
    // "Credit balance is too low") even when it exits non-zero — stderr usually
    // only carries warnings. Parse stdout first so the user sees the actual
    // reason; fall back to stderr/exit code only when there's no output.
    if (stdout.trim()) {
      const data = parseHarnessResult(stdout)
      const { turns, denials, sessionId } = readEnvelopeStats(stdout)
      const grounded = isGrounded(agentic, turns, denials)
      return { success: true, data, meta: { grounded, agentic, turns, sessionId } }
    }
    const detail = stderr.trim() || `exited with code ${code}`
    throw new Error(`Claude CLI failed: ${detail}`)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('generateChatResponseViaHarness error:', message)
    return { success: false, error: message }
  }
}

/**
 * Spawn the CLI and deliver each NDJSON line to `onLine` as it arrives. Buffers
 * across chunk boundaries so a line split across two `data` events is only
 * parsed once complete. Non-JSON noise lines are skipped.
 */
function runProcessStreaming(
  bin: string,
  args: string[],
  timeoutMs: number,
  onLine: (obj: unknown) => void
): Promise<{ stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: harnessEnv(), shell: false })
    let stderr = ''
    let buf = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Claude CLI timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)

    const consume = (chunk: string): void => {
      buf += chunk
      let nl: number
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        try {
          onLine(JSON.parse(line))
        } catch {
          /* ignore a non-JSON noise line */
        }
      }
    }

    child.stdout.on('data', (d) => consume(d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(
        (err as NodeJS.ErrnoException).code === 'ENOENT'
          ? new Error('Claude CLI not found. Install it and run `claude` once to sign in.')
          : err
      )
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const rest = buf.trim()
      if (rest) {
        try {
          onLine(JSON.parse(rest))
        } catch {
          /* ignore trailing noise */
        }
      }
      resolve({ stderr, code })
    })
  })
}

/**
 * Streaming variant of {@link generateChatResponseViaHarness}. Same inputs,
 * same final return shape — but pushes incremental `AIChatStreamEvent`s through
 * `onEvent` as the CLI streams: the assistant prose (extracted live from the
 * partial JSON) and a label for each grounding/tool step. The authoritative
 * structured response is still parsed from the terminal `result` frame.
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
    const bin = resolveClaudeBinary()
    const model = config.model || DEFAULT_MODELS['claude-cli']
    // Resuming a session restores the prior turns server-side, so we send only
    // the latest user message instead of replaying the whole transcript.
    const userPrompt = resumeSessionId
      ? messages[messages.length - 1].content
      : buildUserPrompt(messages)

    const mcp = getMcpRuntimeInfo()
    const agentic = mcp !== null && !!connectionId

    // Native structured output via --json-schema; optional session resume.
    const argOpts: HarnessArgOpts = {
      stream: true,
      jsonSchema: RESPONSE_JSON_SCHEMA_STRING,
      resumeSessionId
    }

    let args: string[]
    let timeoutMs: number
    if (agentic && mcp && connectionId) {
      const systemPrompt =
        buildSystemPrompt(schemas, dbType) + buildAgenticInstruction(connectionId)
      args = buildAgenticHarnessArgs(
        userPrompt,
        systemPrompt,
        model,
        buildMcpConfigJson(mcp),
        mcpAllowedTools(),
        argOpts
      )
      timeoutMs = AGENTIC_TIMEOUT_MS
    } else {
      const systemPrompt = buildSystemPrompt(schemas, dbType)
      args = buildHarnessArgs(userPrompt, systemPrompt, model, argOpts)
      timeoutMs = GENERATION_TIMEOUT_MS
    }

    log.debug('Running claude CLI (streaming)', { bin, model, agentic, resume: !!resumeSessionId })

    let raw = ''
    let lastMessage = ''
    let lastActivity = ''
    let resultEnvelope: Record<string, unknown> | undefined

    const { stderr, code } = await runProcessStreaming(bin, args, timeoutMs, (obj) => {
      const info = classifyStreamLine(obj)
      // With --json-schema the reply streams as input_json_delta fragments; the
      // non-schema path streams text_delta. Either way `raw` accumulates the JSON
      // string, and extractPartialMessage surfaces the "message" field live.
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
      if (info.resultEnvelope) resultEnvelope = info.resultEnvelope
    })

    if (!resultEnvelope) {
      const detail = stderr.trim() || `exited with code ${code}`
      throw new Error(`Claude CLI failed: ${detail}`)
    }

    const data = parseResultEnvelope(resultEnvelope)
    const { turns, denials, sessionId } = readEnvelopeStatsFromObject(resultEnvelope)
    const grounded = isGrounded(agentic, turns, denials)
    return { success: true, data, meta: { grounded, agentic, turns, sessionId } }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('generateChatResponseViaHarnessStream error:', message)
    return { success: false, error: message }
  }
}

/** Parse the CLI envelope → validated DashboardSpec. */
function parseDashboardSpec(stdout: string): DashboardSpec {
  let outer: unknown
  try {
    outer = JSON.parse(stdout)
  } catch {
    throw new Error('Claude CLI did not return valid JSON')
  }
  const envelope = (outer ?? {}) as Record<string, unknown>
  if (envelope.is_error) {
    throw new Error(typeof envelope.result === 'string' ? envelope.result : 'Claude CLI error')
  }
  const resultText = typeof envelope.result === 'string' ? envelope.result : ''
  if (!resultText.trim()) throw new Error('Claude CLI returned an empty result')
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJsonObject(resultText))
  } catch {
    throw new Error('Could not parse a dashboard spec from the model output')
  }
  const validated = dashboardSpecSchema.safeParse(parsed)
  if (!validated.success) {
    throw new Error(
      `Dashboard spec did not match the expected shape: ${
        validated.error.issues[0]?.message ?? 'invalid'
      }`
    )
  }
  return validated.data
}

/**
 * Generate a whole dashboard spec by driving the user's local `claude` CLI
 * agentically against the live DB (requires the MCP server + a saved connection).
 */
export async function generateDashboardViaHarness(
  prompt: string,
  schemas: SchemaInfo[],
  dbType: string,
  connectionId: string
): Promise<{ success: boolean; spec?: DashboardSpec; error?: string }> {
  try {
    const mcp = getMcpRuntimeInfo()
    if (!mcp) {
      return {
        success: false,
        error: 'Enable the MCP server so the assistant can query your database.'
      }
    }
    const bin = resolveClaudeBinary()
    const model = DEFAULT_MODELS['claude-cli']
    const systemPrompt =
      buildDashboardPrompt(schemas, dbType) +
      `\n\nUse connectionId "${connectionId}" for every tool call; do not call list_connections. Verify each widget's SQL against the live database before returning.`
    const userPrompt = prompt.trim() || 'Design a useful overview dashboard for this database.'
    const args = buildAgenticHarnessArgs(
      userPrompt,
      systemPrompt,
      model,
      buildMcpConfigJson(mcp),
      mcpAllowedTools()
    )
    log.debug('Running claude CLI (dashboard)', { bin, model })
    const { stdout, stderr, code } = await runProcess(bin, args, DASHBOARD_TIMEOUT_MS)
    if (!stdout.trim()) {
      throw new Error(`Claude CLI failed: ${stderr.trim() || `exited with code ${code}`}`)
    }
    return { success: true, spec: parseDashboardSpec(stdout) }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('generateDashboardViaHarness error:', message)
    return { success: false, error: message }
  }
}
