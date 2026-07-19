import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConnectionConfig } from '@shared/index'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const { handlers, adapter, recordAudit } = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  adapter: {
    beginTransaction: vi.fn(),
    commitTransaction: vi.fn(),
    rollbackTransaction: vi.fn()
  },
  recordAudit: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) }
}))
vi.mock('../db-adapter', () => ({ getAdapter: () => adapter }))
vi.mock('../schema-cache', () => ({
  getCachedSchema: vi.fn(),
  isCacheValid: vi.fn(),
  getOrFetchCachedSchema: vi.fn(),
  invalidateSchemaCache: vi.fn()
}))
vi.mock('../lib/ssl-error', () => ({ annotateSslError: (e: Error) => e }))
vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('../audit-service', () => ({ recordAudit }))

import { registerQueryHandlers } from '../ipc/query-handlers'

const config = {
  id: 'c1',
  name: 'local',
  database: 'app',
  dbType: 'postgresql'
} as unknown as ConnectionConfig

const invoke = (channel: string): Promise<unknown> =>
  handlers.get(channel)!(null, { config, sessionId: 's1' }) as Promise<unknown>

beforeEach(() => {
  handlers.clear()
  adapter.beginTransaction.mockReset().mockResolvedValue(undefined)
  adapter.commitTransaction.mockReset().mockResolvedValue(undefined)
  adapter.rollbackTransaction.mockReset().mockResolvedValue(undefined)
  recordAudit.mockReset()
  registerQueryHandlers()
})

describe('manual transaction audit boundaries', () => {
  it('records BEGIN when a manual transaction starts', async () => {
    await invoke('db:begin-transaction')
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'editor', sql: 'BEGIN', success: true })
    )
  })

  it('records COMMIT when a manual transaction commits', async () => {
    await invoke('db:commit-transaction')
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'editor', sql: 'COMMIT', success: true })
    )
  })

  it('records ROLLBACK so a rolled-back write is visible in the trail', async () => {
    await invoke('db:rollback-transaction')
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'editor', sql: 'ROLLBACK', success: true })
    )
  })

  it('records a failed commit as unsuccessful with the error', async () => {
    adapter.commitTransaction.mockRejectedValue(new Error('commit failed'))
    await invoke('db:commit-transaction')
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ sql: 'COMMIT', success: false, error: 'commit failed' })
    )
  })
})
