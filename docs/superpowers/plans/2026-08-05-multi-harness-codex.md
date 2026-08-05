# Multi-Harness BYOH: Codex CLI Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalise the Claude-only bring-your-own-harness (BYOH) layer into a `HarnessAdapter` abstraction and ship Codex CLI as the second harness, with structured chat + agentic MCP grounding.

**Architecture:** A generic runner (spawn, PATH, timeouts, JSONL line buffering) and orchestrator service (`src/main/harness/service.ts`) call into per-harness adapters that expose pure `buildRequest` + a stateful per-run `createRun()` collector. Zod validation and grounded-ness rules live once in the service. Spec: `docs/superpowers/specs/2026-08-05-multi-harness-codex-design.md`.

**Tech Stack:** Electron main process (Node), TypeScript strict, vitest, zod v3. No new dependencies.

## Global Constraints

- Branch: `feat/multi-harness-codex` (already created; the spec commit is on it).
- Prettier: single quotes, no semicolons, 100 char width, no trailing commas. Run `pnpm format` from `apps/desktop` if unsure.
- NEVER use banner/divider comments (`// ====== Section ======`). Plain sentence comments only, and only where the code can't say it.
- BYOH stance: data-peek never stores or injects an API token. Adapters DROP `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` (Claude) and `OPENAI_API_KEY` (Codex) from the child env so each CLI uses its own login.
- The MCP bearer token is passed to Codex via the child **env** (`DATA_PEEK_MCP_TOKEN`), never in argv (argv is world-readable via `ps`).
- All commands below run from `apps/desktop/` unless stated otherwise. Tests: `pnpm test` (vitest). Types: `pnpm typecheck`.
- All paths below are relative to `apps/desktop/` unless they start with `packages/`.
- Verified against codex-cli 0.146.0 on 2026-08-05: `codex exec --json` event shapes (fixtures below are REAL captured output), `--output-schema <file>`, `exec resume <id> <prompt>` supporting `--json`/`--output-schema`/`-c`/`--ignore-user-config` (but NOT `--sandbox`/`--cd` — a resumed session keeps those), and `mcp_servers.<name>.enabled_tools` passing `--strict-config` validation.
- Codex spawns MUST use `stdio: ['ignore', 'pipe', 'pipe']` — with an open stdin the CLI prints "Reading additional input from stdin..." and waits.
- Vitest trap (bit us in Task 2): `beforeEach(() => spawnMock.mockReset())` returns the mock, and vitest treats a function returned from a hook as a teardown callback — the mock gets invoked again after each test. Always write hook bodies in braces: `beforeEach(() => { spawnMock.mockReset() })`. When porting tests from `src/main/__tests__/harness-service.test.ts`, fix its hooks to this form.

---

### Task 1: Add `codex-cli` to the shared provider registry

**Files:**
- Modify: `packages/shared/src/index.ts` (AIProvider union ~line 73, `AI_PROVIDERS` array end ~line 370, `KEYLESS_AI_PROVIDERS` ~line 412)
- Modify: `src/main/ai-providers.ts` (the factory switch)
- Test: `src/main/__tests__/ai-providers.test.ts` (existing exhaustiveness suite)

**Interfaces:**
- Consumes: nothing new.
- Produces: `'codex-cli'` member of `AIProvider`; `HARNESS_AI_PROVIDERS: ReadonlySet<AIProvider>`; `isHarnessProvider(provider: AIProvider): boolean`; `DEFAULT_MODELS['codex-cli'] === 'default'`. Later tasks import `isHarnessProvider` from `@shared/index`.

- [ ] **Step 1: Extend the union and registry in `packages/shared/src/index.ts`**

Add to the `AIProvider` union after `'claude-cli'`:

```typescript
  // Bring-your-own-harness: drives the user's locally installed `codex` CLI,
  // which owns its own auth (ChatGPT sign-in or key). No API key stored by data-peek.
  | "codex-cli";
```

Append to `AI_PROVIDERS` after the `claude-cli` entry (before `] as const`):

```typescript
  {
    id: "codex-cli",
    name: "Codex (local CLI)",
    description: "Uses your installed `codex` CLI — no API key stored here",
    keyPrefix: null,
    keyUrl: "https://developers.openai.com/codex/cli",
    models: [
      {
        id: "default",
        name: "Codex CLI default",
        recommended: true,
        description: "Whatever your codex config uses",
      },
      { id: "gpt-5.1-codex", name: "GPT-5.1 Codex" },
      { id: "gpt-5.1-codex-mini", name: "GPT-5.1 Codex Mini", description: "Fast & cheap" },
    ],
  },
```

(The `id: "default"` sentinel means "omit `-m`, ride the user's own Codex config" — the codex adapter honours it in Task 5. `getRecommendedModel` automatically makes it `DEFAULT_MODELS['codex-cli']`.)

Extend `DEFAULT_MODELS` with `"codex-cli": getRecommendedModel("codex-cli"),` and `KEYLESS_AI_PROVIDERS` with `"codex-cli"`. Update that set's comment to mention both harnesses. Then add below `providerNeedsKey`:

```typescript
/**
 * BYOH providers: instead of an AI SDK client, data-peek shells out to the
 * user's own locally installed, locally authenticated CLI.
 */
export const HARNESS_AI_PROVIDERS: ReadonlySet<AIProvider> = new Set([
  "claude-cli",
  "codex-cli",
]);

export function isHarnessProvider(provider: AIProvider): boolean {
  return HARNESS_AI_PROVIDERS.has(provider);
}
```

(Note: `packages/shared` uses semicolons + double quotes — match the file you're in, not the desktop app's prettier config.)

- [ ] **Step 2: Run the desktop tests to see the exhaustiveness failure**

Run: `pnpm test -- ai-providers`
Expected: FAIL — the `default: never` arm in `createProviderClient` no longer compiles/covers `codex-cli` (TypeScript error via vitest, or a failing exhaustiveness test).

- [ ] **Step 3: Extend the factory switch in `src/main/ai-providers.ts`**

Add before `default:`:

```typescript
    case 'codex-cli': {
      // Not an AI SDK provider — it shells out to the local `codex` CLI.
      // Routed to the harness service before this factory is ever reached.
      throw new Error('codex-cli is handled by the harness service, not the AI SDK factory')
    }
```

If `ai-providers.test.ts` enumerates providers explicitly, add `codex-cli` to the harness-throws group (mirror its `claude-cli` case).

- [ ] **Step 4: Verify green**

Run: `pnpm test -- ai-providers && pnpm typecheck`
Expected: PASS. (`typecheck:web` may flag renderer spots that switch on provider ids — if so, note them; they're fixed in Task 7. Only fix here if the error is in `packages/shared` itself.)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts apps/desktop/src/main/ai-providers.ts apps/desktop/src/main/__tests__/ai-providers.test.ts
git commit -m "feat(shared): register codex-cli as a keyless BYOH provider"
```

---

### Task 2: Harness core — `types.ts`, `tool-labels.ts`, `partial-json.ts`, `runner.ts`

**Files:**
- Create: `src/main/harness/types.ts`
- Create: `src/main/harness/tool-labels.ts` (moved from `harness-stream.ts`)
- Create: `src/main/harness/partial-json.ts` (moved from `harness-stream.ts`)
- Create: `src/main/harness/runner.ts`
- Test: `src/main/harness/__tests__/runner.test.ts`

**Interfaces:**
- Consumes: `McpRuntimeInfo` from `src/main/mcp-runtime.ts` (`{ port: number; token: string; url: string }`).
- Produces (used by Tasks 3–6):
  - all types below, exactly as written
  - `toolLabel(name: string): string | undefined` from `tool-labels.ts`
  - `extractPartialMessage(raw: string): string` from `partial-json.ts`
  - `resolveBinary(binaryName: string, overrideEnvVar: string): string`
  - `detectBinary(binaryName: string, overrideEnvVar: string, notFoundMessage: string): Promise<HarnessDetection>`
  - `augmentedPath(): string`
  - `runHarnessProcess(request: HarnessRequest, opts: { timeoutMs: number; cliLabel: string; notFoundMessage: string }, onLine: (obj: unknown) => void): Promise<{ stderr: string; code: number | null }>`

- [ ] **Step 1: Write `src/main/harness/types.ts`**

```typescript
/**
 * Bring-your-own-harness (BYOH) core types. A harness is the user's own locally
 * installed agent CLI (claude, codex, ...) that data-peek drives as an
 * orchestrator. The adapter seam mirrors the DatabaseAdapter pattern: pure
 * request building + a per-run stream collector per CLI, with spawning,
 * validation, and grounded-ness rules owned by the shared service.
 */

import type { McpRuntimeInfo } from '../mcp-runtime'

export type HarnessProviderId = 'claude-cli' | 'codex-cli'

export interface HarnessCapabilities {
  /** Token-level partial messages while generating (vs message-at-completion). */
  streaming: boolean
  /** Multi-turn conversation memory via a CLI session id. */
  resume: boolean
  /** Trusted for whole-dashboard generation. */
  dashboard: boolean
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
  capabilities: HarnessCapabilities
  detect(): Promise<HarnessDetection>
  buildRequest(input: HarnessInput): HarnessRequest
  createRun(): HarnessRun
}
```

- [ ] **Step 2: Create `tool-labels.ts` and `partial-json.ts` by moving code from `harness-stream.ts`**

`src/main/harness/tool-labels.ts`: move `TOOL_LABELS` and `toolLabel()` verbatim from `src/main/harness-stream.ts:27-42` (keep both docstrings). Export both (`TOOL_LABELS` is needed by tests).

`src/main/harness/partial-json.ts`: move `extractPartialMessage()` verbatim from `src/main/harness-stream.ts:98-168`. Do NOT delete `harness-stream.ts` yet — Task 3 moves the rest and Task 4 deletes it.

- [ ] **Step 3: Write the failing runner test `src/main/harness/__tests__/runner.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import { mkdtempSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('../../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('child_process', () => ({ spawn: spawnMock }))

import { runHarnessProcess, resolveBinary, detectBinary } from '../runner'
import type { HarnessRequest } from '../types'

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: () => void
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

const req = (over: Partial<HarnessRequest> = {}): HarnessRequest => ({
  binary: 'fake-cli',
  args: ['--x'],
  env: { PATH: '/usr/bin' },
  ...over
})
const opts = { timeoutMs: 5000, cliLabel: 'Fake CLI', notFoundMessage: 'Fake CLI not found.' }

describe('runHarnessProcess', () => {
  beforeEach(() => spawnMock.mockReset())

  it('parses one JSON object per line, buffering across chunk boundaries', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const lines: unknown[] = []
    const p = runHarnessProcess(req(), opts, (o) => lines.push(o))
    child.stdout.emit('data', Buffer.from('{"a":1}\n{"b"'))
    child.stdout.emit('data', Buffer.from(':2}\n'))
    child.emit('close', 0)
    await p
    expect(lines).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('parses a single JSON document with no trailing newline (claude one-shot)', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const lines: unknown[] = []
    const p = runHarnessProcess(req(), opts, (o) => lines.push(o))
    child.stdout.emit('data', Buffer.from('{"type":"result","result":"ok"}'))
    child.emit('close', 0)
    await p
    expect(lines).toEqual([{ type: 'result', result: 'ok' }])
  })

  it('closes stdin so CLIs never wait for piped input', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = runHarnessProcess(req(), opts, () => {})
    child.emit('close', 0)
    await p
    const spawnOpts = spawnMock.mock.calls[0][2] as { stdio?: unknown }
    expect(spawnOpts.stdio).toEqual(['ignore', 'pipe', 'pipe'])
  })

  it('maps ENOENT to the harness-specific not-found message', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = runHarnessProcess(req(), opts, () => {})
    const err = new Error('spawn fake-cli ENOENT') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    child.emit('error', err)
    await expect(p).rejects.toThrow('Fake CLI not found.')
  })

  it('kills the child and rejects with the cli label on timeout', async () => {
    vi.useFakeTimers()
    try {
      const child = fakeChild()
      spawnMock.mockReturnValue(child)
      const p = runHarnessProcess(req(), { ...opts, timeoutMs: 1000 }, () => {})
      const assertion = expect(p).rejects.toThrow(/Fake CLI timed out/)
      vi.advanceTimersByTime(1001)
      await assertion
      expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    } finally {
      vi.useRealTimers()
    }
  })

  it('writes temp files before spawn and removes them after close', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'runner-test-'))
    const tmpPath = join(dir, 'schema.json')
    const child = fakeChild()
    spawnMock.mockImplementation(() => {
      expect(readFileSync(tmpPath, 'utf8')).toBe('{"x":1}')
      return child
    })
    const p = runHarnessProcess(
      req({ tempFiles: [{ path: tmpPath, content: '{"x":1}' }] }),
      opts,
      () => {}
    )
    child.emit('close', 0)
    await p
    expect(existsSync(tmpPath)).toBe(false)
  })
})

describe('resolveBinary / detectBinary', () => {
  beforeEach(() => spawnMock.mockReset())

  it('prefers an existing override path from the env var', () => {
    const prev = process.env.TEST_BIN_OVERRIDE
    process.env.TEST_BIN_OVERRIDE = process.execPath
    try {
      expect(resolveBinary('definitely-not-here', 'TEST_BIN_OVERRIDE')).toBe(process.execPath)
    } finally {
      if (prev === undefined) delete process.env.TEST_BIN_OVERRIDE
      else process.env.TEST_BIN_OVERRIDE = prev
    }
  })

  it('reports available with the version when `--version` succeeds', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = detectBinary('codex', 'X', 'not found')
    child.stdout.emit('data', Buffer.from('codex-cli 0.146.0\n'))
    child.emit('close', 0)
    const result = await p
    expect(result.available).toBe(true)
    expect(result.version).toBe('codex-cli 0.146.0')
  })

  it('reports unavailable on ENOENT with the friendly message', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = detectBinary('codex', 'X', 'Codex CLI not found.')
    const err = new Error('ENOENT') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    child.emit('error', err)
    const result = await p
    expect(result.available).toBe(false)
    expect(result.error).toBe('Codex CLI not found.')
  })
})
```

- [ ] **Step 4: Run to verify it fails**

Run: `pnpm test -- harness/__tests__/runner`
Expected: FAIL — `../runner` module not found.

- [ ] **Step 5: Write `src/main/harness/runner.ts`**

Extract-and-generalise from `src/main/harness-service.ts` (`candidateBinDirs` :51, `augmentedPath` :70, `resolveClaudeBinary` :76, `runProcess` :271, `runProcessStreaming` :462, `detectClaudeCli` :309). Keep the original comments where they still apply.

```typescript
/**
 * Generic harness process runner. Everything CLI-agnostic lives here: PATH
 * augmentation for GUI-launched apps, binary resolution/detection, temp-file
 * lifecycle, timeouts, and JSONL line buffering. Adapters own argv and parsing.
 */

import { spawn } from 'child_process'
import { existsSync, writeFileSync, rmSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { HarnessDetection, HarnessRequest } from './types'
import { createLogger } from '../lib/logger'

const log = createLogger('harness-runner')

const DETECT_TIMEOUT_MS = 10_000

/** Common places agent CLIs land that a GUI-launched app's PATH misses. */
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
 * the GUI does not inherit the login-shell PATH on macOS, so CLIs are often
 * invisible without this.
 */
export function augmentedPath(): string {
  const extra = candidateBinDirs().join(':')
  return process.env.PATH ? `${process.env.PATH}:${extra}` : extra
}

/** Resolve a harness binary: explicit env override, then known dirs, then bare name. */
export function resolveBinary(binaryName: string, overrideEnvVar: string): string {
  const override = process.env[overrideEnvVar]
  if (override && existsSync(override)) return override
  for (const dir of candidateBinDirs()) {
    const candidate = join(dir, binaryName)
    if (existsSync(candidate)) return candidate
  }
  return binaryName
}

export interface RunnerOpts {
  timeoutMs: number
  /** Human name used in error messages, e.g. 'Claude CLI'. */
  cliLabel: string
  /** Message for ENOENT, e.g. install + sign-in instructions. */
  notFoundMessage: string
}

/**
 * Spawn the harness process and deliver each parsed stdout JSON line to
 * `onLine`. Buffers across chunk boundaries; at close, the remaining buffer is
 * parsed too, which also covers a single JSON document with no trailing newline
 * (the claude one-shot envelope). Temp files are written before spawn and
 * always removed afterwards. stdin is closed so a CLI never waits on input.
 */
export function runHarnessProcess(
  request: HarnessRequest,
  opts: RunnerOpts,
  onLine: (obj: unknown) => void
): Promise<{ stderr: string; code: number | null }> {
  for (const f of request.tempFiles ?? []) writeFileSync(f.path, f.content, 'utf8')
  const cleanup = (): void => {
    for (const f of request.tempFiles ?? []) {
      try {
        rmSync(f.path, { force: true })
      } catch {
        /* best-effort */
      }
    }
  }

  return new Promise((resolve, reject) => {
    const child = spawn(request.binary, request.args, {
      env: request.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''
    let buf = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      cleanup()
      reject(new Error(`${opts.cliLabel} timed out after ${Math.round(opts.timeoutMs / 1000)}s`))
    }, opts.timeoutMs)

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
      cleanup()
      reject(
        (err as NodeJS.ErrnoException).code === 'ENOENT' ? new Error(opts.notFoundMessage) : err
      )
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      cleanup()
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

/** Detect whether the user has a usable harness CLI installed. */
// --version output is plain text, not JSON, so detection gets its own tiny
// spawn instead of shoehorning through runHarnessProcess's JSON line parser.
export function detectBinary(
  binaryName: string,
  overrideEnvVar: string,
  notFoundMessage: string
): Promise<HarnessDetection> {
  const bin = resolveBinary(binaryName, overrideEnvVar)
  return new Promise((resolve) => {
    const child = spawn(bin, ['--version'], {
      env: { ...process.env, PATH: augmentedPath() },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      resolve({ available: false, path: bin, error: `${binaryName} --version timed out` })
    }, DETECT_TIMEOUT_MS)
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.on('error', (err) => {
      clearTimeout(timer)
      const notFound = (err as NodeJS.ErrnoException).code === 'ENOENT'
      resolve({ available: false, error: notFound ? notFoundMessage : String(err) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        resolve({ available: false, path: bin, error: `${binaryName} --version failed` })
      } else {
        resolve({ available: true, path: bin, version: stdout.trim() })
      }
    })
  })
}
```

`log` is imported for parity with the old module; if nothing ends up using it, remove the import rather than leaving it unused (typecheck is strict).

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm test -- harness/__tests__/runner`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/main/harness
git commit -m "feat(harness): add adapter types and generic CLI runner"
```

---

### Task 3: Claude Code adapter (behaviour-preserving move)

**Files:**
- Create: `src/main/harness/adapters/claude-code.ts`
- Test: `src/main/harness/__tests__/claude-code.test.ts`
- Reference (do not delete yet): `src/main/harness-service.ts`, `src/main/harness-stream.ts`

**Interfaces:**
- Consumes: all of Task 2's types; `toolLabel` from `../tool-labels`; `RESPONSE_JSON_SCHEMA_STRING` is NOT consumed here (the service passes `input.jsonSchema`).
- Produces: `claudeCodeAdapter: HarnessAdapter` (default model fallback `'sonnet'` lives in the service via `DEFAULT_MODELS`); exported pure helpers for tests: `buildClaudeArgs`, `buildClaudeMcpConfigJson`, `claudeAllowedTools`, `classifyClaudeLine`, `MCP_SERVER_NAME`, `MCP_READ_TOOLS`.

- [ ] **Step 1: Write the failing test**

Port the arg/parse assertions from `src/main/__tests__/harness-service.test.ts` (they are the regression contract — keep every assertion) plus the `harness-stream.test.ts` classify cases, re-targeted at the adapter. Key shape:

```typescript
import { describe, it, expect } from 'vitest'
import { claudeCodeAdapter, buildClaudeArgs, buildClaudeMcpConfigJson, claudeAllowedTools, MCP_READ_TOOLS } from '../adapters/claude-code'
import type { HarnessInput } from '../types'

const input = (over: Partial<HarnessInput> = {}): HarnessInput => ({
  kind: 'chat',
  userPrompt: 'list users',
  systemPrompt: 'SYS',
  model: 'sonnet',
  stream: false,
  workDir: '/tmp/x',
  ...over
})

describe('claude buildRequest', () => {
  it('builds a one-shot json invocation with system prompt and model', () => {
    const req = claudeCodeAdapter.buildRequest(input())
    expect(req.args).toEqual([
      '-p',
      'list users',
      '--output-format',
      'json',
      '--append-system-prompt',
      'SYS',
      '--model',
      'sonnet'
    ])
  })

  it('adds stream flags and --json-schema when asked', () => {
    const req = claudeCodeAdapter.buildRequest(input({ stream: true, jsonSchema: '{}' }))
    expect(req.args).toContain('stream-json')
    expect(req.args).toContain('--verbose')
    expect(req.args).toContain('--include-partial-messages')
    expect(req.args).toContain('--json-schema')
  })

  it('adds --resume with the session id', () => {
    const req = claudeCodeAdapter.buildRequest(input({ resumeSessionId: 'sess-9' }))
    expect(req.args).toContain('--resume')
    expect(req.args[req.args.indexOf('--resume') + 1]).toBe('sess-9')
  })

  it('drops ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN from the child env', () => {
    const prev = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'sk-ant-leak'
    try {
      const req = claudeCodeAdapter.buildRequest(input())
      expect(req.env.ANTHROPIC_API_KEY).toBeUndefined()
      expect(req.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = prev
    }
  })

  it('wires agentic MCP: config, strict isolation, read-tools allow-list', () => {
    const req = claudeCodeAdapter.buildRequest(
      input({ mcp: { port: 4722, token: 'secret-tok', url: 'http://127.0.0.1:4722/mcp', connectionId: 'c1' } })
    )
    expect(req.args).toContain('--mcp-config')
    expect(req.args).toContain('--strict-mcp-config')
    const allowed = req.args[req.args.indexOf('--allowedTools') + 1]
    expect(allowed).toBe(
      'mcp__datapeek__list_schemas,mcp__datapeek__run_query,mcp__datapeek__explain_query'
    )
    const cfg = JSON.parse(req.args[req.args.indexOf('--mcp-config') + 1])
    expect(cfg.mcpServers.datapeek.url).toBe('http://127.0.0.1:4722/mcp')
    expect(cfg.mcpServers.datapeek.headers.Authorization).toBe('Bearer secret-tok')
    expect(MCP_READ_TOOLS).not.toContain('execute_statement' as never)
  })
})

describe('claude run collector', () => {
  const query = { type: 'query', message: 'ok', sql: 'SELECT 1' }
  const envelope = (result: string, extra: Record<string, unknown> = {}) => ({
    type: 'result',
    session_id: 's1',
    result,
    ...extra
  })

  it('captures the result envelope and reports stats', () => {
    const run = claudeCodeAdapter.createRun()
    run.onLine(envelope(JSON.stringify(query), { num_turns: 3, permission_denials: [] }))
    const res = run.finish({ code: 0, stderr: '' })
    expect(res.payload).toBe(JSON.stringify(query))
    expect(res.stats).toEqual({ toolRoundTrips: 2, denials: 0, sessionId: 's1' })
  })

  it('prefers structured_output when present', () => {
    const run = claudeCodeAdapter.createRun()
    run.onLine(envelope('ignored', { structured_output: query }))
    const res = run.finish({ code: 0, stderr: '' })
    expect(res.payload).toEqual(query)
  })

  it('throws the envelope error message (e.g. credit balance) even on exit 0', () => {
    const run = claudeCodeAdapter.createRun()
    run.onLine(envelope('Credit balance is too low', { is_error: true }))
    expect(() => run.finish({ code: 1, stderr: 'noise' })).toThrow(/credit balance/i)
  })

  it('throws with stderr detail when no envelope arrived', () => {
    const run = claudeCodeAdapter.createRun()
    expect(() => run.finish({ code: 1, stderr: 'boom' })).toThrow(/boom/)
  })

  it('classifies text deltas, json deltas, and grounding tool labels', () => {
    const run = claudeCodeAdapter.createRun()
    expect(
      run.onLine({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hel' } }
      }).textDelta
    ).toBe('hel')
    expect(
      run.onLine({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"m' } }
      }).jsonDelta
    ).toBe('{"m')
    expect(
      run.onLine({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'mcp__datapeek__run_query' }] }
      }).toolLabel
    ).toBe('Running query…')
    // The CLI's internal StructuredOutput tool is an output mechanism, not activity.
    expect(
      run.onLine({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'StructuredOutput' }] }
      }).toolLabel
    ).toBeUndefined()
  })
})
```

Also port any `extractPartialMessage` cases from `src/main/__tests__/harness-stream.test.ts` into `src/main/harness/__tests__/partial-json.test.ts` (import from `../partial-json`) — read that test file first; if its cases are already equivalent, move the file and update the import path.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- harness/__tests__/claude-code`
Expected: FAIL — adapter module not found.

- [ ] **Step 3: Implement `src/main/harness/adapters/claude-code.ts`**

Move code from `harness-service.ts` and `harness-stream.ts`, reshaped to the adapter interface. Preserve original comments (the ToS-gray-area note, the strict-mcp-config rationale, the StructuredOutput note). Key structure:

```typescript
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

export const MCP_SERVER_NAME = 'datapeek'
export const MCP_READ_TOOLS = ['list_schemas', 'run_query', 'explain_query'] as const

export function claudeAllowedTools(serverName: string = MCP_SERVER_NAME): string[] {
  return MCP_READ_TOOLS.map((t) => `mcp__${serverName}__${t}`)
}

export function buildClaudeMcpConfigJson(url: string, token: string): string {
  return JSON.stringify({
    mcpServers: {
      [MCP_SERVER_NAME]: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } }
    }
  })
}

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
  if (input.stream) args.push('--verbose', '--include-partial-messages')
  if (input.jsonSchema) args.push('--json-schema', input.jsonSchema)
  if (input.resumeSessionId) args.push('--resume', input.resumeSessionId)
  if (input.mcp) {
    args.push(
      '--mcp-config',
      buildClaudeMcpConfigJson(input.mcp.url, input.mcp.token),
      '--strict-mcp-config',
      '--allowedTools',
      claudeAllowedTools().join(',')
    )
  }
  return args
}

function claudeEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = { ...process.env, PATH: augmentedPath() }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  return env as NodeJS.ProcessEnv
}

export function classifyClaudeLine(obj: unknown): HarnessStreamInfo & { resultEnvelope?: Record<string, unknown> }
// ... body moved verbatim from harness-stream.ts classifyStreamLine()

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
      const turns = typeof resultEnvelope.num_turns === 'number' ? resultEnvelope.num_turns : undefined
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
  capabilities: { streaming: true, resume: true, dashboard: true },
  detect: () => detectBinary('claude', 'DATA_PEEK_CLAUDE_PATH', NOT_FOUND),
  buildRequest: (input): HarnessRequest => ({
    binary: resolveBinary('claude', 'DATA_PEEK_CLAUDE_PATH'),
    args: buildClaudeArgs(input),
    env: claudeEnv()
  }),
  createRun: createClaudeRun
}
```

Note: "grounded" semantics are unchanged — old rule was `turns > 1`, new rule (service, Task 4) is `toolRoundTrips > 0` with `toolRoundTrips = turns - 1`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- harness/__tests__`
Expected: PASS (runner, claude-code, partial-json). The OLD `harness-service.test.ts` still passes because the old module is untouched.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/harness
git commit -m "feat(harness): extract claude code adapter from harness-service"
```

---

### Task 4: Harness service orchestrator + rewire callers, delete old modules

**Files:**
- Create: `src/main/harness/service.ts`
- Test: `src/main/harness/__tests__/service.test.ts`
- Modify: `src/main/ai-service.ts:321-324, 359-362, 419-429` (route via `isHarnessProvider`)
- Modify: `src/main/ipc/ai-handlers.ts:167-176` (`ai:detect-harness` gains a provider arg; `ai:generate-dashboard` passes provider through unchanged — signature already generic)
- Modify: `src/preload/index.ts:560-562` and `src/preload/index.d.ts` (`detectHarness(provider?)`)
- Delete: `src/main/harness-service.ts`, `src/main/harness-stream.ts`, `src/main/__tests__/harness-service.test.ts`, `src/main/__tests__/harness-stream.test.ts` (assertions live on in `harness/__tests__/`)

**Interfaces:**
- Consumes: `claudeCodeAdapter` (Task 3), runner (Task 2), `isHarnessProvider` (Task 1), `buildSystemPrompt`/`buildDashboardPrompt`/`responseSchema`/`dashboardSpecSchema`/`normalizeStructuredResponse`/`RESPONSE_JSON_SCHEMA_STRING` from `../ai-schema`, `getMcpRuntimeInfo` from `../mcp-runtime`, `extractPartialMessage` from `./partial-json`, `DEFAULT_MODELS` from `@shared/index`.
- Produces (consumed by `ai-service.ts` and `ai-handlers.ts`):
  - `detectHarness(provider: AIProvider): Promise<HarnessDetection>`
  - `generateChatResponseViaHarness(config: AIConfig, messages: AIMessage[], schemas: SchemaInfo[], dbType: string, connectionId?: string): Promise<{ success: boolean; data?: AIStructuredResponse; error?: string; meta?: HarnessMeta }>`
  - `generateChatResponseViaHarnessStream(config, messages, schemas, dbType, connectionId, resumeSessionId, onEvent)` — same signature as today's
  - `generateDashboardViaHarness(provider: AIProvider, prompt: string, schemas: SchemaInfo[], dbType: string, connectionId: string): Promise<{ success: boolean; spec?: DashboardSpec; error?: string }>`
  - `buildAgenticInstruction(connectionId: string): string` (moved verbatim from `harness-service.ts:336`)
  - `HarnessMeta` interface (moved verbatim from `harness-service.ts:351`)

- [ ] **Step 1: Write the failing service test**

Port the spawn-mocked suites from `src/main/__tests__/harness-service.test.ts:153-240` (`generateChatResponseViaHarness` and detection) — same fake-child driving, now through the new module — and add codex-shaped routing cases in Task 5. Also port `buildAgenticInstruction` assertions (:146-151). Add one new case for grounded meta:

```typescript
it('reports grounded meta when agentic with tool round-trips and no denials', async () => {
  // mock getMcpRuntimeInfo via vi.mock('../../mcp-runtime', ...) to return
  // { port: 1, token: 't', url: 'http://127.0.0.1:1/mcp' }
  const child = fakeChild()
  spawnMock.mockReturnValue(child)
  const p = generateChatResponseViaHarness(cfg, msgs, [], 'postgresql', 'conn-1')
  child.stdout.emit(
    'data',
    Buffer.from(
      JSON.stringify({
        type: 'result',
        session_id: 's1',
        num_turns: 3,
        permission_denials: [],
        result: JSON.stringify({ type: 'message', message: 'grounded hi' })
      })
    )
  )
  child.emit('close', 0)
  const res = await p
  expect(res.meta).toMatchObject({ grounded: true, agentic: true })
})
```

Run: `pnpm test -- harness/__tests__/service`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `src/main/harness/service.ts`**

Structure (the chat/stream/dashboard bodies mirror today's `harness-service.ts:396-455, 524-614, 651-689` with the adapter indirection):

```typescript
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { AIConfig, AIMessage, AIProvider, SchemaInfo, AIStructuredResponse, AIChatStreamEvent } from '@shared/index'
import { DEFAULT_MODELS, isHarnessProvider } from '@shared/index'
import { claudeCodeAdapter } from './adapters/claude-code'
import { runHarnessProcess } from './runner'
import { extractPartialMessage } from './partial-json'
import type { HarnessAdapter, HarnessDetection, HarnessInput, HarnessProviderId, HarnessResult } from './types'
import { getMcpRuntimeInfo } from '../mcp-runtime'
import { buildSystemPrompt, buildDashboardPrompt, responseSchema, dashboardSpecSchema, normalizeStructuredResponse, RESPONSE_JSON_SCHEMA_STRING, type DashboardSpec } from '../ai-schema'
import { createLogger } from '../lib/logger'

const log = createLogger('harness-service')

const GENERATION_TIMEOUT_MS = 120_000
const AGENTIC_TIMEOUT_MS = 180_000
const DASHBOARD_TIMEOUT_MS = 300_000

const ADAPTERS: Record<HarnessProviderId, HarnessAdapter> = {
  'claude-cli': claudeCodeAdapter,
  'codex-cli': claudeCodeAdapter // replaced by codexAdapter in the codex task
}

function adapterFor(provider: AIProvider): HarnessAdapter {
  if (!isHarnessProvider(provider)) throw new Error(`${provider} is not a harness provider`)
  return ADAPTERS[provider as HarnessProviderId]
}

export function detectHarness(provider: AIProvider): Promise<HarnessDetection> {
  return adapterFor(provider).detect()
}
```

Keep `buildAgenticInstruction` (moved verbatim), `HarnessMeta` (verbatim), and move `extractJsonObject` from `harness-service.ts:183-191` here (it is harness-agnostic). Shared internals:

```typescript
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
    const cliLabel = adapter.id === 'claude-cli' ? 'Claude CLI' : 'Codex CLI'
    const notFoundMessage =
      adapter.id === 'claude-cli'
        ? 'Claude CLI not found. Install it and run `claude` once to sign in.'
        : 'Codex CLI not found. Install it and run `codex login` once to sign in.'
    const exit = await runHarnessProcess(request, { timeoutMs, cliLabel, notFoundMessage }, (obj) => {
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
    })
    return run.finish(exit)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}
```

Public functions compose exactly like today: build prompts (`buildUserPrompt` moved verbatim from `harness-service.ts:321-330`), decide agentic from `getMcpRuntimeInfo() !== null && !!connectionId`, append `buildAgenticInstruction(connectionId)` to the system prompt when agentic, pick timeout, call `executeHarness`, `validatePayload`, and return `{ success, data, meta: { grounded: isGrounded(agentic, stats), agentic, turns: stats.toolRoundTrips + 1, sessionId: stats.sessionId } }`. Model resolution: `config.model && config.model !== 'default' ? config.model : DEFAULT_MODELS[config.provider]` — except pass `''` when `DEFAULT_MODELS[config.provider] === 'default'` (codex "use CLI default"). Dashboard variant validates with `dashboardSpecSchema` instead and passes `jsonSchema: undefined` (prompt-driven JSON, like today), `kind: 'dashboard'`, requires MCP + connectionId, checks `adapter.capabilities.dashboard` first and returns `{ success: false, error: 'Dashboard generation is not supported by this harness yet.' }` when false.

The chat path passes `jsonSchema: RESPONSE_JSON_SCHEMA_STRING` always (adapters that can't inline it use a temp file — codex — or ignore stream nuances). Resume: only pass `resumeSessionId` through when `adapter.capabilities.resume`; when resuming, the user prompt is only the last message (mirror `harness-service.ts:538-540`).

- [ ] **Step 3: Rewire `ai-service.ts`**

Replace the three `config.provider === 'claude-cli'` checks:

```typescript
  if (isHarnessProvider(config.provider)) {
    const { generateChatResponseViaHarness } = await import('./harness/service')
    return generateChatResponseViaHarness(config, messages, schemas, dbType, connectionId)
  }
```

(same for the stream variant), and in `generateDashboard`:

```typescript
  if (isHarnessProvider(config.provider)) {
    if (!connectionId) return { success: false, error: 'No connection selected.' }
    const { generateDashboardViaHarness } = await import('./harness/service')
    return generateDashboardViaHarness(config.provider, prompt, schemas, dbType, connectionId)
  }
```

Import `isHarnessProvider` from `@shared/index`. Update the two comments that say "claude-cli" to say "BYOH harness providers".

- [ ] **Step 4: Rewire IPC + preload**

`src/main/ipc/ai-handlers.ts:168`:

```typescript
  // Detect whether a local harness CLI is installed (for the BYOH providers)
  ipcMain.handle('ai:detect-harness', async (_, provider?: string) => {
    try {
      const { detectHarness } = await import('../harness/service')
      return { success: true, data: await detectHarness((provider ?? 'claude-cli') as AIConfig['provider']) }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })
```

`src/preload/index.ts:560`:

```typescript
    detectHarness: (
      provider?: AIProvider
    ): Promise<IpcResponse<{ available: boolean; path?: string; version?: string; error?: string }>> =>
      ipcRenderer.invoke('ai:detect-harness', provider),
```

(import `AIProvider` type from `@shared/index` if not already; mirror the signature in `src/preload/index.d.ts`).

- [ ] **Step 5: Delete the old modules and migrate leftovers**

```bash
git rm apps/desktop/src/main/harness-service.ts apps/desktop/src/main/harness-stream.ts \
       apps/desktop/src/main/__tests__/harness-service.test.ts apps/desktop/src/main/__tests__/harness-stream.test.ts
```

Then `grep -rn "harness-service\|harness-stream" apps/desktop/src` — fix any importer you missed (expected: none beyond ai-service/ai-handlers).

- [ ] **Step 6: Full check**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, including every ported assertion from the old suites.

- [ ] **Step 7: Commit**

```bash
git add -A apps/desktop/src packages/shared/src
git commit -m "refactor(harness): orchestrator service over adapters; retire claude-only modules"
```

---

### Task 5: Codex adapter — one-shot chat with real fixtures

**Files:**
- Create: `src/main/harness/adapters/codex.ts`
- Test: `src/main/harness/__tests__/codex.test.ts`
- Modify: `src/main/harness/service.ts` (ADAPTERS map: `'codex-cli': codexAdapter`)

**Interfaces:**
- Consumes: Task 2 types/runner/tool-labels.
- Produces: `codexAdapter: HarnessAdapter`; exported for tests: `buildCodexArgs(input: HarnessInput): string[]`, `composeCodexPrompt(systemPrompt: string, userPrompt: string): string`, `friendlyCodexError(raw: string): string`, `CODEX_SCHEMA_FILENAME = 'output-schema.json'`.

**Real fixtures** (captured 2026-08-05 from codex-cli 0.146.0 — use these verbatim in the test):

```
{"type":"thread.started","thread_id":"019fd2bf-ffe8-7c23-bd20-436c6938519f"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Skill descriptions were shortened to fit the 2% skills context budget. Codex can still see every skill, but some descriptions are shorter. Disable unused skills or plugins to leave more room for the rest."}}
{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"{\"message\":\"Hello! How can I help?\"}"}}
{"type":"turn.completed","usage":{"input_tokens":19925,"cached_input_tokens":0,"cache_write_input_tokens":0,"output_tokens":21,"reasoning_output_tokens":0}}
```

Failure shape (also real, from a bad-model probe):

```
{"type":"error","message":"{\"type\":\"error\",\"status\":400,\"error\":{\"type\":\"invalid_request_error\",\"message\":\"The 'totally-bogus-model' model is not supported when using Codex with a ChatGPT account.\"}}"}
{"type":"turn.failed","error":{"message":"{\"type\":\"error\",\"status\":400,\"error\":{\"type\":\"invalid_request_error\",\"message\":\"The 'totally-bogus-model' model is not supported when using Codex with a ChatGPT account.\"}}"}}
```

Note the third fixture line: **`item.type === 'error'` items are non-fatal warnings** (that one fired during a fully successful run). Only a top-level `{"type":"error"}` event or `turn.failed` is fatal.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { codexAdapter, buildCodexArgs, composeCodexPrompt, friendlyCodexError } from '../adapters/codex'
import type { HarnessInput } from '../types'

const input = (over: Partial<HarnessInput> = {}): HarnessInput => ({
  kind: 'chat',
  userPrompt: 'how many users?',
  systemPrompt: 'SYS',
  model: '',
  jsonSchema: '{"type":"object"}',
  stream: false,
  workDir: '/tmp/run-1',
  ...over
})

const SUCCESS_LINES = [
  { type: 'thread.started', thread_id: '019fd2bf-ffe8-7c23-bd20-436c6938519f' },
  { type: 'turn.started' },
  {
    type: 'item.completed',
    item: { id: 'item_0', type: 'error', message: 'Skill descriptions were shortened…' }
  },
  {
    type: 'item.completed',
    item: { id: 'item_1', type: 'agent_message', text: '{"message":"Hello! How can I help?"}' }
  },
  { type: 'turn.completed', usage: { input_tokens: 19925, output_tokens: 21 } }
]

describe('buildCodexArgs', () => {
  it('runs exec with json output, read-only sandbox, and hermetic config', () => {
    const args = buildCodexArgs(input())
    expect(args[0]).toBe('exec')
    expect(args).toContain('--json')
    expect(args).toContain('--skip-git-repo-check')
    expect(args).toContain('--ignore-user-config')
    expect(args[args.indexOf('--sandbox') + 1]).toBe('read-only')
    expect(args[args.indexOf('--cd') + 1]).toBe('/tmp/run-1')
  })

  it('prepends the system prompt into the prompt body (no --append-system-prompt in codex)', () => {
    const args = buildCodexArgs(input())
    const prompt = args[1]
    expect(prompt).toBe(composeCodexPrompt('SYS', 'how many users?'))
    expect(prompt).toContain('## Instructions')
    expect(prompt).toContain('## Request')
  })

  it('omits -m for the CLI-default model and passes explicit models through', () => {
    expect(buildCodexArgs(input({ model: '' }))).not.toContain('--model')
    expect(buildCodexArgs(input({ model: 'default' }))).not.toContain('--model')
    const args = buildCodexArgs(input({ model: 'gpt-5.1-codex' }))
    expect(args[args.indexOf('--model') + 1]).toBe('gpt-5.1-codex')
  })

  it('points --output-schema at a temp file inside the work dir', () => {
    const req = codexAdapter.buildRequest(input())
    const schemaPath = req.args[req.args.indexOf('--output-schema') + 1]
    expect(schemaPath).toBe('/tmp/run-1/output-schema.json')
    expect(req.tempFiles).toEqual([{ path: '/tmp/run-1/output-schema.json', content: '{"type":"object"}' }])
  })

  it('omits --output-schema when no schema is given (dashboard path)', () => {
    const req = codexAdapter.buildRequest(input({ jsonSchema: undefined }))
    expect(req.args).not.toContain('--output-schema')
    expect(req.tempFiles ?? []).toEqual([])
  })

  it('drops OPENAI_API_KEY so codex rides its own login', () => {
    const prev = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = 'sk-should-not-leak'
    try {
      expect(codexAdapter.buildRequest(input()).env.OPENAI_API_KEY).toBeUndefined()
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY
      else process.env.OPENAI_API_KEY = prev
    }
  })
})

describe('codex run collector', () => {
  it('collects the agent message, session id, and clean stats from a real run', () => {
    const run = codexAdapter.createRun()
    const infos = SUCCESS_LINES.map((l) => run.onLine(l))
    // the structured reply surfaces as a json delta so the service can stream the message field
    expect(infos[3].jsonDelta).toBe('{"message":"Hello! How can I help?"}')
    const res = run.finish({ code: 0, stderr: '' })
    expect(res.payload).toBe('{"message":"Hello! How can I help?"}')
    expect(res.stats).toEqual({
      toolRoundTrips: 0,
      denials: 0,
      sessionId: '019fd2bf-ffe8-7c23-bd20-436c6938519f'
    })
  })

  it('treats item-level error items as non-fatal (real runs emit warnings that way)', () => {
    const run = codexAdapter.createRun()
    SUCCESS_LINES.forEach((l) => run.onLine(l))
    expect(() => run.finish({ code: 0, stderr: '' })).not.toThrow()
  })

  it('surfaces turn.failed with the inner API message unwrapped', () => {
    const run = codexAdapter.createRun()
    run.onLine({
      type: 'turn.failed',
      error: {
        message:
          '{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The \'totally-bogus-model\' model is not supported when using Codex with a ChatGPT account."}}'
      }
    })
    expect(() => run.finish({ code: 1, stderr: '' })).toThrow(/not supported when using Codex/)
  })

  it('throws with stderr detail when no agent message ever arrived', () => {
    const run = codexAdapter.createRun()
    run.onLine({ type: 'thread.started', thread_id: 't' })
    expect(() => run.finish({ code: 1, stderr: 'something exploded' })).toThrow(/something exploded/)
  })
})

describe('friendlyCodexError', () => {
  it('maps auth failures to a codex login hint', () => {
    expect(friendlyCodexError('{"status":401,"error":{"message":"Unauthorized"}}')).toMatch(
      /codex login/
    )
  })
  it('unwraps the nested API error message', () => {
    expect(
      friendlyCodexError('{"type":"error","status":400,"error":{"message":"inner detail"}}')
    ).toBe('inner detail')
  })
  it('passes through plain messages untouched', () => {
    expect(friendlyCodexError('stream disconnected')).toBe('stream disconnected')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- harness/__tests__/codex`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/harness/adapters/codex.ts`**

```typescript
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

export const CODEX_SCHEMA_FILENAME = 'output-schema.json'

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
        if (evt.type === 'item.completed' && item.type === 'agent_message' && typeof item.text === 'string') {
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
        throw new Error(`Codex CLI returned no reply: ${stderr.trim() || `exited with code ${code}`}`)
      }
      return { payload: agentMessage, stats: { toolRoundTrips, denials, sessionId } }
    }
  }
}

export const codexAdapter: HarnessAdapter = {
  id: 'codex-cli',
  // No token-level deltas from codex --json: activity labels stream, the
  // message text lands at item.completed. resume/dashboard verified in
  // 0.146.0's exec surface; if live testing disproves one, flip it here and
  // the service + UI degrade automatically.
  capabilities: { streaming: false, resume: true, dashboard: true },
  detect: () => detectBinary('codex', 'DATA_PEEK_CODEX_PATH', NOT_FOUND),
  buildRequest: (input) => ({
    binary: resolveBinary('codex', 'DATA_PEEK_CODEX_PATH'),
    args: buildCodexArgs(input),
    env: codexEnv(input.mcp?.token),
    tempFiles: input.jsonSchema
      ? [{ path: join(input.workDir, CODEX_SCHEMA_FILENAME), content: input.jsonSchema }]
      : []
  }),
  createRun: createCodexRun
}
```

Then in `service.ts`, replace the placeholder mapping: `'codex-cli': codexAdapter`.

`mcp_tool_call` item field caveat: the tool-name field (`tool` vs `name` vs `title`) and `status: 'failed'` are the one part not yet confirmed by a captured fixture (needs a live MCP server). The code above tolerates all three name fields; Task 8's manual run captures a real agentic fixture — if the shape differs, fix the collector and add the fixture line to this test file.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- harness/__tests__ && pnpm typecheck:node`
Expected: PASS.

- [ ] **Step 5: Real one-shot smoke test (no mocks, hits your Codex account once)**

Run the adapter's exact argv recipe straight from a terminal:

```bash
PROMPT=$'## Instructions\nReply with a JSON object {"message": "<greeting>"} and nothing else.\n\n## Request\nsay hi'
codex exec "$PROMPT" --json --skip-git-repo-check --ignore-user-config --sandbox read-only --cd /tmp
```

Expected: JSONL ending in an `item.completed` line whose `item.type` is `agent_message`, followed by `turn.completed`. This confirms the argv recipe outside the app before wiring the UI.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/main/harness
git commit -m "feat(harness): codex cli adapter with one-shot structured chat"
```

---

### Task 6: Codex agentic grounding + resume through the service

**Files:**
- Modify: `src/main/harness/service.ts` (nothing codex-specific should be needed — this task is mostly tests proving the generic path)
- Test: `src/main/harness/__tests__/service.test.ts` (extend)

**Interfaces:**
- Consumes: everything from Tasks 4–5.
- Produces: no new exports — behavioural guarantees other tasks rely on.

- [ ] **Step 1: Write failing service tests for codex routing**

Add to `service.test.ts` (same fake-child + mocked `mcp-runtime` machinery as Task 4):

```typescript
describe('codex provider routing', () => {
  const codexCfg = { provider: 'codex-cli', model: 'default' } as unknown as AIConfig

  it('spawns codex with MCP overrides and the token in env, not argv', async () => {
    // mcp-runtime mock returns { port: 4722, token: 'secret-tok', url: 'http://127.0.0.1:4722/mcp' }
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = generateChatResponseViaHarness(codexCfg, msgs, [], 'postgresql', 'conn-1')
    child.stdout.emit(
      'data',
      Buffer.from(
        [
          '{"type":"thread.started","thread_id":"th-1"}',
          '{"type":"item.completed","item":{"id":"i1","type":"mcp_tool_call","tool":"run_query","status":"completed"}}',
          '{"type":"item.completed","item":{"id":"i2","type":"agent_message","text":"{\\"type\\":\\"query\\",\\"message\\":\\"42 users\\",\\"sql\\":\\"SELECT count(*) FROM users\\"}"}}',
          '{"type":"turn.completed","usage":{}}'
        ].join('\n') + '\n'
      )
    )
    child.emit('close', 0)
    const res = await p
    expect(res.success).toBe(true)
    expect(res.data?.sql).toBe('SELECT count(*) FROM users')
    expect(res.meta).toMatchObject({ grounded: true, agentic: true, sessionId: 'th-1' })

    const [bin, args, opts] = spawnMock.mock.calls.at(-1) as [string, string[], { env: Record<string, string> }]
    expect(bin).toContain('codex')
    expect(args.join(' ')).toContain('mcp_servers.datapeek.url=')
    expect(args.join(' ')).not.toContain('secret-tok')
    expect(opts.env.DATA_PEEK_MCP_TOKEN).toBe('secret-tok')
    expect(opts.env.OPENAI_API_KEY).toBeUndefined()
  })

  it('does not claim grounded when a codex tool call failed', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = generateChatResponseViaHarness(codexCfg, msgs, [], 'postgresql', 'conn-1')
    child.stdout.emit(
      'data',
      Buffer.from(
        [
          '{"type":"item.completed","item":{"id":"i1","type":"mcp_tool_call","tool":"run_query","status":"failed"}}',
          '{"type":"item.completed","item":{"id":"i2","type":"agent_message","text":"{\\"type\\":\\"message\\",\\"message\\":\\"could not check\\"}"}}',
          '{"type":"turn.completed","usage":{}}'
        ].join('\n') + '\n'
      )
    )
    child.emit('close', 0)
    const res = await p
    expect(res.success).toBe(true)
    expect(res.meta?.grounded).toBe(false)
  })

  it('resumes a codex session with only the latest user message', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const many: AIMessage[] = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'and now?' }
    ]
    const p = generateChatResponseViaHarnessStream(codexCfg, many, [], 'postgresql', undefined, 'th-1', () => {})
    child.stdout.emit(
      'data',
      Buffer.from(
        '{"type":"item.completed","item":{"id":"i","type":"agent_message","text":"{\\"type\\":\\"message\\",\\"message\\":\\"ok\\"}"}}\n{"type":"turn.completed","usage":{}}\n'
      )
    )
    child.emit('close', 0)
    await p
    const args = spawnMock.mock.calls.at(-1)![1] as string[]
    expect(args.slice(0, 3)).toEqual(['exec', 'resume', 'th-1'])
    expect(args[3]).toBe('and now?')
    expect(args).not.toContain('--sandbox')
    expect(args).not.toContain('--cd')
  })
})
```

- [ ] **Step 2: Run to verify current behaviour**

Run: `pnpm test -- harness/__tests__/service`
Expected: these already PASS if Tasks 4–5 were faithful (the service is generic). If any fail, the failure IS the work item — fix service/adapter until green without breaking the claude cases.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main/harness/__tests__/service.test.ts apps/desktop/src/main/harness
git commit -m "test(harness): prove codex agentic grounding and resume through the service"
```

---

### Task 7: Renderer — settings modal, provider copy, typecheck sweep

**Files:**
- Modify: `src/renderer/src/components/ai/ai-settings-modal.tsx` (detection effect :88-105, detection status row ~:360-380)
- Modify: `src/renderer/src/stores/ai-store.ts:81-82` (comment only, mention both harnesses)
- Test: `src/renderer/src/stores/__tests__/ai-config-sanitize.test.ts` (extend if it enumerates providers)

**Interfaces:**
- Consumes: `isHarnessProvider`, `HARNESS_AI_PROVIDERS` from `@shared/index`; `window.api.ai.detectHarness(provider)` from Task 4.
- Produces: user-visible behaviour only.

- [ ] **Step 1: Generalise the detection effect**

Read the modal first (it has more claude-cli references than the grep showed — check the save/validate flow too). Then:

```typescript
  // Detect the local CLI whenever a BYOH harness provider is selected.
  React.useEffect(() => {
    if (!isOpen || !isHarnessProvider(selectedProvider)) return
    let cancelled = false
    setIsDetecting(true)
    setHarness(null)
    window.api.ai
      .detectHarness(selectedProvider)
      .then((res) => {
        if (!cancelled) setHarness(res.success && res.data ? res.data : { available: false })
      })
      .finally(() => {
        if (!cancelled) setIsDetecting(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, selectedProvider])
```

- [ ] **Step 2: Per-harness copy in the status row**

Around line 367 the detected/not-detected row hardcodes Claude copy. Replace with a lookup:

```typescript
const HARNESS_HINTS: Partial<Record<ProviderId, { detected: string; missing: string }>> = {
  'claude-cli': {
    detected: 'uses your Claude subscription or key via the claude CLI',
    missing: 'Install Claude Code and run `claude` once to sign in.'
  },
  'codex-cli': {
    detected: 'uses your Codex sign-in via the codex CLI',
    missing: 'Install Codex and run `codex login` once to sign in.'
  }
}
```

and render `Detected{harness.version ? ` · ${harness.version}` : ''} — {HARNESS_HINTS[selectedProvider]?.detected}` / the `missing` string in the unavailable branch. Keep the existing visual structure — this is a copy generalisation, not a redesign.

- [ ] **Step 3: Sweep for other claude-cli conditionals in the renderer**

Run: `grep -rn "claude-cli" apps/desktop/src/renderer apps/desktop/src/preload`
For each hit that gates harness behaviour (readiness checks, model pickers, grounded badge), switch to `isHarnessProvider(...)`; leave hits that are genuinely Claude-specific copy. Update the `ai-store.ts:81` comment to "Keyless providers (ollama + the BYOH harnesses) are ready whenever they're active".

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, both node and web configs.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer apps/desktop/src/preload
git commit -m "feat(ui): codex cli harness in AI settings with per-harness detection"
```

---

### Task 8: Manual verification + docs

**Files:**
- Modify: `README.md` (AI features list)
- Modify: `apps/desktop/src/main/harness/__tests__/codex.test.ts` (only if the live agentic fixture disproves the `mcp_tool_call` shape)

- [ ] **Step 1: Manual verification checklist (run with the user — ASK before starting the dev server; they usually have one running)**

1. Settings → AI → select "Codex (local CLI)" → shows "Detected · codex-cli 0.146.0".
2. Enable the MCP server, open a saved Postgres connection (use `seeds/`), ask the chat "how many rows are in <table>?" → grounded badge appears, SQL is correct.
3. While that runs, capture the live agentic JSONL: temporarily log lines in the runner or run the equivalent `codex exec` from a terminal with the app's MCP url/token. Confirm the `mcp_tool_call` item's tool-name field and `status` values; fix `createCodexRun` + tests if they differ.
4. Ask a write ("delete all users") → the reply must not claim it executed anything; `execute_statement` is not in `enabled_tools` and the in-app approval can't fire headlessly.
5. Follow-up message in the same chat → verify `exec resume` path (second spawn's argv starts `exec resume <id>`); if resume misbehaves, set `capabilities.resume: false` (service falls back to transcript replay) and note it.
6. Dashboard generation on codex → if the spec validates, keep `dashboard: true`; if it's flaky, flip to `false` and confirm the friendly error surfaces.
7. Claude regression: switch provider to Claude Code (local CLI), one grounded chat — badge + streaming still work.

- [ ] **Step 2: README**

In the AI assistant features area (near the existing `claude mcp add` bullet at README.md:61), add:

```markdown
- **Bring your own agent** - point the AI assistant at your locally installed Claude Code or Codex CLI; it uses your existing subscription and sign-in, and data-peek never stores a key
```

`docs/` has no end-user BYOH page today (only internal plans), and the marketing site source has no harness copy to update — release-notes/marketing copy happens in the Notion marketing hub at release time, so nothing to change under `apps/web/` for this feature.

- [ ] **Step 3: Final full check + commit**

Run: `pnpm lint && pnpm test && pnpm typecheck` (from `apps/desktop`), plus `pnpm lint` at the repo root for the shared package.

```bash
git add README.md apps/desktop
git commit -m "docs: bring-your-own-agent supports claude code and codex"
```

---

## Self-review notes

- Spec coverage: adapter abstraction (T2–T4), codex one-shot + structured output (T5), agentic MCP + fail-closed writes (T5–T6, T8.4), resume (T5–T6, T8.5), degradation capabilities (T5 flags + T8.5/8.6), settings UI (T7), regression safety (T3 ports every old assertion; T4 deletes only after they're re-homed), docs rule (T8).
- The spec's three "verify at implementation" items were resolved during planning against codex-cli 0.146.0: `enabled_tools` passes `--strict-config`; `exec resume` supports `--json`/`--output-schema`/`-c` (not `--sandbox`/`--cd` — handled in `buildCodexArgs`); no token deltas → `capabilities.streaming: false`.
- Known residual unknown (explicitly owned by T5 note + T8.3): the `mcp_tool_call` item's field names, unverifiable without a live MCP session.
