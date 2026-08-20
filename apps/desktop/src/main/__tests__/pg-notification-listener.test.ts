import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ConnectionConfig } from '@shared/index'
import type { NotificationClient } from '../db-adapter'

const { getAdapter, execute } = vi.hoisted(() => ({
  getAdapter: vi.fn(),
  execute: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: () => '/tmp/data-peek-test' }
}))
vi.mock('../db-adapter', () => ({ getAdapter }))
vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
// getDb() is lazy and only reached by event persistence, which these tests avoid; the
// stub keeps an accidental call from touching the filesystem.
vi.mock('better-sqlite3', () => ({
  default: class {
    exec() {
      /* schema setup is a no-op here */
    }
    prepare() {
      return { run: () => {}, get: () => ({ cnt: 0, last: null }), all: () => [] }
    }
    close() {
      /* nothing to release */
    }
  }
}))

import { subscribe, send, cleanup, getStatus, forceReconnect } from '../pg-notification-listener'

/** A NotificationClient whose LISTEN behaviour and death each test drives directly. */
class FakeNotificationClient implements NotificationClient {
  queries: string[] = []
  closed = 0
  listenError: Error | null = null
  private disconnect: ((error: Error | null) => void) | null = null

  async query(sql: string) {
    this.queries.push(sql)
    if (this.listenError && sql.startsWith('LISTEN')) throw this.listenError
    return { rows: [], fields: [], rowCount: 0 }
  }
  onDisconnect(handler: (error: Error | null) => void) {
    this.disconnect = handler
  }
  onNotification() {
    /* not exercised here */
  }
  async close() {
    this.closed++
  }
  /** Simulate the socket dying underneath the listener. */
  die(error: Error | null = new Error('read ECONNRESET')) {
    this.disconnect?.(error)
  }
}

const config = {
  id: 'conn-1',
  name: 'test',
  dbType: 'postgresql',
  host: 'localhost',
  port: 5432,
  database: 'app',
  user: 'u',
  password: 'p'
} as ConnectionConfig

/** Queued outcomes for successive createNotificationClient calls. */
let dials: Array<FakeNotificationClient | Error>
let dialCount: number

function nextDial(): FakeNotificationClient | Error {
  const outcome = dials[Math.min(dialCount, dials.length - 1)]
  dialCount++
  return outcome
}

beforeEach(async () => {
  vi.useFakeTimers()
  dials = []
  dialCount = 0
  execute.mockReset().mockResolvedValue({ rowCount: 1 })
  getAdapter.mockReset().mockReturnValue({
    dbType: 'postgresql',
    execute,
    createNotificationClient: vi.fn(async () => {
      const outcome = nextDial()
      if (outcome instanceof Error) throw outcome
      return outcome
    })
  })
})

afterEach(async () => {
  await cleanup()
  vi.useRealTimers()
})

describe('reconnect state machine', () => {
  it('retries when LISTEN fails after a successful dial', async () => {
    // The regression this file exists for: retiring the failed attempt used to disarm
    // its own retry, parking the listener in `error` forever.
    const failing = new FakeNotificationClient()
    failing.listenError = new Error('permission denied for channel')
    const healthy = new FakeNotificationClient()
    dials = [failing, healthy]

    await subscribe('conn-1', config, 'jobs')
    // 'reconnecting', not 'error': the catch reports the failure and then arms a retry,
    // which is the whole point. Parking in 'error' is the regression this guards.
    expect(getStatus('conn-1')?.state).toBe('reconnecting')
    expect(failing.closed).toBe(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(dialCount).toBe(2)
    expect(getStatus('conn-1')?.state).toBe('connected')
  })

  it('keeps retrying with growing backoff while the dial keeps failing', async () => {
    // A tombstone entry left by the previous attempt used to veto every retry after the
    // first, so the backoff ladder never got past one rung.
    const healthy = new FakeNotificationClient()
    dials = [
      new Error('ECONNREFUSED'),
      new Error('ECONNREFUSED'),
      new Error('ECONNREFUSED'),
      healthy
    ]

    await subscribe('conn-1', config, 'jobs')
    expect(dialCount).toBe(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(dialCount).toBe(2)

    await vi.advanceTimersByTimeAsync(2000)
    expect(dialCount).toBe(3)

    await vi.advanceTimersByTimeAsync(4000)
    expect(dialCount).toBe(4)
    expect(getStatus('conn-1')?.state).toBe('connected')
  })

  it('keeps retrying when the dial after a live connection dies also fails', async () => {
    // The tombstone path: a connection that was up leaves a retired entry behind, and a
    // failed re-dial has no fresh entry to replace it. That stale entry used to veto
    // every further retry, so the listener gave up one attempt after the socket died —
    // exactly the case the keepalive change is meant to recover from.
    const first = new FakeNotificationClient()
    const healthy = new FakeNotificationClient()
    dials = [first, new Error('ECONNREFUSED'), new Error('ECONNREFUSED'), healthy]

    await subscribe('conn-1', config, 'jobs')
    first.die()

    await vi.advanceTimersByTimeAsync(1000)
    expect(dialCount).toBe(2)

    await vi.advanceTimersByTimeAsync(2000)
    expect(dialCount).toBe(3)

    await vi.advanceTimersByTimeAsync(4000)
    expect(dialCount).toBe(4)
    expect(getStatus('conn-1')?.state).toBe('connected')
  })

  it('caps the backoff at MAX_BACKOFF_MS', async () => {
    dials = [new Error('down')]
    await subscribe('conn-1', config, 'jobs')

    // 1s, 2s, 4s ... doubling until it saturates. Advance well past the ceiling.
    for (const wait of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      await vi.advanceTimersByTimeAsync(wait)
    }
    expect(getStatus('conn-1')?.backoffMs).toBe(30_000)
  })

  it('arms exactly one retry when a socket death also fails the in-flight LISTEN', async () => {
    // pg reports the death through onDisconnect and rejects the pending query; both
    // reach scheduleReconnect, and two armed timers would double the dial rate.
    const dying = new FakeNotificationClient()
    dying.listenError = new Error('Client has encountered a connection error')
    const healthy = new FakeNotificationClient()
    dials = [dying, healthy]

    const listenQuery = dying.query.bind(dying)
    dying.query = async (sql: string) => {
      if (sql.startsWith('LISTEN')) dying.die()
      return listenQuery(sql)
    }

    await subscribe('conn-1', config, 'jobs')
    await vi.advanceTimersByTimeAsync(1000)
    expect(dialCount).toBe(2)

    // If a second timer were armed it would fire here against the same backoff window.
    await vi.advanceTimersByTimeAsync(1000)
    expect(dialCount).toBe(2)
  })

  it('reconnects after the connection drops', async () => {
    const first = new FakeNotificationClient()
    const second = new FakeNotificationClient()
    dials = [first, second]

    await subscribe('conn-1', config, 'jobs')
    expect(getStatus('conn-1')?.state).toBe('connected')

    first.die()
    expect(getStatus('conn-1')?.state).toBe('reconnecting')

    await vi.advanceTimersByTimeAsync(1000)
    expect(getStatus('conn-1')?.state).toBe('connected')
    expect(second.queries).toContain('LISTEN "jobs"')
  })

  it('reports a clean server-side close as disconnected, then recovers', async () => {
    const first = new FakeNotificationClient()
    dials = [first, new FakeNotificationClient()]

    await subscribe('conn-1', config, 'jobs')
    first.die(null)

    await vi.advanceTimersByTimeAsync(1000)
    expect(getStatus('conn-1')?.state).toBe('connected')
  })

  it('cancels a pending retry on cleanup', async () => {
    dials = [new Error('down')]
    await subscribe('conn-1', config, 'jobs')
    expect(dialCount).toBe(1)

    await cleanup()
    await vi.advanceTimersByTimeAsync(60_000)
    // A timer armed with no live entry to hang it from still has to be cancellable.
    expect(dialCount).toBe(1)
  })

  it('carries channels added by a later subscribe into the retry', async () => {
    const first = new FakeNotificationClient()
    const second = new FakeNotificationClient()
    dials = [first, second]

    await subscribe('conn-1', config, 'jobs')
    await subscribe('conn-1', config, 'alerts')

    first.die()
    await vi.advanceTimersByTimeAsync(1000)
    expect(second.queries).toEqual(expect.arrayContaining(['LISTEN "jobs"', 'LISTEN "alerts"']))
  })
})

describe('connection failures close what they opened', () => {
  it('closes the client when LISTEN fails', async () => {
    const failing = new FakeNotificationClient()
    failing.listenError = new Error('nope')
    dials = [failing, new FakeNotificationClient()]

    await subscribe('conn-1', config, 'jobs')
    expect(failing.closed).toBe(1)
  })

  it('closes the superseded client on a forced reconnect', async () => {
    const first = new FakeNotificationClient()
    dials = [first, new FakeNotificationClient()]

    await subscribe('conn-1', config, 'jobs')
    await forceReconnect('conn-1')
    expect(first.closed).toBe(1)
  })
})

describe('capability guard', () => {
  it('rejects subscribe on an adapter without LISTEN/NOTIFY', async () => {
    getAdapter.mockReturnValue({ dbType: 'mysql', execute })
    await expect(subscribe('conn-1', config, 'jobs')).rejects.toThrow(/not supported for mysql/)
  })

  it('rejects send on an adapter without LISTEN/NOTIFY instead of emitting pg_notify', async () => {
    getAdapter.mockReturnValue({ dbType: 'mysql', execute })
    await expect(send(config, 'jobs', 'hi')).rejects.toThrow(/not supported for mysql/)
    expect(execute).not.toHaveBeenCalled()
  })
})

describe('send', () => {
  it('goes through the pooled adapter.execute with positional params', async () => {
    await send(config, 'jobs', '{"id":1}')
    // The signature is positional; a silent argument-order drift here means every
    // notification the app sends vanishes.
    expect(execute).toHaveBeenCalledWith(config, 'SELECT pg_notify($1, $2)', ['jobs', '{"id":1}'])
  })

  it('opens no dedicated client', async () => {
    await send(config, 'jobs', 'hi')
    expect(dialCount).toBe(0)
  })
})
