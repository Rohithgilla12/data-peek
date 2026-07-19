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
import { buildSystemPrompt, responseSchema, normalizeStructuredResponse } from './ai-schema'
import { createLogger } from './lib/logger'

const log = createLogger('harness-service')

const GENERATION_TIMEOUT_MS = 120_000
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

/** Spawn a process with the augmented PATH and the user's env (so CLI auth works). */
function runProcess(bin: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      env: { ...process.env, PATH: augmentedPath() },
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
 * Generate a structured chat response by driving the user's local `claude` CLI.
 */
export async function generateChatResponseViaHarness(
  config: AIConfig,
  messages: AIMessage[],
  schemas: SchemaInfo[],
  dbType: string
): Promise<{ success: boolean; data?: AIStructuredResponse; error?: string }> {
  try {
    const bin = resolveClaudeBinary()
    const model = config.model || DEFAULT_MODELS['claude-cli']
    const systemPrompt = buildSystemPrompt(schemas, dbType) + JSON_ONLY_INSTRUCTION
    const args = buildHarnessArgs(buildUserPrompt(messages), systemPrompt, model)

    log.debug('Running claude CLI', { bin, model })
    const { stdout, stderr, code } = await runProcess(bin, args, GENERATION_TIMEOUT_MS)
    if (code !== 0) {
      const detail = stderr.trim() || `exited with code ${code}`
      throw new Error(`Claude CLI failed: ${detail}`)
    }
    return { success: true, data: parseHarnessResult(stdout) }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('generateChatResponseViaHarness error:', message)
    return { success: false, error: message }
  }
}
