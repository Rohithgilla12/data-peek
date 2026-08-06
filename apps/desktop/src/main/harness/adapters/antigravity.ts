/**
 * Google Antigravity CLI (`agy`) adapter. Verified against agy 1.1.8:
 * `--json-schema` only works with `--output-format stream-json` (plain json
 * mode returns an empty response), so every run streams. The validated reply
 * arrives on the terminal result event as `structured_output`, with the raw
 * `response` text as fallback. There is no --append-system-prompt (we prepend
 * instructions into the prompt body) and no --cd flag (the runner sets the
 * child's cwd to the per-run work dir). Resume rides `--conversation <id>`.
 *
 * agy has MCP internally (call_mcp_tool) but it is config-file based with a
 * request-review permission mode and only a blanket
 * --dangerously-skip-permissions override, so — like codex — agentic grounding
 * stays off until a safe headless approval path exists.
 */

import { augmentedPath, detectBinary, resolveBinary } from '../runner'
import type { HarnessAdapter, HarnessInput, HarnessRun, HarnessStreamInfo } from '../types'

const NOT_FOUND = 'Antigravity CLI not found. Install it and run `agy` once to sign in.'

function composePrompt(systemPrompt: string, userPrompt: string): string {
  return `## Instructions\n${systemPrompt}\n\n## Request\n${userPrompt}`
}

/**
 * Gemini's structured-output dialect rejects null inside enum arrays
 * (live-bisected on agy 1.1.8: the untouched chat schema errors in ~1s, and
 * stripping enum nulls is the single change that fixes it). Nullability is
 * preserved by the fields' type unions (e.g. ["string", "null"]).
 */
export function toGeminiSchema(schemaJson: string): string {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip)
    if (!node || typeof node !== 'object') return node
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node)) {
      out[key] =
        key === 'enum' && Array.isArray(value) ? value.filter((v) => v !== null) : strip(value)
    }
    return out
  }
  try {
    return JSON.stringify(strip(JSON.parse(schemaJson)))
  } catch {
    return schemaJson
  }
}

export function buildAntigravityArgs(input: HarnessInput): string[] {
  // A resumed conversation already carries the instructions.
  const prompt = input.resumeSessionId
    ? input.userPrompt
    : composePrompt(input.systemPrompt, input.userPrompt)
  const args = ['-p', prompt, '--output-format', 'stream-json', '--sandbox']
  if (input.resumeSessionId) args.push('--conversation', input.resumeSessionId)
  if (input.jsonSchema) args.push('--json-schema', toGeminiSchema(input.jsonSchema))
  if (input.model && input.model !== 'default') args.push('--model', input.model)
  return args
}

function antigravityEnv(): NodeJS.ProcessEnv {
  // Drop API keys so agy uses its own configured login — the whole point of
  // BYOH is to ride the local CLI's auth, mirroring the other adapters.
  const env: Record<string, string | undefined> = { ...process.env, PATH: augmentedPath() }
  delete env.GEMINI_API_KEY
  delete env.GOOGLE_API_KEY
  return env as NodeJS.ProcessEnv
}

function createAntigravityRun(): HarnessRun {
  let result: Record<string, unknown> | undefined

  return {
    onLine(line): HarnessStreamInfo {
      const info: HarnessStreamInfo = {}
      if (!line || typeof line !== 'object') return info
      const evt = line as Record<string, unknown>
      if (evt.event === 'step_update') {
        const step = (evt.step_update ?? {}) as Record<string, unknown>
        if (step.step_type === 'agent_response' && typeof step.text_delta === 'string') {
          // With --json-schema the reply text IS the structured JSON, so the
          // service can live-extract the "message" field from the deltas.
          info.jsonDelta = step.text_delta
        }
      }
      if (evt.event === 'result' && evt.result && typeof evt.result === 'object') {
        result = evt.result as Record<string, unknown>
      }
      return info
    },
    finish({ code, stderr }) {
      if (!result) {
        throw new Error(
          `Antigravity CLI returned no result: ${stderr.trim() || `exited with code ${code}`}`
        )
      }
      if (result.status !== 'SUCCESS') {
        // The dedicated error field is the stronger signal — response may hold
        // a stale partial reply when both are populated.
        const detail =
          (typeof result.error === 'string' && result.error.trim()) ||
          (typeof result.response === 'string' && result.response.trim()) ||
          `status ${String(result.status)}`
        throw new Error(detail)
      }
      const sessionId =
        typeof result.conversation_id === 'string' ? result.conversation_id : undefined
      const payload =
        result.structured_output && typeof result.structured_output === 'object'
          ? result.structured_output
          : result.response
      return { payload, stats: { toolRoundTrips: 0, denials: 0, sessionId } }
    }
  }
}

export const antigravityAdapter: HarnessAdapter = {
  id: 'antigravity-cli',
  cliLabel: 'Antigravity CLI',
  notFoundMessage: NOT_FOUND,
  // Deltas arrive per completed step, not token-by-token, so streaming stays
  // off; agentic/dashboard wait on a safe headless tool-approval path.
  capabilities: { streaming: false, resume: true, dashboard: false, agentic: false },
  detect: () => detectBinary('agy', 'DATA_PEEK_AGY_PATH', NOT_FOUND),
  buildRequest: (input) => ({
    binary: resolveBinary('agy', 'DATA_PEEK_AGY_PATH'),
    args: buildAntigravityArgs(input),
    env: antigravityEnv(),
    cwd: input.workDir
  }),
  createRun: createAntigravityRun
}
