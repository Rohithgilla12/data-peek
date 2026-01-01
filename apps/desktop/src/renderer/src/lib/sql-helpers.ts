import type { DatabaseType } from '@shared/index'

function isWrapped(value: string, start: string, end: string): boolean {
  return value.startsWith(start) && value.endsWith(end) && value.length >= start.length + end.length
}

/**
 * Quote an identifier (schema/table/column/etc) using database-appropriate quoting.
 * - PostgreSQL/SQLite: "identifier"
 * - MySQL: `identifier`
 * - MSSQL: [identifier]
 */
export function quoteIdentifier(name: string, dbType: DatabaseType | undefined): string {
  if (!name) return name

  switch (dbType) {
    case 'mysql': {
      if (isWrapped(name, '`', '`')) return name
      return `\`${name.replace(/`/g, '``')}\``
    }

    case 'mssql': {
      if (isWrapped(name, '[', ']')) return name
      return `[${name.replace(/]/g, ']]')}]`
    }

    // postgresql, sqlite (and default)
    default: {
      if (isWrapped(name, '"', '"')) return name
      return `"${name.replace(/"/g, '""')}"`
    }
  }
}

/**
 * Build a qualified table reference with identifier quoting, omitting the default schema
 * (dbo for MSSQL, public for others) to preserve existing behavior.
 */
export function buildQualifiedTableRef(
  schemaName: string,
  tableName: string,
  dbType: DatabaseType | undefined
): string {
  const defaultSchema = dbType === 'mssql' ? 'dbo' : 'public'
  if (!schemaName || schemaName === defaultSchema) {
    return quoteIdentifier(tableName, dbType)
  }
  return `${quoteIdentifier(schemaName, dbType)}.${quoteIdentifier(tableName, dbType)}`
}

/**
 * Build a fully-qualified table reference with identifier quoting (always includes schema when provided).
 * Useful for operations like export where we want to be explicit even for default schemas.
 */
export function buildFullyQualifiedTableRef(
  schemaName: string,
  tableName: string,
  dbType: DatabaseType | undefined
): string {
  if (!schemaName) return quoteIdentifier(tableName, dbType)
  return `${quoteIdentifier(schemaName, dbType)}.${quoteIdentifier(tableName, dbType)}`
}

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
    offset?: number
  } = {}
): string {
  const { where = '', orderBy = '', limit = 100, offset = 0 } = options

  if (dbType === 'mssql') {
    // MSSQL 2012+ uses OFFSET/FETCH with ORDER BY
    // For older versions or when no ORDER BY, use TOP (no offset support)
    if (offset > 0 || orderBy) {
      // MSSQL requires ORDER BY for OFFSET/FETCH
      const order = orderBy || 'ORDER BY (SELECT NULL)'
      const parts = [`SELECT * FROM ${tableRef}`]
      if (where) parts.push(where)
      parts.push(order)
      parts.push(`OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`)
      return parts.join(' ') + ';'
    } else {
      const topClause = `TOP ${limit}`
      const parts = [`SELECT ${topClause} * FROM ${tableRef}`]
      if (where) parts.push(where)
      return parts.join(' ') + ';'
    }
  } else {
    // PostgreSQL, MySQL, SQLite use LIMIT/OFFSET at the end
    const parts = [`SELECT * FROM ${tableRef}`]
    if (where) parts.push(where)
    if (orderBy) parts.push(orderBy)
    parts.push(`LIMIT ${limit}`)
    if (offset > 0) parts.push(`OFFSET ${offset}`)
    return parts.join(' ') + ';'
  }
}

/**
 * Build a base SELECT query without pagination (LIMIT/OFFSET)
 * Used for storing the query template for server-side pagination
 */
export function buildBaseSelectQuery(
  tableRef: string,
  options: {
    where?: string
    orderBy?: string
  } = {}
): string {
  const { where = '', orderBy = '' } = options
  const parts = [`SELECT * FROM ${tableRef}`]
  if (where) parts.push(where)
  if (orderBy) parts.push(orderBy)
  return parts.join(' ')
}

/**
 * Build a COUNT query to get total rows for pagination
 */
export function buildCountQuery(
  tableRef: string,
  options: {
    where?: string
  } = {}
): string {
  const { where = '' } = options
  const parts = [`SELECT COUNT(*) as total FROM ${tableRef}`]
  if (where) parts.push(where)
  return parts.join(' ') + ';'
}
