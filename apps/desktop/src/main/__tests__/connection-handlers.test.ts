import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConnectionConfig } from '@shared/index'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const {
  handlers,
  closePgPool,
  invalidateSchemaCache,
  broadcastToAll,
  drainSessions,
  getAdapterByType,
  closeMySQLPool,
  closeMSSQLPool
} = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  closePgPool: vi.fn(),
  invalidateSchemaCache: vi.fn(),
  broadcastToAll: vi.fn(),
  drainSessions: vi.fn(),
  getAdapterByType: vi.fn(),
  closeMySQLPool: vi.fn(),
  closeMSSQLPool: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      handlers.set(channel, handler)
    })
  }
}))
vi.mock('../adapters/pg-pool-manager', () => ({ closePgPool }))
vi.mock('../db-adapter', () => ({ getAdapterByType }))
vi.mock('../adapters/mysql-pool-manager', () => ({ closeMySQLPool }))
vi.mock('../adapters/mssql-pool-manager', () => ({ closeMSSQLPool }))
vi.mock('../schema-cache', () => ({ invalidateSchemaCache }))
vi.mock('../window-manager', () => ({ windowManager: { broadcastToAll } }))
vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

import { registerConnectionHandlers } from '../ipc/connection-handlers'
import type { DpStorage } from '../storage'

function makeStore(initial: ConnectionConfig[]) {
  let state = initial
  return {
    get: vi.fn(() => state),
    set: vi.fn((_key: string, value: ConnectionConfig[]) => {
      state = value
    })
  } as unknown as DpStorage<{ connections: ConnectionConfig[] }>
}

const previous: ConnectionConfig = {
  id: 'conn-1',
  name: 'prod',
  host: 'old-host.example.com',
  port: 5432,
  database: 'prod-db',
  user: 'old-user',
  password: 'old-secret',
  dbType: 'postgresql',
  dstPort: 5432
}

beforeEach(() => {
  handlers.clear()
  closePgPool.mockReset().mockResolvedValue(undefined)
  invalidateSchemaCache.mockReset()
  broadcastToAll.mockReset()
  drainSessions.mockReset().mockResolvedValue(undefined)
  getAdapterByType.mockReset().mockReturnValue({ drainSessions })
  closeMySQLPool.mockReset().mockResolvedValue(undefined)
  closeMSSQLPool.mockReset().mockResolvedValue(undefined)
})

describe('connections:update', () => {
  it('tears down the pool for the PREVIOUS config, not the new one', async () => {
    registerConnectionHandlers(makeStore([{ ...previous }]))
    const handler = handlers.get('connections:update')!

    const result = handler(null, {
      ...previous,
      host: 'new-host.example.com',
      password: 'new-secret'
    })

    expect((result as { success: boolean }).success).toBe(true)
    // Teardown is fire-and-forget; flush the microtask queue so the .catch chain runs.
    await new Promise((resolve) => setImmediate(resolve))

    expect(closePgPool).toHaveBeenCalledTimes(1)
    expect(closePgPool).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'old-host.example.com', password: 'old-secret' })
    )
    expect(invalidateSchemaCache).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'old-host.example.com' })
    )
  })

  it('does not poison the IPC response when pool teardown rejects', async () => {
    closePgPool.mockRejectedValueOnce(new Error('pool teardown blew up'))
    registerConnectionHandlers(makeStore([{ ...previous }]))
    const handler = handlers.get('connections:update')!

    const result = handler(null, { ...previous, host: 'new-host' })

    expect((result as { success: boolean }).success).toBe(true)
    // Let the teardown promise reject; the .catch handler should swallow it.
    await new Promise((resolve) => setImmediate(resolve))
  })

  it('drains open transactions before tearing the pool down', async () => {
    // A parked session client keeps the pool's teardown pending, so the rollback has to
    // land first or the transaction is left open server-side holding its locks.
    const order: string[] = []
    drainSessions.mockImplementationOnce(async () => {
      order.push('drain')
    })
    closePgPool.mockImplementationOnce(async () => {
      order.push('close')
    })
    registerConnectionHandlers(makeStore([{ ...previous }]))

    handlers.get('connections:update')!(null, { ...previous, host: 'new-host' })
    await new Promise((resolve) => setImmediate(resolve))

    expect(order).toEqual(['drain', 'close'])
    expect(drainSessions).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'old-host.example.com' })
    )
  })

  it('still tears the pool down when the drain fails', async () => {
    drainSessions.mockRejectedValueOnce(new Error('rollback blew up'))
    registerConnectionHandlers(makeStore([{ ...previous }]))

    handlers.get('connections:update')!(null, { ...previous, host: 'new-host' })
    await new Promise((resolve) => setImmediate(resolve))

    expect(closePgPool).toHaveBeenCalledTimes(1)
  })

  it('broadcasts to renderers before scheduling teardown', () => {
    registerConnectionHandlers(makeStore([{ ...previous }]))
    const handler = handlers.get('connections:update')!

    handler(null, { ...previous, host: 'new-host' })

    // broadcast should run synchronously inside the handler, before the await tick.
    expect(broadcastToAll).toHaveBeenCalledWith('connections:updated')
  })
})

describe('teardown dispatch by driver', () => {
  // Every pooled driver has to be routed to its own closer and drained through its own
  // adapter — a connection whose pool is never closed keeps its sockets and, over SSH,
  // its tunnel for the rest of the session.
  it.each([
    ['mysql' as const, () => closeMySQLPool, () => [closePgPool, closeMSSQLPool]],
    ['mssql' as const, () => closeMSSQLPool, () => [closePgPool, closeMySQLPool]],
    ['postgresql' as const, () => closePgPool, () => [closeMySQLPool, closeMSSQLPool]]
  ])('routes %s teardown to its own pool closer', async (dbType, expected, others) => {
    registerConnectionHandlers(makeStore([{ ...previous, dbType }]))

    handlers.get('connections:delete')!(null, 'conn-1')
    await new Promise((resolve) => setImmediate(resolve))

    expect(expected()).toHaveBeenCalledWith(expect.objectContaining({ id: 'conn-1', dbType }))
    for (const other of others()) expect(other).not.toHaveBeenCalled()
    expect(getAdapterByType).toHaveBeenCalledWith(dbType)
    expect(drainSessions).toHaveBeenCalledWith(expect.objectContaining({ dbType }))
  })

  it('tears the pool down for an adapter that has no drainSessions hook', async () => {
    // Only Postgres parks clients today; the others must not be skipped for lacking it.
    getAdapterByType.mockReturnValue({})
    registerConnectionHandlers(makeStore([{ ...previous, dbType: 'mysql' }]))

    handlers.get('connections:delete')!(null, 'conn-1')
    await new Promise((resolve) => setImmediate(resolve))

    expect(closeMySQLPool).toHaveBeenCalledTimes(1)
  })

  it('does not attempt a pool teardown for SQLite', async () => {
    // SQLite opens the file per call and holds no pool or tunnel.
    registerConnectionHandlers(makeStore([{ ...previous, dbType: 'sqlite' }]))

    handlers.get('connections:delete')!(null, 'conn-1')
    await new Promise((resolve) => setImmediate(resolve))

    expect(closePgPool).not.toHaveBeenCalled()
    expect(closeMySQLPool).not.toHaveBeenCalled()
    expect(closeMSSQLPool).not.toHaveBeenCalled()
    // The cache is still connection-scoped, so it must be invalidated regardless.
    expect(invalidateSchemaCache).toHaveBeenCalledWith(expect.objectContaining({ id: 'conn-1' }))
  })
})

describe('connections:delete', () => {
  it('tears down the pool for the deleted config', async () => {
    registerConnectionHandlers(makeStore([{ ...previous }]))
    const handler = handlers.get('connections:delete')!

    handler(null, 'conn-1')
    await new Promise((resolve) => setImmediate(resolve))

    expect(closePgPool).toHaveBeenCalledWith(expect.objectContaining({ id: 'conn-1' }))
    expect(invalidateSchemaCache).toHaveBeenCalledWith(expect.objectContaining({ id: 'conn-1' }))
  })

  it('is a no-op when the id is unknown', () => {
    registerConnectionHandlers(makeStore([{ ...previous }]))
    const handler = handlers.get('connections:delete')!

    const result = handler(null, 'no-such-id')

    expect((result as { success: boolean }).success).toBe(true)
    expect(closePgPool).not.toHaveBeenCalled()
  })
})
