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

import { detectHarness, generateChatResponseViaHarness, buildAgenticInstruction } from '../service'
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
