import type { DatabaseType } from '@shared/index'

/**
 * Generate database-appropriate LIMIT/TOP clause
 * @param dbType - Database type
 * @param limit - Number of rows to limit
 * @returns SQL clause string (e.g., "LIMIT 100" or "TOP 100")
 */
export function generateLimitClause(dbType: DatabaseType | undefined, limit: number): string {
  if (dbType === 'mssql') {
    return `TOP ${limit}`
  }
  return `LIMIT ${limit}`
}

/**
 * Build a SELECT query with appropriate LIMIT/TOP syntax
 * @param tableRef - Table reference (e.g., "schema.table" or "table")
 * @param dbType - Database type
 * @param options - Query options
 * @returns Complete SELECT query string
 */
export function buildSelectQuery(
  tableRef: string,
  dbType: DatabaseType | undefined,
  options: {
    where?: string
    orderBy?: string
    limit?: number
  } = {}
): string {
  const { where = '', orderBy = '', limit = 100 } = options

  if (dbType === 'mssql') {
    // MSSQL uses TOP before SELECT columns
    const topClause = `TOP ${limit}`
    const parts = [`SELECT ${topClause} * FROM ${tableRef}`]
    if (where) parts.push(where)
    if (orderBy) parts.push(orderBy)
    return parts.join(' ') + ';'
  } else {
    // PostgreSQL, MySQL, SQLite use LIMIT at the end
    const parts = [`SELECT * FROM ${tableRef}`]
    if (where) parts.push(where)
    if (orderBy) parts.push(orderBy)
    parts.push(`LIMIT ${limit}`)
    return parts.join(' ') + ';'
  }
}

