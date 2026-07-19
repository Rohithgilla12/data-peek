import { randomUUID } from 'crypto'
import type { ConnectionConfig, DatabaseType } from '@shared/index'
import { getAdapter, type AdapterQueryResult } from '../db-adapter'
import { parseStatementsWithLines } from '../lib/parse-statements'

export const MCP_MAX_ROWS = 500
// Bound how long a single MCP read may run on PostgreSQL. The read-only keyword
// guard can't catch side-effecting or slow functions inside a SELECT (e.g.
// pg_sleep), and the row cap is applied after the full result is fetched — a
// statement timeout puts a hard ceiling on both a runaway query and a
// SELECT pg_sleep(600) DoS through a tool advertised as safe.
export const MCP_READ_TIMEOUT_MS = 30_000

const READ_FIRST_KEYWORDS = new Set([
  'select',
  'show',
  'explain',
  'describe',
  'desc',
  'with',
  'values',
  'table'
])
const WRITE_KEYWORDS =
  /\b(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|vacuum|exec|execute|call|copy|into)\b/i

export function assertSingleReadStatement(sql: string, dbType: DatabaseType): string {
  const statements = parseStatementsWithLines(sql, dbType)
  if (statements.length !== 1) {
    throw new Error('This tool accepts a single statement; use one tool call per statement')
  }
  const stmt = statements[0].sql.trim()
  const first = stmt.match(/^[\s(]*([a-z]+)/i)?.[1]?.toLowerCase() ?? ''
  const stripped = stmt.replace(/'(?:[^']|'')*'/g, '').replace(/"[^"]*"/g, '')
  if (!READ_FIRST_KEYWORDS.has(first) || WRITE_KEYWORDS.test(stripped)) {
    throw new Error('This tool is read-only; use execute_statement for writes or DDL')
  }
  return stmt
}

export async function runReadOnlyQuery(
  config: ConnectionConfig,
  sql: string,
  maxRows: number = MCP_MAX_ROWS
): Promise<AdapterQueryResult> {
  const dbType = config.dbType || 'postgresql'
  const stmt = assertSingleReadStatement(sql, dbType)
  const adapter = getAdapter(config)
  const cap = Math.min(Math.max(1, maxRows), MCP_MAX_ROWS)

  if (adapter.beginTransaction && adapter.queryInTransaction && adapter.rollbackTransaction) {
    const sessionId = `mcp-ro-${randomUUID()}`
    await adapter.beginTransaction(config, sessionId)
    try {
      if (dbType === 'postgresql') {
        await adapter.queryInTransaction(config, sessionId, 'SET TRANSACTION READ ONLY')
        // SET LOCAL is scoped to this transaction, which is always rolled back.
        await adapter.queryInTransaction(
          config,
          sessionId,
          `SET LOCAL statement_timeout = ${MCP_READ_TIMEOUT_MS}`
        )
      }
      const result = await adapter.queryInTransaction(config, sessionId, stmt)
      return { ...result, rows: result.rows.slice(0, cap) }
    } finally {
      await adapter.rollbackTransaction(config, sessionId).catch(() => undefined)
    }
  }

  const result = await adapter.query(config, stmt)
  return { ...result, rows: result.rows.slice(0, cap) }
}
