/**
 * Codex CLI adapter. Differences from Claude Code that shape this file:
 * no --append-system-prompt (we prepend instructions into the prompt body),
 * --output-schema takes a FILE path (we stage it in the per-run work dir),
 * output is always JSONL via --json (no buffered envelope), the session id
 * arrives on thread.started, and item-level `error` items are non-fatal
 * warnings — only a top-level error event or turn.failed sinks the run.
 * Verified against codex-cli 0.146.0.
 */

import { join } from 'path'
import { augmentedPath, detectBinary, resolveBinary } from '../runner'
import { toolLabel } from '../tool-labels'
import type { HarnessAdapter, HarnessInput, HarnessRun, HarnessStreamInfo } from '../types'

const NOT_FOUND = 'Codex CLI not found. Install it and run `codex login` once to sign in.'

const CODEX_SCHEMA_FILENAME = 'output-schema.json'

/**
 * OpenAI structured outputs run in strict mode: every object level must list
 * ALL of its property keys in `required` — optionality is expressed through
 * nullable types, not by omission. Claude's --json-schema accepts standard
 * JSON Schema, so this widening lives here rather than in ai-schema. Verified
 * live against codex-cli 0.146.0: the untransformed schema 400s with
 * invalid_json_schema ("Missing 'chartType'"); the widened one round-trips,
 * with the model emitting explicit nulls that normalizeStructuredResponse
 * already maps.
 */
export function toOpenAiStrictSchema(schemaJson: string): string {
  const widen = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(widen)
    if (!node || typeof node !== 'object') return node
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node)) out[key] = widen(value)
    if (out.properties && typeof out.properties === 'object') {
      out.required = Object.keys(out.properties as Record<string, unknown>)
    }
    return out
  }
  try {
    return JSON.stringify(widen(JSON.parse(schemaJson)))
  } catch {
    return schemaJson
  }
}

export function composeCodexPrompt(systemPrompt: string, userPrompt: string): string {
  return `## Instructions\n${systemPrompt}\n\n## Request\n${userPrompt}`
}

export function buildCodexArgs(input: HarnessInput): string[] {
  const args = ['exec']
  // A resumed session already carries the instructions, sandbox, and cwd —
  // `codex exec resume` rejects --sandbox/--cd, so only fresh runs set them.
  if (input.resumeSessionId) {
    args.push('resume', input.resumeSessionId, input.userPrompt)
  } else {
    args.push(composeCodexPrompt(input.systemPrompt, input.userPrompt))
  }
  args.push('--json', '--skip-git-repo-check', '--ignore-user-config')
  if (!input.resumeSessionId) {
    args.push('--sandbox', 'read-only', '--cd', input.workDir)
  }
  if (input.jsonSchema) args.push('--output-schema', join(input.workDir, CODEX_SCHEMA_FILENAME))
  if (input.model && input.model !== 'default') args.push('--model', input.model)
  if (input.mcp) {
    args.push(
      '-c',
      `mcp_servers.datapeek.url="${input.mcp.url}"`,
      // Token comes from the child env, never argv (argv is visible in `ps`).
      '-c',
      'mcp_servers.datapeek.bearer_token_env_var="DATA_PEEK_MCP_TOKEN"',
      '-c',
      'mcp_servers.datapeek.enabled_tools=["list_schemas","run_query","explain_query"]'
    )
  }
  return args
}

function codexEnv(mcpToken?: string): NodeJS.ProcessEnv {
  // Drop the API key so codex uses its own configured login — the whole point
  // of BYOH is to ride the local CLI's auth, mirroring the claude adapter.
  const env: Record<string, string | undefined> = { ...process.env, PATH: augmentedPath() }
  delete env.OPENAI_API_KEY
  if (mcpToken) env.DATA_PEEK_MCP_TOKEN = mcpToken
  return env as NodeJS.ProcessEnv
}

/** Unwrap codex's nested error JSON into something a person can act on. */
export function friendlyCodexError(raw: string): string {
  let status: number | undefined
  let message = raw
  try {
    const outer = JSON.parse(raw) as { status?: number; error?: { message?: string } }
    status = outer.status
    if (typeof outer.error?.message === 'string') message = outer.error.message
  } catch {
    /* plain string — use as-is */
  }
  if (status === 401 || /unauthorized|not signed in|login/i.test(message)) {
    return 'Codex CLI is not signed in. Run `codex login` and try again.'
  }
  return message
}

function createCodexRun(): HarnessRun {
  let sessionId: string | undefined
  let agentMessage = ''
  let toolRoundTrips = 0
  let denials = 0
  let fatal: string | undefined

  return {
    onLine(line): HarnessStreamInfo {
      const info: HarnessStreamInfo = {}
      if (!line || typeof line !== 'object') return info
      const evt = line as Record<string, unknown>
      if (evt.type === 'thread.started' && typeof evt.thread_id === 'string') {
        sessionId = evt.thread_id
      }
      if (evt.type === 'item.started' || evt.type === 'item.completed') {
        const item = (evt.item ?? {}) as Record<string, unknown>
        if (item.type === 'mcp_tool_call') {
          const name = [item.tool, item.name, item.title].find((v) => typeof v === 'string')
          if (evt.type === 'item.started' && name) info.toolLabel = toolLabel(String(name))
          if (evt.type === 'item.completed') {
            toolRoundTrips++
            if (item.status === 'failed') denials++
          }
        }
        if (
          evt.type === 'item.completed' &&
          item.type === 'agent_message' &&
          typeof item.text === 'string'
        ) {
          agentMessage = item.text
          // Surface the reply as a json delta: with --output-schema the text IS
          // the structured JSON, so the service can live-extract the message field.
          info.jsonDelta = item.text
        }
      }
      if (evt.type === 'error' && typeof evt.message === 'string') fatal = evt.message
      if (evt.type === 'turn.failed') {
        const err = (evt.error as { message?: string } | undefined)?.message
        fatal = err ?? fatal ?? 'Codex turn failed'
      }
      return info
    },
    finish({ code, stderr }) {
      if (fatal) throw new Error(friendlyCodexError(fatal))
      if (!agentMessage.trim()) {
        throw new Error(
          `Codex CLI returned no reply: ${stderr.trim() || `exited with code ${code}`}`
        )
      }
      return { payload: agentMessage, stats: { toolRoundTrips, denials, sessionId } }
    }
  }
}

// Live-verified against codex-cli 0.146.0 on 2026-08-05: `codex exec` (headless)
// auto-cancels every MCP tool call with "user cancelled MCP tool call",
// regardless of `approval_policy="never"` or
// `mcp_servers.<id>.default_tools_approval_mode="auto"`. Upstream issue
// openai/codex#24135 is open; the only bypass is
// `--dangerously-bypass-approvals-and-sandbox`, which we reject as a silent
// default for security. So codex ships chat-only (schema-context) answers
// until upstream fixes headless approvals or the product adds an explicit
// opt-in — hence agentic: false. dashboard REQUIRES live grounding (every
// widget's SQL is meant to be verified against the DB), so it rides on the
// same flag: dashboard: false.
//
// The MCP argv/env plumbing in buildCodexArgs/codexEnv/createCodexRun below
// stays exactly as built and tested — it's correct for the day approvals
// become possible, the service just never calls buildRequest with `input.mcp`
// set for this adapter (see harness/service.ts capability gate).
export const codexAdapter: HarnessAdapter = {
  id: 'codex-cli',
  cliLabel: 'Codex CLI',
  notFoundMessage: NOT_FOUND,
  // No token-level deltas from codex --json: activity labels stream, the
  // message text lands at item.completed. resume verified in 0.146.0's exec
  // surface; if live testing disproves it, flip it here and the service + UI
  // degrade automatically.
  capabilities: { streaming: false, resume: true, dashboard: false, agentic: false },
  detect: () => detectBinary('codex', 'DATA_PEEK_CODEX_PATH', NOT_FOUND),
  buildRequest: (input) => ({
    binary: resolveBinary('codex', 'DATA_PEEK_CODEX_PATH'),
    args: buildCodexArgs(input),
    env: codexEnv(input.mcp?.token),
    tempFiles: input.jsonSchema
      ? [
          {
            path: join(input.workDir, CODEX_SCHEMA_FILENAME),
            content: toOpenAiStrictSchema(input.jsonSchema)
          }
        ]
      : []
  }),
  createRun: createCodexRun
}
