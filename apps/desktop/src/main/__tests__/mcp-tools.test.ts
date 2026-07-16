import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { ConnectionConfig } from '@shared/index'

const mockAdapter = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue({ rowCount: 1 }),
  explain: vi.fn().mockResolvedValue({ plan: { cost: 1 }, durationMs: 2 }),
  getSchemas: vi.fn().mockResolvedValue([]),
  getTypes: vi.fn().mockResolvedValue([])
}))
vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('../db-adapter', () => ({ getAdapter: vi.fn(() => mockAdapter) }))
vi.mock('../mcp/read-guard', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runReadOnlyQuery: vi.fn().mockResolvedValue({ rows: [{ n: 1 }], fields: [], rowCount: 1 })
}))
vi.mock('../schema-cache', () => ({
  getCachedSchema: vi.fn(() => undefined),
  isCacheValid: vi.fn(() => false),
  getOrFetchCachedSchema: vi.fn(async (_c, fetcher) => fetcher())
}))

import { registerMcpTools } from '../mcp/tools'
import { ApprovalManager } from '../mcp/approval'

const conn = {
  id: 'c1',
  name: 'local pg',
  dbType: 'postgresql',
  host: 'localhost',
  port: 5432,
  database: 'app',
  user: 'admin',
  password: 'hunter2'
} as unknown as ConnectionConfig

async function connectedClient(approval: ApprovalManager) {
  const server = new McpServer({ name: 'data-peek', version: '0.0.0' })
  registerMcpTools(server, { getConnections: () => [conn], approval })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0.0.0' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return client
}

describe('mcp tools', () => {
  beforeEach(() => vi.clearAllMocks())

  it('list_connections omits credentials', async () => {
    const client = await connectedClient(new ApprovalManager(() => undefined))
    const res = await client.callTool({ name: 'list_connections', arguments: {} })
    const text = (res.content as Array<{ text: string }>)[0].text
    expect(text).toContain('local pg')
    expect(text).not.toContain('hunter2')
    expect(text).not.toContain('admin')
  })

  it('run_query returns rows for a known connection', async () => {
    const client = await connectedClient(new ApprovalManager(() => undefined))
    const res = await client.callTool({
      name: 'run_query',
      arguments: { connectionId: 'c1', sql: 'SELECT 1' }
    })
    expect((res.content as Array<{ text: string }>)[0].text).toContain('"n": 1')
  })

  it('run_query errors on unknown connection', async () => {
    const client = await connectedClient(new ApprovalManager(() => undefined))
    const res = await client.callTool({
      name: 'run_query',
      arguments: { connectionId: 'nope', sql: 'SELECT 1' }
    })
    expect(res.isError).toBe(true)
  })

  it('execute_statement runs after approval', async () => {
    const approval = new ApprovalManager((req) => approval.respond(req.id, true))
    const client = await connectedClient(approval)
    const res = await client.callTool({
      name: 'execute_statement',
      arguments: { connectionId: 'c1', sql: 'UPDATE t SET x = 1' }
    })
    expect(res.isError).toBeFalsy()
    expect(mockAdapter.execute).toHaveBeenCalledWith(conn, 'UPDATE t SET x = 1', [])
  })

  it('execute_statement returns an error when rejected', async () => {
    const approval = new ApprovalManager((req) => approval.respond(req.id, false))
    const client = await connectedClient(approval)
    const res = await client.callTool({
      name: 'execute_statement',
      arguments: { connectionId: 'c1', sql: 'DROP TABLE t' }
    })
    expect(res.isError).toBe(true)
    expect((res.content as Array<{ text: string }>)[0].text).toMatch(/rejected/i)
    expect(mockAdapter.execute).not.toHaveBeenCalled()
  })
})
