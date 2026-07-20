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
import type { AIConfig, AIMessage, SchemaInfo, AIStructuredResponse } from '@shared/index'
import { DEFAULT_MODELS } from '@shared/index'
import {
  buildSystemPrompt,
  responseSchema,
  normalizeStructuredResponse,
  buildDashboardPrompt,
  dashboardSpecSchema,
  type DashboardSpec
} from './ai-schema'
import { getMcpRuntimeInfo, type McpRuntimeInfo } from './mcp-runtime'
import { createLogger } from './lib/logger'

const log = createLogger('harness-service')

const GENERATION_TIMEOUT_MS = 120_000
// Agentic runs make several tool round-trips, so they get a longer ceiling.
const AGENTIC_TIMEOUT_MS = 180_000
// Generating a whole dashboard verifies several queries — allow more time.
const DASHBOARD_TIMEOUT_MS = 300_000
const DETECT_TIMEOUT_MS = 10_000

// Instruction appended to the schema-aware system prompt so the CLI returns a
// bare JSON object (generateObject enforces this structurally; the CLI can't).
const JSON_ONLY_INSTRUCTION = `

## Output contract (STRICT)
Respond with ONLY a single JSON object matching the response format above.
No prose, no explanation outside the JSON, no markdown code fences. The first
character of your reply must be "{" and the last must be "}".`

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

/** Build the argv for a one-shot structured generation call. Pure — unit-tested. */
export function buildHarnessArgs(
  userPrompt: string,
  systemPrompt: string,
  model: string
): string[] {
  return [
    '-p',
    userPrompt,
    '--output-format',
    'json',
    '--append-system-prompt',
    systemPrompt,
    '--model',
    model
  ]
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
  allowedTools: string[]
): string[] {
  return [
    ...buildHarnessArgs(userPrompt, systemPrompt, model),
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
  const envelope = (outer ?? {}) as Record<string, unknown>
  if (envelope.is_error) {
    const msg =
      typeof envelope.result === 'string' ? envelope.result : 'Claude CLI reported an error'
    throw new Error(msg)
  }
  const resultText = typeof envelope.result === 'string' ? envelope.result : ''
  if (!resultText.trim()) throw new Error('Claude CLI returned an empty result')

  let parsed: unknown
  try {
    parsed = JSON.parse(extractJsonObject(resultText))
  } catch {
    throw new Error('Could not parse a JSON response from the model output')
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
}

/** Read num_turns + permission-denial count from the CLI's JSON envelope. */
function readEnvelopeStats(stdout: string): { turns?: number; denials: number } {
  try {
    const env = JSON.parse(stdout) as Record<string, unknown>
    const turns = typeof env.num_turns === 'number' ? env.num_turns : undefined
    const denials = Array.isArray(env.permission_denials) ? env.permission_denials.length : 0
    return { turns, denials }
  } catch {
    return { denials: 0 }
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
    const bin = resolveClaudeBinary()
    const model = config.model || DEFAULT_MODELS['claude-cli']
    const userPrompt = buildUserPrompt(messages)

    const mcp = getMcpRuntimeInfo()
    // Agentic mode needs both a running MCP server and a saved connection the
    // server can address by id.
    const agentic = mcp !== null && !!connectionId

    let args: string[]
    let timeoutMs: number
    if (agentic && mcp && connectionId) {
      const systemPrompt =
        buildSystemPrompt(schemas, dbType) +
        buildAgenticInstruction(connectionId) +
        JSON_ONLY_INSTRUCTION
      args = buildAgenticHarnessArgs(
        userPrompt,
        systemPrompt,
        model,
        buildMcpConfigJson(mcp),
        mcpAllowedTools()
      )
      timeoutMs = AGENTIC_TIMEOUT_MS
    } else {
      const systemPrompt = buildSystemPrompt(schemas, dbType) + JSON_ONLY_INSTRUCTION
      args = buildHarnessArgs(userPrompt, systemPrompt, model)
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
      const { turns, denials } = readEnvelopeStats(stdout)
      // "Grounded" only if agentic AND the model actually took tool round-trips
      // (turns > 1) AND no tool call was denied — a denied read means it couldn't
      // query, so claiming "grounded" would be false.
      const grounded = agentic && (turns ?? 0) > 1 && denials === 0
      return { success: true, data, meta: { grounded, agentic, turns } }
    }
    const detail = stderr.trim() || `exited with code ${code}`
    throw new Error(`Claude CLI failed: ${detail}`)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('generateChatResponseViaHarness error:', message)
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
