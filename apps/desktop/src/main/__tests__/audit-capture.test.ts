import { describe, it, expect, vi, beforeEach } from 'vitest'

const recordAudit = vi.fn()
vi.mock('../audit-service', () => ({ recordAudit }))
vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() })
}))

const mockAdapter = vi.hoisted(() => ({
  execute: vi.fn(),
  queryMultiple: vi.fn()
}))
vi.mock('../db-adapter', () => ({ getAdapter: vi.fn(() => mockAdapter) }))
vi.mock('../mcp/read-guard', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runReadOnlyQuery: vi.fn().mockResolvedValue({ rows: [{ n: 1 }], fields: [], rowCount: 1 })
}))
vi.mock('../schema-cache', () => ({
  getCachedSchema: vi.fn(),
  isCacheValid: vi.fn(),
  getOrFetchCachedSchema: vi.fn()
}))

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { registerMcpTools } from '../mcp/tools'
import { ApprovalManager } from '../mcp/approval'
import type { ConnectionConfig } from '@shared/index'

const conn = {
  id: 'c1',
  name: 'local',
  dbType: 'postgresql',
  host: 'localhost',
  port: 5432,
  database: 'app'
} as unknown as ConnectionConfig

async function connectedClient(approval: ApprovalManager) {
  const server = new McpServer({ name: 'data-peek', version: '0.0.0' })
  registerMcpTools(server, { getConnections: () => [conn], approval })
  const [ct, st] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0.0.0' })
  await Promise.all([server.connect(st), client.connect(ct)])
  return client
}

describe('audit capture', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mcp run_query records an editor-free mcp entry on success', async () => {
    const client = await connectedClient(new ApprovalManager(() => undefined))
    await client.callTool({ name: 'run_query', arguments: { connectionId: 'c1', sql: 'SELECT 1' } })
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'mcp', sql: 'SELECT 1', success: true, rowCount: 1 })
    )
  })

  it('mcp execute_statement records approved writes and does not record rejected ones', async () => {
    mockAdapter.execute.mockResolvedValue({ rowCount: 2 })
    const approve = new ApprovalManager((req) => approve.respond(req.id, true))
    let client = await connectedClient(approve)
    await client.callTool({
      name: 'execute_statement',
      arguments: { connectionId: 'c1', sql: 'UPDATE t SET x = 1' }
    })
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'mcp',
        sql: 'UPDATE t SET x = 1',
        success: true,
        rowCount: 2
      })
    )

    recordAudit.mockClear()
    const reject = new ApprovalManager((req) => reject.respond(req.id, false))
    client = await connectedClient(reject)
    await client.callTool({
      name: 'execute_statement',
      arguments: { connectionId: 'c1', sql: 'DROP TABLE t' }
    })
    expect(recordAudit).not.toHaveBeenCalled()
  })
})
