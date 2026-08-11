import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConnectionConfig } from '@shared/index'

const { mockClient, mockPool, PoolCtor } = vi.hoisted(() => {
  const mockClient = { query: vi.fn(), release: vi.fn() }
  const mockPool = { connect: vi.fn(), end: vi.fn(), on: vi.fn() }
  const PoolCtor = vi.fn()
  return { mockClient, mockPool, PoolCtor }
})

vi.mock('pg', () => ({
  Pool: PoolCtor,
  // createPoolEntry registers a raw parser for timestamp (OID 1114).
  types: { setTypeParser: vi.fn() }
}))
vi.mock('../ssh-tunnel-service', () => ({
  createTunnel: vi.fn(),
  closeTunnel: vi.fn()
}))
vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

import { createTunnel, closeTunnel, type TunnelSession } from '../ssh-tunnel-service'
import {
  withPgClient,
  withPgTransaction,
  acquirePgSessionClient,
  closeAllPgPools,
  closePgPool,
  type PgSessionLease
} from '../adapters/pg-pool-manager'

// Each `new Pool()` hands back its own object (delegating to the shared spies) so a test
// can tell which specific pool was ended when a connection's shape changes.
interface FakePool {
  end: ReturnType<typeof vi.fn>
  // Per-instance so a test can tell *which* pool a client was checked out of — the
  // point of the session pool is that its clients don't come from the query pool.
  connect: ReturnType<typeof vi.fn>
}
const createdPools: FakePool[] = []

let counter = 0
function makeConfig(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    id: `cfg-${++counter}`,
    name: 'test',
    host: 'localhost',
    port: 5432,
    database: 'db',
    user: 'u',
    password: 'p',
    dbType: 'postgresql',
    dstPort: 5432,
    ...overrides
  }
}

beforeEach(() => {
  PoolCtor.mockReset()
  mockClient.query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 })
  mockClient.release.mockReset()
  mockPool.connect.mockReset().mockResolvedValue(mockClient)
  mockPool.end.mockReset().mockResolvedValue(undefined)
  mockPool.on.mockReset()
  vi.mocked(createTunnel).mockReset()
  vi.mocked(closeTunnel).mockReset()
  createdPools.length = 0
  PoolCtor.mockImplementation(function (this: unknown) {
    const instance = {
      connect: vi.fn((...args: unknown[]) => mockPool.connect(...args)),
      end: vi.fn((...args: unknown[]) => mockPool.end(...args)),
      on: (...args: unknown[]) => mockPool.on(...args)
    }
    createdPools.push(instance)
    return instance
  })
})

describe('withPgClient', () => {
  it('shares one pool across concurrent first-use callers', async () => {
    const cfg = makeConfig()

    await Promise.all(Array.from({ length: 5 }, () => withPgClient(cfg, async () => {})))

    expect(PoolCtor).toHaveBeenCalledTimes(1)
    expect(mockPool.connect).toHaveBeenCalledTimes(5)
    expect(mockClient.release).toHaveBeenCalledTimes(5)
  })

  it('reuses the same pool across sequential calls', async () => {
    const cfg = makeConfig()

    await withPgClient(cfg, async () => {})
    await withPgClient(cfg, async () => {})
    await withPgClient(cfg, async () => {})

    expect(PoolCtor).toHaveBeenCalledTimes(1)
  })

  it('uses distinct pools for distinct config ids', async () => {
    await withPgClient(makeConfig(), async () => {})
    await withPgClient(makeConfig(), async () => {})

    expect(PoolCtor).toHaveBeenCalledTimes(2)
  })

  it('passes the configured default schema through as startup options', async () => {
    await withPgClient(makeConfig({ schema: 'bbl' }), async () => {})

    expect(PoolCtor).toHaveBeenCalledWith(
      expect.objectContaining({ options: '-c search_path="bbl"' })
    )
  })

  it('does not share a pool between unsaved configs that differ only by schema', async () => {
    // search_path is baked into each connection's startup options, so reusing a pool
    // across schemas would silently keep the first one's search_path.
    const base = { ...makeConfig(), id: '' }

    await withPgClient({ ...base, schema: 'bbl' }, async () => {})
    await withPgClient({ ...base, schema: 'fel' }, async () => {})

    expect(PoolCtor).toHaveBeenCalledTimes(2)
  })

  it('does not reuse a saved connection pool after its SSL settings change', async () => {
    // Saved connections have a stable id, so keying on id alone served the pre-edit
    // pool back to a config that had just turned TLS on (issue #252).
    const saved = makeConfig()

    await withPgClient(saved, async () => {})
    await withPgClient(
      { ...saved, ssl: true, sslOptions: { rejectUnauthorized: false } },
      async () => {}
    )

    expect(PoolCtor).toHaveBeenCalledTimes(2)
    expect(PoolCtor.mock.calls[0][0]).not.toHaveProperty('ssl')
    expect(PoolCtor.mock.calls[1][0]).toMatchObject({ ssl: { rejectUnauthorized: false } })
  })

  it('re-dials with TLS after the plaintext attempt was rejected (issue #252)', async () => {
    const saved = makeConfig()
    // new Pool() never dials, so a rejected handshake still leaves an entry cached —
    // the retry has to be given a different pool, not the one that just failed.
    mockPool.connect.mockRejectedValueOnce(
      new Error(
        'no pg_hba.conf entry for host "203.0.113.7", user "u", database "db", no encryption'
      )
    )

    await expect(withPgClient(saved, async () => {})).rejects.toThrow('no encryption')
    await withPgClient(
      { ...saved, ssl: true, sslOptions: { rejectUnauthorized: false } },
      async () => {}
    )

    expect(PoolCtor).toHaveBeenCalledTimes(2)
    expect(PoolCtor.mock.calls[1][0]).toMatchObject({ ssl: { rejectUnauthorized: false } })
  })

  it('does not reuse a saved connection pool after host or credentials change', async () => {
    const saved = makeConfig()

    await withPgClient(saved, async () => {})
    await withPgClient({ ...saved, host: 'db.example.com' }, async () => {})
    await withPgClient({ ...saved, host: 'db.example.com', password: 'rotated' }, async () => {})

    expect(PoolCtor).toHaveBeenCalledTimes(3)
  })

  it('retires the superseded pool so one connection keeps one live pool', async () => {
    const saved = makeConfig()

    await withPgClient(saved, async () => {})
    await withPgClient({ ...saved, ssl: true }, async () => {})

    expect(createdPools).toHaveLength(2)
    expect(createdPools[0].end).toHaveBeenCalledTimes(1)
    expect(createdPools[1].end).not.toHaveBeenCalled()
  })

  it('disposes a creation that was superseded while it was still dialing', async () => {
    // evictOtherShapes only sees installed pools, so a slow dial could otherwise install
    // a second live pool *and* tunnel under one identity after the newer shape landed.
    // Tunnel setup makes that window wide, so it is the one reproduced here.
    const saved = makeConfig({
      ssh: true,
      sshConfig: {
        host: 'bastion',
        port: 22,
        user: 'x',
        authMethod: 'Password',
        privateKeyPath: ''
      }
    })
    const tunnel: TunnelSession = {
      ssh: null,
      server: null,
      sockets: new Set(),
      localHost: '127.0.0.1',
      localPort: 54320
    }
    let finishDial: (t: TunnelSession) => void = () => {}
    vi.mocked(createTunnel).mockReturnValueOnce(
      new Promise<TunnelSession>((resolve) => {
        finishDial = resolve
      })
    )

    const superseded = withPgClient(saved, async () => {})
    // A newer shape for the same connection is acquired and installed meanwhile.
    await withPgClient({ ...saved, ssl: true }, async () => {})

    finishDial(tunnel)
    await expect(superseded).rejects.toThrow('Pool was closed before initialization completed')

    // createdPools[0] is the newer shape: the superseded dial had not reached new Pool()
    // yet. It must be the one torn down, tunnel included.
    expect(createdPools).toHaveLength(2)
    expect(createdPools[0].end).not.toHaveBeenCalled()
    expect(createdPools[1].end).toHaveBeenCalledTimes(1)
    expect(closeTunnel).toHaveBeenCalledWith(tunnel)
  })

  it('survives double-release without throwing', async () => {
    mockClient.release.mockImplementationOnce(() => {
      throw new Error('Release called on client which has already been released')
    })

    await expect(withPgClient(makeConfig(), async () => 'ok')).resolves.toBe('ok')
  })
})

describe('withPgTransaction', () => {
  it('issues BEGIN + COMMIT on success and releases cleanly', async () => {
    await withPgTransaction(makeConfig(), async (client) => {
      await client.query('INSERT INTO t VALUES (1)')
    })

    const calls = mockClient.query.mock.calls.map((c) => c[0])
    expect(calls).toEqual(['BEGIN', 'INSERT INTO t VALUES (1)', 'COMMIT'])
    expect(mockClient.release).toHaveBeenCalledWith(undefined)
  })

  it('issues BEGIN + ROLLBACK when fn throws and rethrows the original error', async () => {
    const original = new Error('user code blew up')

    await expect(
      withPgTransaction(makeConfig(), async () => {
        throw original
      })
    ).rejects.toBe(original)

    const calls = mockClient.query.mock.calls.map((c) => c[0])
    expect(calls).toEqual(['BEGIN', 'ROLLBACK'])
    expect(mockClient.release).toHaveBeenCalledWith(undefined)
  })

  it('marks the client poisoned when ROLLBACK itself fails', async () => {
    const original = new Error('fn error')
    mockClient.query.mockImplementation((sql: string) => {
      if (sql === 'ROLLBACK') return Promise.reject(new Error('connection broken'))
      return Promise.resolve({ rows: [], rowCount: 0 })
    })

    await expect(
      withPgTransaction(makeConfig(), async () => {
        throw original
      })
    ).rejects.toBe(original)

    expect(mockClient.release).toHaveBeenCalledWith(true)
  })
})

describe('acquirePgSessionClient', () => {
  // A manual transaction holds its client until the user commits. Serving those from the
  // query pool meant POOL_MAX open transactions consumed every slot, after which ordinary
  // queries blocked on pool.connect() and failed with pg's generic connection timeout.
  const SESSION_POOL_MAX = 4

  it('checks out session clients from a pool separate from the query pool', async () => {
    const cfg = makeConfig()
    await withPgClient(cfg, async () => {})
    expect(createdPools).toHaveLength(1)

    await acquirePgSessionClient(cfg)

    expect(createdPools).toHaveLength(2)
    const [queryPool, sessionPool] = createdPools
    // The query pool served only the withPgClient call, not the session checkout.
    expect(queryPool.connect).toHaveBeenCalledTimes(1)
    expect(sessionPool.connect).toHaveBeenCalledTimes(1)
  })

  it('leaves the query pool untouched when every session slot is parked', async () => {
    const cfg = makeConfig()
    for (let i = 0; i < SESSION_POOL_MAX; i++) {
      await acquirePgSessionClient(cfg)
    }

    await withPgClient(cfg, async () => {})

    const [queryPool, sessionPool] = createdPools
    expect(sessionPool.connect).toHaveBeenCalledTimes(SESSION_POOL_MAX)
    expect(queryPool.connect).toHaveBeenCalledTimes(1)
  })

  it('rejects the overflowing session with an actionable message, not a connect timeout', async () => {
    const cfg = makeConfig()
    for (let i = 0; i < SESSION_POOL_MAX; i++) {
      await acquirePgSessionClient(cfg)
    }

    await expect(acquirePgSessionClient(cfg)).rejects.toThrow(
      /already has 4 open transactions.*Commit or roll one back/s
    )
    // It must fail without even trying to queue behind the parked clients.
    expect(createdPools[1].connect).toHaveBeenCalledTimes(SESSION_POOL_MAX)
  })

  it('frees the slot on release', async () => {
    const cfg = makeConfig()
    const leases: PgSessionLease[] = []
    for (let i = 0; i < SESSION_POOL_MAX; i++) {
      leases.push(await acquirePgSessionClient(cfg))
    }

    leases[0].release()

    await expect(acquirePgSessionClient(cfg)).resolves.toBeDefined()
    expect(mockClient.release).toHaveBeenCalledTimes(1)
  })

  it('frees the slot when the checkout itself fails', async () => {
    const cfg = makeConfig()
    await acquirePgSessionClient(cfg)
    mockPool.connect.mockRejectedValueOnce(new Error('server refused'))

    await expect(acquirePgSessionClient(cfg)).rejects.toThrow('server refused')

    // The failed attempt must not have burned a slot permanently.
    for (let i = 0; i < SESSION_POOL_MAX - 1; i++) {
      await expect(acquirePgSessionClient(cfg)).resolves.toBeDefined()
    }
    await expect(acquirePgSessionClient(cfg)).rejects.toThrow(/open transactions/)
  })

  it('is idempotent on release, so a cancellation path cannot free a slot twice', async () => {
    const cfg = makeConfig()
    const lease = await acquirePgSessionClient(cfg)

    lease.release(true)
    lease.release()
    lease.release()

    expect(mockClient.release).toHaveBeenCalledTimes(1)
    expect(mockClient.release).toHaveBeenCalledWith(true)

    // Exactly one slot came back, not three.
    for (let i = 0; i < SESSION_POOL_MAX; i++) {
      await expect(acquirePgSessionClient(cfg)).resolves.toBeDefined()
    }
    await expect(acquirePgSessionClient(cfg)).rejects.toThrow(/open transactions/)
  })

  it('ends the session pool alongside the query pool on teardown', async () => {
    const cfg = makeConfig()
    await acquirePgSessionClient(cfg)

    await closeAllPgPools()

    expect(createdPools).toHaveLength(2)
    expect(createdPools[0].end).toHaveBeenCalledTimes(1)
    expect(createdPools[1].end).toHaveBeenCalledTimes(1)
  })

  it('ends the session pool when a single connection is closed', async () => {
    const cfg = makeConfig()
    await acquirePgSessionClient(cfg)

    await closePgPool(cfg)

    expect(createdPools[1].end).toHaveBeenCalledTimes(1)
  })
})

describe('closePgPool', () => {
  it('closes the live pool even when handed the pre-edit config', async () => {
    // connections:update tears down using the *previous* stored config, while a Test
    // Connection during that edit may already have built a pool from the new shape.
    const saved = makeConfig()
    const edited = { ...saved, ssl: true, sslOptions: { rejectUnauthorized: false } }
    await withPgClient(edited, async () => {})

    await closePgPool(saved)

    expect(createdPools[0].end).toHaveBeenCalledTimes(1)
    await withPgClient(edited, async () => {})
    expect(PoolCtor).toHaveBeenCalledTimes(2)
  })
})

describe('closeAllPgPools', () => {
  it('leaves the manager reusable after teardown (does not permanently poison it)', async () => {
    // A pool is created and in use.
    await withPgClient(makeConfig(), async () => {})
    const beforeClose = PoolCtor.mock.calls.length

    // The app runs shutdown cleanup — but on macOS the process can outlive it
    // (windows hide instead of quitting; an aborted/raced quit can leave it alive).
    await closeAllPgPools()

    // Subsequent work must still succeed — not throw "Pool manager is shutting down".
    await expect(withPgClient(makeConfig(), async () => 'ok')).resolves.toBe('ok')
    expect(PoolCtor.mock.calls.length).toBe(beforeClose + 1)
  })

  it('does not wedge when a pool.end() hangs (bounded teardown)', async () => {
    vi.useFakeTimers()
    try {
      await withPgClient(makeConfig(), async () => {})
      // A client stuck on a server-side lock keeps pool.end() pending forever.
      mockPool.end.mockReturnValueOnce(new Promise<void>(() => {}))

      const closed = closeAllPgPools()
      await vi.advanceTimersByTimeAsync(2_500)
      await expect(closed).resolves.toBeUndefined()

      // The manager must be reusable, not latched on the hung teardown.
      mockPool.end.mockResolvedValue(undefined)
      await expect(withPgClient(makeConfig(), async () => 'ok')).resolves.toBe('ok')
    } finally {
      vi.useRealTimers()
    }
  })

  it('coalesces concurrent teardown calls without wedging the guard', async () => {
    await withPgClient(makeConfig(), async () => {})

    // Two overlapping teardowns must not leave shuttingDown latched.
    await Promise.all([closeAllPgPools(), closeAllPgPools()])

    await expect(withPgClient(makeConfig(), async () => 'ok')).resolves.toBe('ok')
  })
})
