import type { ConnectionConfig, DatabaseType } from '@shared/index'
import { getAdapter, type AdapterQueryResult } from '../db-adapter'
import { parseStatementsWithLines } from '../lib/parse-statements'

export const MCP_MAX_ROWS = 500
// Bound how long a single read-only query may run (enforced server-side on
// PostgreSQL and ClickHouse, client-side on MySQL; SQL Server uses the pool's
// request timeout). The read-only keyword
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
// Transaction control is listed because T-SQL needs no `;` between statements:
// `SELECT 1 COMMIT WRITETEXT ...` parses as one statement, and its COMMIT would
// end the transaction the caller rolls back. `NEXT VALUE FOR` advances a SQL
// Server sequence, which a rollback does not undo.
const WRITE_KEYWORDS =
  /\b(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|vacuum|exec|execute|call|copy|into|begin|commit|rollback|savepoint|updatetext|writetext)\b|\bnext\s+value\s+for\b/i

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
  { maxRows = MCP_MAX_ROWS, executionId }: { maxRows?: number; executionId?: string } = {}
): Promise<AdapterQueryResult> {
  const stmt = assertSingleReadStatement(sql, config.dbType || 'postgresql')
  const cap = Math.min(Math.max(1, maxRows), MCP_MAX_ROWS)
  const result = await getAdapter(config).queryReadOnly(config, stmt, {
    timeoutMs: MCP_READ_TIMEOUT_MS,
    maxRows: cap,
    executionId
  })
  return { ...result, rows: result.rows.slice(0, cap) }
}
