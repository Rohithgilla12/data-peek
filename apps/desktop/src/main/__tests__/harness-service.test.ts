import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

// harness-service pulls in lib/logger (electron-log) at import — stub it.
vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('child_process', () => ({ spawn: spawnMock }))

import { buildHarnessArgs, parseHarnessResult, detectClaudeCli } from '../harness-service'

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

// Wrap a model reply in the `claude -p --output-format json` envelope.
const envelope = (result: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ type: 'result', session_id: 's1', result, ...extra })

describe('buildHarnessArgs', () => {
  it('builds a one-shot json invocation with system prompt and model', () => {
    const args = buildHarnessArgs('list users', 'SYS', 'sonnet')
    expect(args).toEqual([
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

  it('never enables --bare (so the CLI uses the user’s own auth, not a key)', () => {
    expect(buildHarnessArgs('q', 's', 'opus')).not.toContain('--bare')
  })
})

describe('parseHarnessResult', () => {
  const query = { type: 'query', message: 'ok', sql: 'SELECT 1' }

  it('parses a clean JSON reply and normalizes missing fields to null', () => {
    const res = parseHarnessResult(envelope(JSON.stringify(query)))
    expect(res.type).toBe('query')
    expect(res.sql).toBe('SELECT 1')
    expect(res.tables).toBeNull()
    expect(res.chartType).toBeNull()
  })

  it('strips markdown code fences around the JSON', () => {
    const res = parseHarnessResult(envelope('```json\n' + JSON.stringify(query) + '\n```'))
    expect(res.sql).toBe('SELECT 1')
  })

  it('recovers JSON embedded in surrounding prose', () => {
    const res = parseHarnessResult(
      envelope(`Here you go:\n${JSON.stringify(query)}\nHope that helps`)
    )
    expect(res.type).toBe('query')
  })

  it('throws when the CLI envelope reports an error', () => {
    expect(() => parseHarnessResult(envelope('rate limited', { is_error: true }))).toThrow(
      /rate limited/i
    )
  })

  it('throws on non-JSON stdout', () => {
    expect(() => parseHarnessResult('not json at all')).toThrow(/valid JSON/i)
  })

  it('throws when the model reply does not match the schema', () => {
    const res = envelope(JSON.stringify({ type: 'nonsense', message: 5 }))
    expect(() => parseHarnessResult(res)).toThrow(/schema/i)
  })

  it('throws on an empty result', () => {
    expect(() => parseHarnessResult(envelope(''))).toThrow(/empty/i)
  })
})

describe('detectClaudeCli', () => {
  beforeEach(() => spawnMock.mockReset())

  it('reports available with the version when `claude --version` succeeds', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = detectClaudeCli()
    child.stdout.emit('data', Buffer.from('2.1.0 (Claude Code)\n'))
    child.emit('close', 0)
    const result = await p
    expect(result.available).toBe(true)
    expect(result.version).toBe('2.1.0 (Claude Code)')
  })

  it('reports unavailable when the binary is missing (ENOENT)', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = detectClaudeCli()
    const err = new Error('spawn claude ENOENT') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    child.emit('error', err)
    const result = await p
    expect(result.available).toBe(false)
    expect(result.error).toMatch(/not found/i)
  })
})
