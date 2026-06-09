import type { DatabaseType } from '@data-peek/shared'
import type { DataTableFilter, DataTableSort } from '@/components/data-table'
import { isExecutableTab, type Tab } from '@/stores/tab-store'
import { sqlMatchesStoredTable } from '@/lib/editable-select'
import { buildQualifiedTableRef, buildSelectQuery, quoteIdentifier } from '@/lib/sql-helpers'

/**
 * Build a WHERE clause from client-side data-table filters. Values are escaped and
 * matched case-insensitively (ILIKE on Postgres/SQLite, LIKE on MySQL/MSSQL).
 * Returns an empty string when there are no filters.
 */
export function generateWhereClause(
  filters: DataTableFilter[],
  dbType: DatabaseType | undefined
): string {
  if (filters.length === 0) return ''
  const conditions = filters.map((f) => {
    const escapedValue = f.value.replace(/'/g, "''")
    const quotedCol = quoteIdentifier(f.column, dbType)
    if (dbType === 'mssql' || dbType === 'mysql') {
      return `${quotedCol} LIKE '%${escapedValue}%'`
    }
    return `${quotedCol} ILIKE '%${escapedValue}%'`
  })
  return `WHERE ${conditions.join(' AND ')}`
}

/**
 * Build an ORDER BY clause from client-side data-table sorting. Returns an empty
 * string when there is no sorting.
 */
export function generateOrderByClause(
  sorting: DataTableSort[],
  dbType: DatabaseType | undefined
): string {
  if (sorting.length === 0) return ''
  const orders = sorting.map(
    (s) => `${quoteIdentifier(s.column, dbType)} ${s.direction.toUpperCase()}`
  )
  return `ORDER BY ${orders.join(', ')}`
}

/**
 * Produce a new query with the current filters/sorting applied.
 *
 * For a table-preview tab whose editor SQL still targets the stored table, the query
 * is rebuilt from that table. Otherwise (the user rewrote the SQL) WHERE/ORDER BY are
 * injected into their statement, preserving an existing LIMIT/TOP. Returns an empty
 * string for non-executable tabs.
 */
export function buildQueryWithFilters(params: {
  tab: Tab
  dbType: DatabaseType | undefined
  filters: DataTableFilter[]
  sorting: DataTableSort[]
}): string {
  const { tab, dbType, filters, sorting } = params
  if (!isExecutableTab(tab)) return ''

  // For table preview tabs, rebuild from the stored table — but only when the
  // user hasn't rewritten the editor SQL to query something else. Otherwise we'd
  // silently throw away their query and run a filtered statement against a
  // different table than the one they've been looking at.
  if (
    tab.type === 'table-preview' &&
    dbType &&
    sqlMatchesStoredTable(
      tab.savedQuery ?? tab.query,
      { schema: tab.schemaName, table: tab.tableName },
      dbType
    )
  ) {
    const tableRef = buildQualifiedTableRef(tab.schemaName, tab.tableName, dbType)
    const wherePart = generateWhereClause(filters, dbType)
    const orderPart = generateOrderByClause(sorting, dbType)
    return buildSelectQuery(tableRef, dbType, {
      where: wherePart,
      orderBy: orderPart,
      limit: 100
    })
      .replace(/\s+/g, ' ')
      .trim()
  }
  // Fallthrough — when SQL has been rewritten, treat the tab as a query tab
  // and inject WHERE/ORDER BY into the user's SQL.

  // For query tabs, try to inject WHERE/ORDER BY
  // This is simplified - a full implementation would parse the SQL AST
  let baseQuery = tab.query.trim()

  // Remove trailing semicolon
  if (baseQuery.endsWith(';')) {
    baseQuery = baseQuery.slice(0, -1)
  }

  // Remove existing LIMIT (PostgreSQL/MySQL) or TOP (MSSQL) for re-adding
  // LIMIT is at the end: SELECT * FROM table LIMIT 100
  // TOP is after SELECT: SELECT TOP 100 * FROM table
  const limitMatch = baseQuery.match(/\s+LIMIT\s+\d+\s*$/i)
  const topMatch = baseQuery.match(/^(SELECT)\s+(TOP\s+\d+)\s+/i)
  let limitClause = ''
  let topClause = ''

  if (limitMatch) {
    limitClause = limitMatch[0]
    baseQuery = baseQuery.slice(0, -limitMatch[0].length)
  }
  if (topMatch) {
    topClause = topMatch[2] + ' '
    baseQuery = baseQuery.replace(/^SELECT\s+TOP\s+\d+\s+/i, 'SELECT ')
  }

  const wherePart = generateWhereClause(filters, dbType)
  const orderPart = generateOrderByClause(sorting, dbType)

  // Re-add TOP after SELECT for MSSQL, or LIMIT at the end for others
  let result = baseQuery
  if (topClause) {
    result = result.replace(/^SELECT\s+/i, `SELECT ${topClause}`)
  }
  result = `${result} ${wherePart} ${orderPart}${limitClause};`.replace(/\s+/g, ' ').trim()
  return result
}
