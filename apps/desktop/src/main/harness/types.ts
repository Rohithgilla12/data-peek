/**
 * Bring-your-own-harness (BYOH) core types. A harness is the user's own locally
 * installed agent CLI (claude, codex, ...) that data-peek drives as an
 * orchestrator. The adapter seam mirrors the DatabaseAdapter pattern: pure
 * request building + a per-run stream collector per CLI, with spawning,
 * validation, and grounded-ness rules owned by the shared service.
 */

import type { McpRuntimeInfo } from '../mcp-runtime'

export type HarnessProviderId = 'claude-cli' | 'codex-cli' | 'antigravity-cli'

export interface HarnessCapabilities {
  /** Token-level partial messages while generating (vs message-at-completion). */
  streaming: boolean
  /** Multi-turn conversation memory via a CLI session id. */
  resume: boolean
  /** Trusted for whole-dashboard generation. */
  dashboard: boolean
  /** Can ground answers against the live DB via MCP tool calls in headless mode. */
  agentic: boolean
}

export interface HarnessDetection {
  available: boolean
  path?: string
  version?: string
  error?: string
}

export interface HarnessInput {
  kind: 'chat' | 'dashboard'
  userPrompt: string
  systemPrompt: string
  /** '' or 'default' means "use the CLI's own default model". */
  model: string
  /** Serialized JSON Schema for native structured output; omit to skip. */
  jsonSchema?: string
  stream: boolean
  resumeSessionId?: string
  /** Present when the run should ground against the live DB via our MCP server. */
  mcp?: McpRuntimeInfo & { connectionId: string }
  /** Per-run scratch dir, created by the service and removed after the run. */
  workDir: string
}

export interface HarnessTempFile {
  path: string
  content: string
}

/** Fully resolved spawn recipe — the pure output of buildRequest. */
export interface HarnessRequest {
  binary: string
  args: string[]
  env: NodeJS.ProcessEnv
  /** Working directory for the child; for CLIs without a --cd flag. */
  cwd?: string
  /** Written by the runner before spawn and deleted after the run. */
  tempFiles?: HarnessTempFile[]
}

/** UI-relevant classification of one stdout line. Any field may be absent. */
export interface HarnessStreamInfo {
  /** Incremental assistant prose. */
  textDelta?: string
  /** Incremental structured-output JSON (accumulated, it reconstructs the reply). */
  jsonDelta?: string
  /** Human label for a grounding/tool step that just started. */
  toolLabel?: string
}

export interface HarnessRunStats {
  /** Grounding tool calls that actually happened. */
  toolRoundTrips: number
  /** Tool calls that were denied/failed — grounding can't be claimed. */
  denials: number
  /** CLI session id for conversation memory on the next turn. */
  sessionId?: string
}

export interface HarnessResult {
  /** Reply as a JSON string or an already-decoded object; the service validates. */
  payload: unknown
  stats: HarnessRunStats
}

export interface HarnessExit {
  code: number | null
  stderr: string
}

/** Stateful collector for one CLI run. */
export interface HarnessRun {
  onLine(line: unknown): HarnessStreamInfo
  /** Called at process close. Throws an Error with a user-facing message on failure. */
  finish(exit: HarnessExit): HarnessResult
}

export interface HarnessAdapter {
  id: HarnessProviderId
  /** Human name used in error messages, e.g. 'Claude CLI'. */
  cliLabel: string
  /** Message for ENOENT, e.g. install + sign-in instructions. */
  notFoundMessage: string
  capabilities: HarnessCapabilities
  detect(): Promise<HarnessDetection>
  buildRequest(input: HarnessInput): HarnessRequest
  createRun(): HarnessRun
}
