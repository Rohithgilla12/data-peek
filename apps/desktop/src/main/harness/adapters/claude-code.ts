/**
 * Bring-your-own-harness (BYOH) — Claude Code CLI adapter.
 *
 * Instead of calling an AI SDK model, this shells out to the user's *own*
 * locally installed `claude` binary and lets it own authentication (their
 * subscription or their key — data-peek never stores or injects a token). We
 * drive the official CLI as an orchestrator; we do not reimplement the agent
 * loop or reuse OAuth tokens.
 */

import { augmentedPath, detectBinary, resolveBinary } from '../runner'
import { toolLabel } from '../tool-labels'
import type {
  HarnessAdapter,
  HarnessInput,
  HarnessRequest,
  HarnessRun,
  HarnessStreamInfo
} from '../types'

const NOT_FOUND = 'Claude CLI not found. Install it and run `claude` once to sign in.'

// Server name registered in the generated mcp-config. No hyphen so the derived
// tool ids (`mcp__<server>__<tool>`) stay unambiguous in --allowedTools.
const MCP_SERVER_NAME = 'datapeek'

// Only the read tools are exposed to the agent — never execute_statement (which
// would trip the in-app approval dialog and can't be answered in headless mode).
export const MCP_READ_TOOLS = ['list_schemas', 'run_query', 'explain_query'] as const

/** Fully-qualified Claude Code tool ids for our MCP read tools. */
export function claudeAllowedTools(serverName: string = MCP_SERVER_NAME): string[] {
  return MCP_READ_TOOLS.map((t) => `mcp__${serverName}__${t}`)
}

/** Inline mcp-config JSON pointing Claude Code at data-peek's running MCP server. */
export function buildClaudeMcpConfigJson(url: string, token: string): string {
  return JSON.stringify({
    mcpServers: {
      [MCP_SERVER_NAME]: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } }
    }
  })
}

/** Build the argv for a `claude` invocation. Pure — unit-tested. */
export function buildClaudeArgs(input: HarnessInput): string[] {
  const args = [
    '-p',
    input.userPrompt,
    '--output-format',
    input.stream ? 'stream-json' : 'json',
    '--append-system-prompt',
    input.systemPrompt,
    '--model',
    input.model
  ]
  // stream-json requires --verbose; token-level deltas require partial messages.
  if (input.stream) args.push('--verbose', '--include-partial-messages')
  // Native structured output: the CLI constrains + validates the reply to schema.
  if (input.jsonSchema) args.push('--json-schema', input.jsonSchema)
  // Multi-turn memory: continue the prior conversation server-side.
  if (input.resumeSessionId) args.push('--resume', input.resumeSessionId)
  if (input.mcp) {
    args.push(
      '--mcp-config',
      buildClaudeMcpConfigJson(input.mcp.url, input.mcp.token),
      // Use ONLY this config's MCP server — ignore the user's global/project MCP
      // servers. Without this, a pre-existing 'data-peek' entry collides and the
      // read tools land under a different namespace than our allow-list, so they
      // require approval and get denied in headless mode (grounding silently fails).
      '--strict-mcp-config',
      '--allowedTools',
      claudeAllowedTools().join(',')
    )
  }
  return args
}

/**
 * Env for the spawned CLI. We deliberately DROP ANTHROPIC_API_KEY /
 * ANTHROPIC_AUTH_TOKEN so `claude` uses its own configured login (the user's
 * claude.ai subscription) instead of whatever API key happens to be in the
 * environment — the whole point of BYOH is to ride the local CLI's auth.
 * (Driving a subscription from a third-party app is a ToS gray area; that's an
 * accepted product decision here, see the claude-cli provider notes.)
 */
function claudeEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = { ...process.env, PATH: augmentedPath() }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  return env as NodeJS.ProcessEnv
}

/**
 * Classify one parsed NDJSON line from the CLI's stream-json output. Only the
 * frames we care about produce a non-empty result; everything else (rate_limit,
 * hook_*, status, message_start/stop, user tool-results) is ignored.
 */
export function classifyClaudeLine(
  obj: unknown
): HarnessStreamInfo & { resultEnvelope?: Record<string, unknown> } {
  const info: HarnessStreamInfo & { resultEnvelope?: Record<string, unknown> } = {}
  if (!obj || typeof obj !== 'object') return info
  const line = obj as Record<string, unknown>

  if (line.type === 'stream_event') {
    const event = line.event as
      | { type?: string; delta?: { type?: string; text?: unknown; partial_json?: unknown } }
      | undefined
    if (event?.type === 'content_block_delta') {
      if (event.delta?.type === 'text_delta') {
        info.textDelta = String(event.delta.text ?? '')
      } else if (event.delta?.type === 'input_json_delta') {
        info.jsonDelta = String(event.delta.partial_json ?? '')
      }
    }
    return info
  }

  if (line.type === 'assistant') {
    const message = line.message as { content?: unknown } | undefined
    const content = message?.content
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block && typeof block === 'object') {
          const b = block as { type?: string; name?: unknown }
          if (b.type === 'tool_use' && typeof b.name === 'string') {
            const label = toolLabel(b.name)
            // Skip internal/output tools (e.g. StructuredOutput) — only real
            // grounding tools become activity.
            if (label) {
              info.toolLabel = label
              break
            }
          }
        }
      }
    }
    return info
  }

  if (line.type === 'result') {
    info.resultEnvelope = line
    return info
  }

  return info
}

function createClaudeRun(): HarnessRun {
  let resultEnvelope: Record<string, unknown> | undefined
  return {
    onLine(line) {
      const info = classifyClaudeLine(line)
      if (info.resultEnvelope) resultEnvelope = info.resultEnvelope
      return { textDelta: info.textDelta, jsonDelta: info.jsonDelta, toolLabel: info.toolLabel }
    },
    finish({ code, stderr }) {
      if (!resultEnvelope) {
        throw new Error(`Claude CLI failed: ${stderr.trim() || `exited with code ${code}`}`)
      }
      if (resultEnvelope.is_error) {
        const msg =
          typeof resultEnvelope.result === 'string'
            ? resultEnvelope.result
            : 'Claude CLI reported an error'
        throw new Error(msg)
      }
      const payload =
        resultEnvelope.structured_output && typeof resultEnvelope.structured_output === 'object'
          ? resultEnvelope.structured_output
          : resultEnvelope.result
      const turns =
        typeof resultEnvelope.num_turns === 'number' ? resultEnvelope.num_turns : undefined
      const denials = Array.isArray(resultEnvelope.permission_denials)
        ? resultEnvelope.permission_denials.length
        : 0
      const sessionId =
        typeof resultEnvelope.session_id === 'string' ? resultEnvelope.session_id : undefined
      return {
        payload,
        stats: { toolRoundTrips: Math.max(0, (turns ?? 1) - 1), denials, sessionId }
      }
    }
  }
}

export const claudeCodeAdapter: HarnessAdapter = {
  id: 'claude-cli',
  cliLabel: 'Claude CLI',
  notFoundMessage: NOT_FOUND,
  capabilities: { streaming: true, resume: true, dashboard: true, agentic: true },
  detect: () => detectBinary('claude', 'DATA_PEEK_CLAUDE_PATH', NOT_FOUND),
  buildRequest: (input): HarnessRequest => ({
    binary: resolveBinary('claude', 'DATA_PEEK_CLAUDE_PATH'),
    args: buildClaudeArgs(input),
    env: claudeEnv()
  }),
  createRun: createClaudeRun
}
