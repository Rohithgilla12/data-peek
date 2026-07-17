import { test, expect } from './fixtures/electron-app'
import { startSeededPostgres, type SeededPostgres } from './fixtures/postgres'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Page } from '@playwright/test'

/**
 * E2E coverage for the embedded MCP server: real Electron main process, real HTTP
 * transport, real MCP SDK client, real Postgres (seeded acme_saas container).
 *
 * Ports are non-default and unique per test so a locally running data-peek instance
 * (which may hold 4722) never interferes.
 */

let pg: SeededPostgres

test.beforeAll(async () => {
  pg = await startSeededPostgres()
})

test.afterAll(async () => {
  await pg?.stop()
})

interface McpStatus {
  enabled: boolean
  running: boolean
  port: number
  token: string
  url: string
}

/** Enable the MCP server on a given port via the renderer's IPC bridge. */
async function enableMcp(window: Page, port: number): Promise<McpStatus> {
  const portResult = await window.evaluate(async (p) => window.api.mcp.setPort(p), port)
  expect(portResult.success).toBe(true)
  const enableResult = await window.evaluate(async () => window.api.mcp.setEnabled(true))
  expect(enableResult.success).toBe(true)
  const status = enableResult.data as McpStatus
  expect(status.running).toBe(true)
  return status
}

function mcpClient(status: McpStatus, token = status.token): Client {
  const client = new Client({ name: 'e2e', version: '0.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(status.url), {
    requestInit: { headers: { authorization: `Bearer ${token}` } }
  })
  // connect() is awaited at call sites; stash transport on the client for reuse.
  ;(client as unknown as { __transport: StreamableHTTPClientTransport }).__transport = transport
  return client
}

async function connect(client: Client): Promise<void> {
  const transport = (client as unknown as { __transport: StreamableHTTPClientTransport })
    .__transport
  await client.connect(transport)
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = result.content as Array<{ type: string; text?: string }>
  return content.map((c) => c.text ?? '').join('\n')
}

test('MCP server is off by default', async ({ window }) => {
  const result = await window.evaluate(async () => window.api.mcp.status())
  expect(result.success).toBe(true)
  const status = result.data as McpStatus
  expect(status.enabled).toBe(false)
  expect(status.running).toBe(false)
  // A token is provisioned eagerly so the settings snippet is copyable pre-enable.
  expect(status.token).toMatch(/^[0-9a-f]{64}$/)
})

test('bearer auth: requests without the token are rejected, valid token connects', async ({
  window
}) => {
  const status = await enableMcp(window, 47231)

  // No Authorization header → 401 before any MCP handling.
  const unauthenticated = await fetch(status.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  })
  expect(unauthenticated.status).toBe(401)

  // Wrong token → 401.
  const wrongToken = await fetch(status.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer wrong' },
    body: '{}'
  })
  expect(wrongToken.status).toBe(401)

  // Real MCP client with the right token completes initialize + tools/list.
  const client = mcpClient(status)
  await connect(client)
  const tools = await client.listTools()
  const names = tools.tools.map((t) => t.name).sort()
  expect(names).toEqual([
    'execute_statement',
    'explain_query',
    'list_connections',
    'list_schemas',
    'run_query'
  ])
  await client.close()
})

test('token regeneration invalidates the old token', async ({ window }) => {
  const status = await enableMcp(window, 47232)
  const oldToken = status.token

  const regen = await window.evaluate(async () => window.api.mcp.regenerateToken())
  expect(regen.success).toBe(true)
  const fresh = regen.data as McpStatus
  expect(fresh.token).not.toBe(oldToken)

  const oldAuth = await fetch(fresh.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${oldToken}` },
    body: '{}'
  })
  expect(oldAuth.status).toBe(401)

  const client = mcpClient(fresh)
  await connect(client)
  await expect(client.listTools()).resolves.toBeTruthy()
  await client.close()
})

test('disabling the server closes the port', async ({ window }) => {
  const status = await enableMcp(window, 47233)

  const disable = await window.evaluate(async () => window.api.mcp.setEnabled(false))
  expect(disable.success).toBe(true)
  expect((disable.data as McpStatus).running).toBe(false)

  await expect(
    fetch(status.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${status.token}` },
      body: '{}'
    })
  ).rejects.toThrow()
})

test('list_connections exposes saved connections without credentials', async ({ window }) => {
  const added = await window.evaluate(async (cfg) => window.api.connections.add(cfg), pg.config)
  expect(added.success).toBe(true)

  const status = await enableMcp(window, 47234)
  const client = mcpClient(status)
  await connect(client)

  const result = await client.callTool({ name: 'list_connections', arguments: {} })
  const connections = JSON.parse(textOf(result)) as Array<Record<string, unknown>>
  const conn = connections.find((c) => c.id === pg.config.id)
  expect(conn).toBeDefined()
  expect(conn?.name).toBe(pg.config.name)
  // Credential fields must be absent entirely, not just empty.
  for (const c of connections) {
    expect(Object.keys(c)).not.toContain('password')
    expect(Object.keys(c)).not.toContain('user')
  }
  await client.close()
})

test('run_query reads from the seeded database and refuses writes', async ({ window }) => {
  await window.evaluate(async (cfg) => window.api.connections.add(cfg), pg.config)
  const status = await enableMcp(window, 47235)
  const client = mcpClient(status)
  await connect(client)

  const read = await client.callTool({
    name: 'run_query',
    arguments: { connectionId: pg.config.id, sql: 'SELECT count(*)::int AS n FROM users' }
  })
  expect(read.isError).toBeFalsy()
  expect(textOf(read)).toMatch(/"n":\s*\d+/)

  const write = await client.callTool({
    name: 'run_query',
    arguments: { connectionId: pg.config.id, sql: "UPDATE users SET email = 'x@x.com'" }
  })
  expect(write.isError).toBe(true)
  expect(textOf(write)).toContain('execute_statement')

  const stacked = await client.callTool({
    name: 'run_query',
    arguments: { connectionId: pg.config.id, sql: 'SELECT 1; DELETE FROM users' }
  })
  expect(stacked.isError).toBe(true)
  await client.close()
})

test('execute_statement: rejecting in the approval dialog blocks the write', async ({ window }) => {
  await window.evaluate(async (cfg) => window.api.connections.add(cfg), pg.config)
  const status = await enableMcp(window, 47236)
  const client = mcpClient(status)
  await connect(client)

  const sql =
    "UPDATE users SET email = 'rejected@example.com' WHERE id = (SELECT id FROM users ORDER BY created_at LIMIT 1)"
  const pendingCall = client.callTool({
    name: 'execute_statement',
    arguments: { connectionId: pg.config.id, sql }
  })

  // The approval dialog surfaces the exact SQL awaiting the user's decision.
  await expect(window.getByText('Agent wants to run a write statement')).toBeVisible()
  await expect(window.getByText(sql)).toBeVisible()
  await window.getByRole('button', { name: 'Reject' }).click()

  const result = await pendingCall
  expect(result.isError).toBe(true)
  expect(textOf(result)).toContain('User rejected the statement')

  // The write must not have reached the database.
  const check = await client.callTool({
    name: 'run_query',
    arguments: {
      connectionId: pg.config.id,
      sql: "SELECT count(*)::int AS n FROM users WHERE email = 'rejected@example.com'"
    }
  })
  expect(textOf(check)).toContain('"n": 0')
  await client.close()
})

test('execute_statement: approving in the dialog runs the write', async ({ window }) => {
  await window.evaluate(async (cfg) => window.api.connections.add(cfg), pg.config)
  const status = await enableMcp(window, 47237)
  const client = mcpClient(status)
  await connect(client)

  const sql =
    "UPDATE users SET email = 'approved@example.com' WHERE id = (SELECT id FROM users ORDER BY created_at LIMIT 1)"
  const pendingCall = client.callTool({
    name: 'execute_statement',
    arguments: { connectionId: pg.config.id, sql }
  })

  await expect(window.getByText('Agent wants to run a write statement')).toBeVisible()
  await window.getByRole('button', { name: 'Approve & run' }).click()

  const result = await pendingCall
  expect(result.isError).toBeFalsy()
  expect(textOf(result)).toContain('"rowCount": 1')

  const check = await client.callTool({
    name: 'run_query',
    arguments: {
      connectionId: pg.config.id,
      sql: "SELECT count(*)::int AS n FROM users WHERE email = 'approved@example.com'"
    }
  })
  expect(textOf(check)).toContain('"n": 1')
  await client.close()
})
