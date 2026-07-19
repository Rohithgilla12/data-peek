import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConnectionConfig } from '@shared/index'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const { handlers, adapter, invalidateSchemaCache, recordAudit } = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  adapter: { executeTransaction: vi.fn() },
  invalidateSchemaCache: vi.fn(),
  recordAudit: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)) }
}))
vi.mock('../db-adapter', () => ({ getAdapter: () => adapter }))
vi.mock('../schema-cache', () => ({ invalidateSchemaCache }))
vi.mock('../audit-service', () => ({ recordAudit }))
vi.mock('../ddl-builder', () => ({
  buildCreateTable: () => ({ sql: 'CREATE TABLE t ()' }),
  buildAlterTable: () => [{ sql: 'ALTER TABLE t ADD COLUMN c int' }],
  buildDropTable: () => ({ sql: 'DROP TABLE t' }),
  buildPreviewDDL: () => ({ sql: '' }),
  validateTableDefinition: () => ({ valid: true, errors: [] })
}))
vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

import { registerDDLHandlers } from '../ipc/ddl-handlers'

const config = {
  id: 'c1',
  name: 'db',
  dbType: 'postgresql',
  host: 'h',
  port: 5432,
  database: 'd',
  dstPort: 5432
} as unknown as ConnectionConfig

const invoke = (channel: string, args: unknown): Promise<{ success: boolean; error?: string }> =>
  handlers.get(channel)!({}, args) as Promise<{ success: boolean; error?: string }>

beforeEach(() => {
  handlers.clear()
  adapter.executeTransaction.mockReset()
  recordAudit.mockReset()
  registerDDLHandlers()
})

describe('DDL handler error contract', () => {
  // A failed DDL statement must surface as success:false on the IPC envelope — the
  // renderer keys off response.success, so returning success:true on failure would
  // report a failed CREATE/ALTER/DROP as if it had worked.
  it('create-table returns success:false when the transaction throws', async () => {
    adapter.executeTransaction.mockRejectedValue(new Error('create boom'))
    const res = await invoke('db:create-table', {
      config,
      definition: { schema: 'public', name: 't', columns: [] }
    })
    expect(res.success).toBe(false)
    expect(res.error).toContain('create boom')
  })

  it('alter-table returns success:false when the transaction throws', async () => {
    adapter.executeTransaction.mockRejectedValue(new Error('alter boom'))
    const res = await invoke('db:alter-table', {
      config,
      batch: { schema: 'public', table: 't', operations: [] }
    })
    expect(res.success).toBe(false)
    expect(res.error).toContain('alter boom')
  })

  it('drop-table returns success:false when the transaction throws', async () => {
    adapter.executeTransaction.mockRejectedValue(new Error('drop boom'))
    const res = await invoke('db:drop-table', { config, schema: 'public', table: 't' })
    expect(res.success).toBe(false)
    expect(res.error).toContain('drop boom')
  })
})
