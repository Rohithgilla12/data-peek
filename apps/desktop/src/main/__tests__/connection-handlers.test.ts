import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConnectionConfig } from '@shared/index'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const { handlers, closePgPool, invalidateSchemaCache, broadcastToAll } = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  closePgPool: vi.fn(),
  invalidateSchemaCache: vi.fn(),
  broadcastToAll: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      handlers.set(channel, handler)
    })
  }
}))
vi.mock('../adapters/pg-pool-manager', () => ({ closePgPool }))
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

  it('broadcasts to renderers before scheduling teardown', () => {
    registerConnectionHandlers(makeStore([{ ...previous }]))
    const handler = handlers.get('connections:update')!

    handler(null, { ...previous, host: 'new-host' })

    // broadcast should run synchronously inside the handler, before the await tick.
    expect(broadcastToAll).toHaveBeenCalledWith('connections:updated')
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
