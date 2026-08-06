import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

// service.ts pulls in lib/logger (electron-log) at import — stub it.
vi.mock('../../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('child_process', () => ({ spawn: spawnMock }))

const { getMcpRuntimeInfoMock } = vi.hoisted(() => ({
  getMcpRuntimeInfoMock: vi.fn((): { port: number; token: string; url: string } | null => null)
}))
vi.mock('../../mcp-runtime', () => ({ getMcpRuntimeInfo: getMcpRuntimeInfoMock }))

import {
  detectHarness,
  generateChatResponseViaHarness,
  generateChatResponseViaHarnessStream,
  generateDashboardViaHarness,
  buildAgenticInstruction
} from '../service'
import type { AIConfig, AIMessage } from '@shared/index'

// A fake child process whose stdout/stderr/exit we drive from the test.
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

// Wrap a model reply in the `claude -p --output-format json` result envelope.
const envelope = (result: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ type: 'result', session_id: 's1', result, ...extra })

describe('buildAgenticInstruction', () => {
  it('pins the agent to a specific connectionId and forbids list_connections', () => {
    const instr = buildAgenticInstruction('conn-42')
    expect(instr).toContain('conn-42')
    expect(instr).toMatch(/do not call list_connections/i)
  })
})

describe('generateChatResponseViaHarness (spawn-mocked)', () => {
  beforeEach(() => {
    spawnMock.mockReset()
    getMcpRuntimeInfoMock.mockReturnValue(null)
  })
  const cfg = { provider: 'claude-cli', model: 'sonnet' } as unknown as AIConfig
  const msgs: AIMessage[] = [{ role: 'user', content: 'how many users?' }]

  // Regression for the real credit-balance case: claude exits 1 but the useful
  // message is in stdout's envelope, not stderr. We must surface it.
  it('surfaces the structured stdout error even when the CLI exits non-zero', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = generateChatResponseViaHarness(cfg, msgs, [], 'postgresql')
    child.stderr.emit('data', Buffer.from('⚠ some warning about connectors\n'))
    child.stdout.emit(
      'data',
      Buffer.from(envelope('Credit balance is too low', { is_error: true }))
    )
    child.emit('close', 1)
    const res = await p
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/credit balance/i)
  })

  it('does not leak ANTHROPIC_API_KEY to the CLI (uses its own login)', async () => {
    const prev = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'sk-ant-should-not-leak'
    try {
      const child = fakeChild()
      spawnMock.mockReturnValue(child)
      const p = generateChatResponseViaHarness(cfg, msgs, [], 'postgresql')
      child.stdout.emit(
        'data',
        Buffer.from(envelope(JSON.stringify({ type: 'message', message: 'ok' })))
      )
      child.emit('close', 0)
      await p
      const spawnEnv = (spawnMock.mock.calls[0][2] as { env: Record<string, string | undefined> })
        .env
      expect(spawnEnv.ANTHROPIC_API_KEY).toBeUndefined()
      expect(spawnEnv.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = prev
    }
  })

  it('returns parsed structured data on a successful run', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = generateChatResponseViaHarness(cfg, msgs, [], 'postgresql')
    child.stdout.emit(
      'data',
      Buffer.from(envelope(JSON.stringify({ type: 'message', message: 'hi there' })))
    )
    child.emit('close', 0)
    const res = await p
    expect(res.success).toBe(true)
    expect(res.data?.message).toBe('hi there')
  })

  // The following four mirror the deleted harness-service.test.ts parseHarnessResult
  // robustness cases (fence stripping, prose recovery, empty result, schema mismatch).
  // Driven through the public API so they survive a parser refactor; the dashboard
  // path (jsonSchema: undefined) depends on this exact fence/prose recovery.
  const query = { type: 'query', message: 'ok', sql: 'SELECT 1' }

  it('strips markdown code fences around the JSON result', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = generateChatResponseViaHarness(cfg, msgs, [], 'postgresql')
    child.stdout.emit('data', Buffer.from(envelope('```json\n' + JSON.stringify(query) + '\n```')))
    child.emit('close', 0)
    const res = await p
    expect(res.success).toBe(true)
    expect(res.data?.sql).toBe('SELECT 1')
  })

  it('recovers JSON embedded in surrounding prose', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = generateChatResponseViaHarness(cfg, msgs, [], 'postgresql')
    child.stdout.emit(
      'data',
      Buffer.from(envelope(`Here you go:\n${JSON.stringify(query)}\nHope that helps`))
    )
    child.emit('close', 0)
    const res = await p
    expect(res.success).toBe(true)
    expect(res.data?.type).toBe('query')
  })

  it('reports an error on an empty result', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = generateChatResponseViaHarness(cfg, msgs, [], 'postgresql')
    child.stdout.emit('data', Buffer.from(envelope('')))
    child.emit('close', 0)
    const res = await p
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/empty/i)
  })

  it('reports an error when the model reply does not match the schema', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = generateChatResponseViaHarness(cfg, msgs, [], 'postgresql')
    child.stdout.emit(
      'data',
      Buffer.from(envelope(JSON.stringify({ type: 'nonsense', message: 5 })))
    )
    child.emit('close', 0)
    const res = await p
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/schema/i)
  })

  it('reports grounded meta when agentic with tool round-trips and no denials', async () => {
    getMcpRuntimeInfoMock.mockReturnValue({ port: 1, token: 't', url: 'http://127.0.0.1:1/mcp' })
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
})

describe('detectHarness', () => {
  beforeEach(() => {
    spawnMock.mockReset()
  })

  it('reports available with the version when `claude --version` succeeds', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = detectHarness('claude-cli')
    child.stdout.emit('data', Buffer.from('2.1.0 (Claude Code)\n'))
    child.emit('close', 0)
    const result = await p
    expect(result.available).toBe(true)
    expect(result.version).toBe('2.1.0 (Claude Code)')
  })

  it('reports unavailable when the binary is missing (ENOENT)', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = detectHarness('claude-cli')
    const err = new Error('spawn claude ENOENT') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    child.emit('error', err)
    const result = await p
    expect(result.available).toBe(false)
    expect(result.error).toMatch(/not found/i)
  })

  it('throws for a non-harness provider', () => {
    expect(() => detectHarness('openai')).toThrow(/not a harness provider/i)
  })
})

describe('executeHarness ENOENT path (adapter.notFoundMessage)', () => {
  beforeEach(() => {
    spawnMock.mockReset()
    getMcpRuntimeInfoMock.mockReturnValue(null)
  })

  it('surfaces the codex-specific not-found message when the codex binary is missing', async () => {
    const cfg = { provider: 'codex-cli', model: '' } as unknown as AIConfig
    const msgs: AIMessage[] = [{ role: 'user', content: 'how many users?' }]
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = generateChatResponseViaHarness(cfg, msgs, [], 'postgresql')
    const err = new Error('spawn codex ENOENT') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    child.emit('error', err)
    const res = await p
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Codex CLI not found/)
  })
})

describe('codex provider routing', () => {
  beforeEach(() => {
    spawnMock.mockReset()
    getMcpRuntimeInfoMock.mockReturnValue(null)
  })
  const codexCfg = { provider: 'codex-cli', model: 'default' } as unknown as AIConfig
  const msgs: AIMessage[] = [{ role: 'user', content: 'how many users?' }]

  // codex-cli's headless MCP tool calls are always auto-cancelled by the CLI
  // (openai/codex#24135, verified live against 0.146.0), so the service never
  // injects MCP config for this adapter — even when the runtime is up and a
  // connection is picked. It falls back to a plain chat run with schema
  // context only, and is honest about it in meta.
  it('spawns codex without MCP overrides or the token, even with MCP up and a connectionId', async () => {
    getMcpRuntimeInfoMock.mockReturnValue({
      port: 4722,
      token: 'secret-tok',
      url: 'http://127.0.0.1:4722/mcp'
    })
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = generateChatResponseViaHarness(codexCfg, msgs, [], 'postgresql', 'conn-1')
    child.stdout.emit(
      'data',
      Buffer.from(
        [
          '{"type":"thread.started","thread_id":"th-1"}',
          '{"type":"item.completed","item":{"id":"i2","type":"agent_message","text":"{\\"type\\":\\"message\\",\\"message\\":\\"there are 42 users\\"}"}}',
          '{"type":"turn.completed","usage":{}}'
        ].join('\n') + '\n'
      )
    )
    child.emit('close', 0)
    const res = await p
    expect(res.success).toBe(true)
    expect(res.data?.message).toBe('there are 42 users')
    expect(res.meta).toMatchObject({ agentic: false, grounded: false })

    const [bin, args, opts] = spawnMock.mock.calls.at(-1) as [
      string,
      string[],
      { env: Record<string, string> }
    ]
    expect(bin).toContain('codex')
    expect(args.join(' ')).not.toContain('mcp_servers')
    expect(opts.env.DATA_PEEK_MCP_TOKEN).toBeUndefined()
    expect(opts.env.OPENAI_API_KEY).toBeUndefined()
  })

  it('does not append the live-grounding instruction to the codex prompt', async () => {
    getMcpRuntimeInfoMock.mockReturnValue({
      port: 4722,
      token: 'secret-tok',
      url: 'http://127.0.0.1:4722/mcp'
    })
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = generateChatResponseViaHarness(codexCfg, msgs, [], 'postgresql', 'conn-1')
    child.stdout.emit(
      'data',
      Buffer.from(
        '{"type":"item.completed","item":{"id":"i","type":"agent_message","text":"{\\"type\\":\\"message\\",\\"message\\":\\"ok\\"}"}}\n{"type":"turn.completed","usage":{}}\n'
      )
    )
    child.emit('close', 0)
    await p
    const args = spawnMock.mock.calls.at(-1)![1] as string[]
    // args[1] is the composed prompt (no --resume in this call).
    expect(args[1]).not.toMatch(/## Live database access/)
    expect(args[1]).not.toContain('conn-1')
    // Non-agentic runs must instead tell the model it CANNOT see data, so it
    // returns runnable SQL (metric/query/chart) rather than invented values.
    // Regression: codex replied type "message" with a fabricated count.
    expect(args[1]).toMatch(/## No live database access/)
    expect(args[1]).toMatch(/NEVER state, estimate, or guess data values/i)
  })

  it('does not append the no-live-access instruction to an agentic claude run', async () => {
    getMcpRuntimeInfoMock.mockReturnValue({
      port: 4722,
      token: 'secret-tok',
      url: 'http://127.0.0.1:4722/mcp'
    })
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const claudeCfg = { provider: 'claude-cli', model: 'sonnet' } as unknown as AIConfig
    const p = generateChatResponseViaHarness(claudeCfg, msgs, [], 'postgresql', 'conn-1')
    child.stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          type: 'result',
          session_id: 's1',
          result: JSON.stringify({ type: 'message', message: 'ok' })
        })
      )
    )
    child.emit('close', 0)
    await p
    const args = spawnMock.mock.calls.at(-1)![1] as string[]
    const systemPrompt = args[args.indexOf('--append-system-prompt') + 1]
    expect(systemPrompt).toMatch(/## Live database access/)
    expect(systemPrompt).not.toMatch(/## No live database access/)
  })

  it('resumes a codex session with only the latest user message', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const many: AIMessage[] = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'and now?' }
    ]
    const p = generateChatResponseViaHarnessStream(
      codexCfg,
      many,
      [],
      'postgresql',
      undefined,
      'th-1',
      () => {}
    )
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

  it('refuses dashboard generation for codex without spawning (dashboard requires live grounding)', async () => {
    getMcpRuntimeInfoMock.mockReturnValue({
      port: 4722,
      token: 'secret-tok',
      url: 'http://127.0.0.1:4722/mcp'
    })
    const res = await generateDashboardViaHarness(
      'codex-cli',
      'overview',
      [],
      'postgresql',
      'conn-1'
    )
    expect(res).toEqual({
      success: false,
      error: 'Dashboard generation is not supported by this harness yet.'
    })
    expect(spawnMock).not.toHaveBeenCalled()
  })
})

describe('antigravity provider routing', () => {
  beforeEach(() => {
    spawnMock.mockReset()
    getMcpRuntimeInfoMock.mockReturnValue(null)
  })
  const agyCfg = { provider: 'antigravity-cli', model: 'default' } as unknown as AIConfig
  const agyMsgs: AIMessage[] = [{ role: 'user', content: 'how many users?' }]

  const emitAgyReply = (child: ReturnType<typeof fakeChild>): void => {
    child.stdout.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          event: 'result',
          result: {
            conversation_id: 'conv-1',
            status: 'SUCCESS',
            response: '',
            structured_output: { type: 'message', message: 'hello from agy' },
            num_turns: 1
          }
        }) + '\n'
      )
    )
    child.emit('close', 0)
  }

  it('runs non-agentically even with MCP up: no MCP wiring, honest meta', async () => {
    getMcpRuntimeInfoMock.mockReturnValue({
      port: 4722,
      token: 'secret-tok',
      url: 'http://127.0.0.1:4722/mcp'
    })
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = generateChatResponseViaHarness(agyCfg, agyMsgs, [], 'postgresql', 'conn-1')
    emitAgyReply(child)
    const res = await p
    expect(res.success).toBe(true)
    expect(res.data?.message).toBe('hello from agy')
    expect(res.meta).toMatchObject({ agentic: false, grounded: false, sessionId: 'conv-1' })
    const [bin, args, opts] = spawnMock.mock.calls.at(-1) as [
      string,
      string[],
      { env: Record<string, string>; cwd?: string }
    ]
    expect(bin).toContain('agy')
    expect(args.join(' ')).not.toContain('mcp')
    expect(args[1]).toMatch(/## No live database access/)
    expect(opts.env.GEMINI_API_KEY).toBeUndefined()
    expect(opts.env.GOOGLE_API_KEY).toBeUndefined()
    // agy has no --cd flag, so the per-run scratch dir must arrive as cwd.
    expect(opts.cwd).toMatch(/data-peek-harness-/)
  })

  it('surfaces the agy-specific not-found message on ENOENT', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = generateChatResponseViaHarness(agyCfg, agyMsgs, [], 'postgresql')
    const err = new Error('spawn agy ENOENT') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    child.emit('error', err)
    const res = await p
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Antigravity CLI not found/)
  })

  it('resumes an agy conversation with only the latest user message', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const many: AIMessage[] = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'and now?' }
    ]
    const p = generateChatResponseViaHarnessStream(
      agyCfg,
      many,
      [],
      'postgresql',
      undefined,
      'conv-1',
      () => {}
    )
    emitAgyReply(child)
    await p
    const args = spawnMock.mock.calls.at(-1)![1] as string[]
    expect(args[1]).toBe('and now?')
    expect(args[args.indexOf('--conversation') + 1]).toBe('conv-1')
  })

  it('refuses dashboard generation for antigravity without spawning', async () => {
    getMcpRuntimeInfoMock.mockReturnValue({
      port: 4722,
      token: 'secret-tok',
      url: 'http://127.0.0.1:4722/mcp'
    })
    const res = await generateDashboardViaHarness(
      'antigravity-cli',
      'overview',
      [],
      'postgresql',
      'conn-1'
    )
    expect(res).toEqual({
      success: false,
      error: 'Dashboard generation is not supported by this harness yet.'
    })
    expect(spawnMock).not.toHaveBeenCalled()
  })
})
