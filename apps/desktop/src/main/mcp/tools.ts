import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ConnectionConfig } from '@shared/index'
import { getAdapter } from '../db-adapter'
import { getCachedSchema, isCacheValid, getOrFetchCachedSchema } from '../schema-cache'
import { runReadOnlyQuery, assertSingleReadStatement, MCP_MAX_ROWS } from './read-guard'
import type { ApprovalManager } from './approval'
import { parseStatementsWithLines } from '../lib/parse-statements'
import { recordAudit } from '../audit-service'

export interface McpToolDeps {
  getConnections: () => ConnectionConfig[]
  approval: ApprovalManager
}

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function ok(payload: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }
}

function fail(message: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] }
}

function findConnection(deps: McpToolDeps, connectionId: string): ConnectionConfig {
  const conn = deps.getConnections().find((c) => c.id === connectionId)
  if (!conn) {
    throw new Error(`Unknown connectionId "${connectionId}". Call list_connections first.`)
  }
  return conn
}

async function withToolErrors(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn()
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export function registerMcpTools(server: McpServer, deps: McpToolDeps): void {
  server.registerTool(
    'list_connections',
    {
      description:
        'List saved database connections. Returns id, name, dbType, host, port, database. Never returns credentials.'
    },
    async () =>
      ok(
        deps.getConnections().map((c) => ({
          id: c.id,
          name: c.name,
          dbType: c.dbType || 'postgresql',
          host: c.host,
          port: c.port,
          database: c.database
        }))
      )
  )

  server.registerTool(
    'list_schemas',
    {
      description: 'List schemas, tables, and columns for a connection.',
      inputSchema: { connectionId: z.string() }
    },
    async ({ connectionId }) =>
      withToolErrors(async () => {
        const conn = findConnection(deps, connectionId)
        const cached = getCachedSchema(conn)
        if (cached && isCacheValid(cached)) return ok(cached.schemas)
        const fresh = await getOrFetchCachedSchema(conn, async () => {
          const adapter = getAdapter(conn)
          const [schemas, customTypes] = await Promise.all([
            adapter.getSchemas(conn),
            adapter.getTypes(conn)
          ])
          return { schemas, customTypes, timestamp: Date.now() }
        })
        return ok(fresh.schemas)
      })
  )

  server.registerTool(
    'run_query',
    {
      description: `Run a single read-only SQL statement. On PostgreSQL it runs inside a READ ONLY transaction that is always rolled back and bounded by a statement timeout; on MySQL/SQL Server it is checked by a read-only statement guard (best-effort — a side-effecting function inside a SELECT can still run). Rows are capped at ${MCP_MAX_ROWS}. Use execute_statement for writes/DDL.`,
      inputSchema: {
        connectionId: z.string(),
        sql: z.string(),
        maxRows: z.number().int().min(1).max(MCP_MAX_ROWS).optional()
      }
    },
    async ({ connectionId, sql, maxRows }) =>
      withToolErrors(async () => {
        const conn = findConnection(deps, connectionId)
        const started = Date.now()
        try {
          const result = await runReadOnlyQuery(conn, sql, maxRows)
          recordAudit({
            source: 'mcp',
            connectionId: conn.id ?? 'unsaved',
            connectionName: conn.name ?? conn.database,
            dbType: conn.dbType || 'postgresql',
            sql,
            rowCount: result.rowCount,
            success: true,
            durationMs: Date.now() - started
          })
          return ok({ rows: result.rows, rowCount: result.rowCount })
        } catch (err) {
          recordAudit({
            source: 'mcp',
            connectionId: conn.id ?? 'unsaved',
            connectionName: conn.name ?? conn.database,
            dbType: conn.dbType || 'postgresql',
            sql,
            rowCount: null,
            success: false,
            error: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - started
          })
          throw err
        }
      })
  )

  server.registerTool(
    'explain_query',
    {
      description: 'Get the execution plan for a SQL statement (EXPLAIN, no ANALYZE).',
      inputSchema: { connectionId: z.string(), sql: z.string() }
    },
    async ({ connectionId, sql }) =>
      withToolErrors(async () => {
        const conn = findConnection(deps, connectionId)
        const stmt = assertSingleReadStatement(sql, conn.dbType || 'postgresql')
        const started = Date.now()
        try {
          const result = await getAdapter(conn).explain(conn, stmt, false)
          recordAudit({
            source: 'mcp',
            connectionId: conn.id ?? 'unsaved',
            connectionName: conn.name ?? conn.database,
            dbType: conn.dbType || 'postgresql',
            sql,
            rowCount: null,
            success: true,
            durationMs: Date.now() - started
          })
          return ok(result.plan)
        } catch (err) {
          recordAudit({
            source: 'mcp',
            connectionId: conn.id ?? 'unsaved',
            connectionName: conn.name ?? conn.database,
            dbType: conn.dbType || 'postgresql',
            sql,
            rowCount: null,
            success: false,
            error: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - started
          })
          throw err
        }
      })
  )

  server.registerTool(
    'execute_statement',
    {
      description:
        'Execute a write or DDL statement. The data-peek user must approve each statement in the app; the call blocks until they respond (60s timeout = rejection). Do not retry a rejected statement.',
      inputSchema: { connectionId: z.string(), sql: z.string() }
    },
    async ({ connectionId, sql }) =>
      withToolErrors(async () => {
        const conn = findConnection(deps, connectionId)
        const statements = parseStatementsWithLines(sql, conn.dbType || 'postgresql')
        if (statements.length !== 1) {
          return fail(
            'execute_statement accepts a single statement; use one tool call per statement'
          )
        }
        const stmt = statements[0].sql.trim()
        const approved = await deps.approval.request(conn.name, stmt)
        if (!approved) return fail('User rejected the statement')
        const started = Date.now()
        try {
          const result = await getAdapter(conn).execute(conn, stmt, [])
          recordAudit({
            source: 'mcp',
            connectionId: conn.id ?? 'unsaved',
            connectionName: conn.name ?? conn.database,
            dbType: conn.dbType || 'postgresql',
            sql: stmt,
            rowCount: result.rowCount,
            success: true,
            durationMs: Date.now() - started
          })
          return ok({ rowCount: result.rowCount })
        } catch (err) {
          recordAudit({
            source: 'mcp',
            connectionId: conn.id ?? 'unsaved',
            connectionName: conn.name ?? conn.database,
            dbType: conn.dbType || 'postgresql',
            sql: stmt,
            rowCount: null,
            success: false,
            error: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - started
          })
          throw err
        }
      })
  )
}
