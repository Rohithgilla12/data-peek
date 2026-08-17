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
 * Blank out string literals and quoted identifiers, and record the paren depth at
 * every position. Clause keywords are only meaningful at depth zero and outside
 * quotes, so scanning the masked copy keeps a subquery, a window function or a
 * literal containing the word "where" from being mistaken for a real clause.
 */
function maskAndDepths(sql: string): { masked: string; depth: number[] } {
  const masked = sql.split('')
  const depth = new Array<number>(sql.length).fill(0)
  let current = 0
  let quote: string | null = null

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    depth[i] = current

    if (quote) {
      masked[i] = ' '
      if (ch === quote) {
        // A doubled quote is an escaped one, still inside the literal.
        if (sql[i + 1] === quote) {
          masked[i + 1] = ' '
          depth[i + 1] = current
          i++
        } else {
          quote = null
        }
      }
      continue
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      masked[i] = ' '
      continue
    }
    if (ch === '(') current++
    else if (ch === ')' && current > 0) {
      current--
      depth[i] = current
    }
  }

  return { masked: masked.join(''), depth }
}

/** Index of the last depth-zero match, or null when the keyword never appears there. */
function lastTopLevelIndex(sql: string, pattern: RegExp): number | null {
  const { masked, depth } = maskAndDepths(sql)
  const scan = new RegExp(pattern.source, 'gi')
  let last: number | null = null
  let match: RegExpExecArray | null
  while ((match = scan.exec(masked)) !== null) {
    if (depth[match.index] === 0) last = match.index
    scan.lastIndex = match.index + 1
  }
  return last
}

/** Index of the first depth-zero match at or after `from`, or null. */
function firstTopLevelIndexAfter(sql: string, pattern: RegExp, from: number): number | null {
  const { masked, depth } = maskAndDepths(sql)
  const scan = new RegExp(pattern.source, 'gi')
  let match: RegExpExecArray | null
  while ((match = scan.exec(masked)) !== null) {
    if (match.index >= from && depth[match.index] === 0) return match.index
    scan.lastIndex = match.index + 1
  }
  return null
}

/** Clauses that may legally follow a WHERE and must not be swallowed into it. */
const CLAUSE_AFTER_WHERE =
  /\s(GROUP\s+BY|HAVING|WINDOW|ORDER\s+BY|LIMIT|OFFSET|FETCH|UNION|INTERSECT|EXCEPT|RETURNING)\s/

/** Pagination keywords, extracted as a unit so a new ORDER BY lands before them. */
const PAGINATION_CLAUSE = /\s(LIMIT|OFFSET|FETCH)\s/

/**
 * Remove the top-level ORDER BY so a new one can replace it.
 *
 * The *last* depth-zero occurrence is the statement's own clause; an ORDER BY inside
 * a window function or a subquery sits at a deeper paren level and is left untouched.
 * Matching the first occurrence instead would miss the real clause whenever a
 * subquery precedes it, and the caller would then append a second ORDER BY.
 */
export function stripTrailingOrderBy(sql: string): string {
  const index = lastTopLevelIndex(sql, /\sORDER\s+BY\s/)
  if (index === null) return sql
  return sql.slice(0, index).trimEnd()
}

/**
 * Merge a generated WHERE clause into a query that may already have one.
 *
 * Both clauses are parenthesised so operator precedence cannot change the meaning of
 * the user's original predicate. As with ORDER BY, a WHERE nested inside parens
 * belongs to a subquery and is skipped.
 */
export function mergeWhereClause(sql: string, whereClause: string): string {
  if (!whereClause) return sql

  const newCondition = whereClause.replace(/^WHERE\s+/i, '')
  const index = lastTopLevelIndex(sql, /\sWHERE\s/)

  if (index === null) return `${sql.trimEnd()} ${whereClause}`

  // The predicate ends at the next top-level clause, not at the end of the statement.
  // Running to the end would fold a GROUP BY or ORDER BY inside the parentheses.
  const boundary = firstTopLevelIndexAfter(sql, CLAUSE_AFTER_WHERE, index + 1)
  const end = boundary ?? sql.length

  const head = sql.slice(0, index).trimEnd()
  const existing = sql
    .slice(index, end)
    .replace(/^\s*WHERE\s+/i, '')
    .trim()
  const rest = sql.slice(end)

  return `${head} WHERE (${existing}) AND (${newCondition})${rest}`
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
  limit?: number
}): string {
  const { tab, dbType, filters, sorting, limit = 100 } = params
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
      limit
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

  // Detach existing pagination (PostgreSQL/MySQL) or TOP (MSSQL) so the rewritten
  // WHERE/ORDER BY slot in ahead of it, then re-attach verbatim.
  // Pagination trails the statement: SELECT * FROM table LIMIT 100 OFFSET 20
  // TOP is after SELECT: SELECT TOP 100 * FROM table
  const paginationIndex = lastTopLevelIndex(baseQuery, PAGINATION_CLAUSE)
  const topMatch = baseQuery.match(/^(SELECT)\s+(TOP\s*\(?\s*\d+\s*\)?)\s+/i)
  let limitClause = ''
  let topClause = ''

  if (paginationIndex !== null) {
    // Keep the earliest keyword of the run so `LIMIT n OFFSET m` moves as one piece.
    const start = firstTopLevelIndexAfter(baseQuery, PAGINATION_CLAUSE, 0) ?? paginationIndex
    limitClause = baseQuery.slice(start)
    baseQuery = baseQuery.slice(0, start)
  }
  if (topMatch) {
    topClause = topMatch[2] + ' '
    baseQuery = baseQuery.replace(/^SELECT\s+TOP\s*\(?\s*\d+\s*\)?\s+/i, 'SELECT ')
  }

  baseQuery = stripTrailingOrderBy(baseQuery)

  const wherePart = generateWhereClause(filters, dbType)
  const orderPart = generateOrderByClause(sorting, dbType)

  // Re-add TOP after SELECT for MSSQL, or LIMIT at the end for others
  let result = baseQuery
  if (topClause) {
    result = result.replace(/^SELECT\s+/i, `SELECT ${topClause}`)
  }
  result = mergeWhereClause(result, wherePart)
  result = `${result} ${orderPart}${limitClause};`.replace(/\s+/g, ' ').trim()
  return result
}
