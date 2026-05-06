import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConnectionConfig } from '@shared/index'

const { mockClient, mockPool, PoolCtor } = vi.hoisted(() => {
  const mockClient = { query: vi.fn(), release: vi.fn() }
  const mockPool = { connect: vi.fn(), end: vi.fn(), on: vi.fn() }
  const PoolCtor = vi.fn()
  return { mockClient, mockPool, PoolCtor }
})

vi.mock('pg', () => ({ Pool: PoolCtor }))
vi.mock('../ssh-tunnel-service', () => ({
  createTunnel: vi.fn(),
  closeTunnel: vi.fn()
}))
vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

import { withPgClient, withPgTransaction } from '../adapters/pg-pool-manager'

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
  PoolCtor.mockImplementation(function (this: unknown) {
    return mockPool
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
