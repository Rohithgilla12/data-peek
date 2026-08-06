import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'fs'
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
  beforeEach(() => {
    spawnMock.mockReset()
  })

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

  it('re-diagnoses spawn ENOENT as a missing cwd when the dir vanished after preflight', async () => {
    // TOCTOU window: the cwd passes the preflight existsSync but disappears
    // before the OS-level spawn — the ENOENT must still not claim the CLI
    // is missing.
    const dir = mkdtempSync(join(tmpdir(), 'runner-toctou-'))
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const p = runHarnessProcess(req({ cwd: dir }), opts, () => {})
    rmSync(dir, { recursive: true, force: true })
    const err = new Error('spawn fake-cli ENOENT') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    child.emit('error', err)
    await expect(p).rejects.toThrow(/working directory disappeared/)
  })

  it('reports a missing cwd distinctly instead of misdiagnosing it as a missing binary', async () => {
    // A vanished work dir makes spawn throw the same ENOENT as a missing
    // binary — without this guard the user is told to reinstall a CLI that
    // is installed and working.
    const p = runHarnessProcess(req({ cwd: '/definitely/not/a/real/dir' }), opts, () => {})
    await expect(p).rejects.toThrow(/working directory disappeared/)
    await expect(p).rejects.toThrow('/definitely/not/a/real/dir')
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('forwards the request cwd to the child (for CLIs without a --cd flag)', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const workDir = tmpdir()
    const p = runHarnessProcess(req({ cwd: workDir }), opts, () => {})
    child.emit('close', 0)
    await p
    const spawnOpts = spawnMock.mock.calls[0][2] as { cwd?: string }
    expect(spawnOpts.cwd).toBe(workDir)
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
  beforeEach(() => {
    spawnMock.mockReset()
  })

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
