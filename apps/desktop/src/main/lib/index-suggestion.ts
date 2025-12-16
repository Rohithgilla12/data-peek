/**
 * Index Suggestion Generator
 *
 * Generates CREATE INDEX statements based on query analysis.
 * Follows PostgreSQL best practices for index creation.
 */

export interface IndexSuggestionOptions {
  /** Schema name (defaults to 'public') */
  schema?: string
  /** Whether to use CONCURRENTLY (recommended for production) */
  concurrent?: boolean
  /** Whether to create a unique index */
  unique?: boolean
  /** Custom index name (auto-generated if not provided) */
  indexName?: string
  /** Index method (btree, hash, gist, gin, etc.) */
  method?: 'btree' | 'hash' | 'gist' | 'gin' | 'spgist' | 'brin'
  /** WHERE clause for partial index */
  whereClause?: string
  /** INCLUDE columns for covering index */
  includeColumns?: string[]
}

/**
 * Generate a CREATE INDEX statement for PostgreSQL.
 *
 * @param tableName - Table to create index on
 * @param columns - Columns to include in the index (order matters)
 * @param options - Additional options for index creation
 * @returns CREATE INDEX SQL statement
 */
export function generateIndexSuggestion(
  tableName: string,
  columns: string[],
  options: IndexSuggestionOptions = {}
): string {
  const {
    schema = 'public',
    concurrent = true,
    unique = false,
    indexName,
    method,
    whereClause,
    includeColumns
  } = options

  if (columns.length === 0) {
    return ''
  }

  // Generate index name if not provided
  const name = indexName || generateIndexName(tableName, columns)

  // Build the statement parts
  const parts: string[] = ['CREATE']

  if (unique) {
    parts.push('UNIQUE')
  }

  parts.push('INDEX')

  if (concurrent) {
    parts.push('CONCURRENTLY')
  }

  parts.push(name)
  parts.push('ON')
  parts.push(`${schema}.${tableName}`)

  // Add method if specified (and not default btree)
  if (method && method !== 'btree') {
    parts.push(`USING ${method}`)
  }

  // Column list
  parts.push(`(${columns.join(', ')})`)

  // Include columns for covering index (PostgreSQL 11+)
  if (includeColumns && includeColumns.length > 0) {
    parts.push(`INCLUDE (${includeColumns.join(', ')})`)
  }

  // Partial index WHERE clause
  if (whereClause) {
    parts.push(`WHERE ${whereClause}`)
  }

  return parts.join(' ') + ';'
}

/**
 * Generate a standard index name following convention: idx_{table}_{columns}
 *
 * @param tableName - Table name
 * @param columns - Column names
 * @returns Generated index name
 */
export function generateIndexName(tableName: string, columns: string[]): string {
  const cleanTable = tableName.replace(/[^a-z0-9_]/gi, '').toLowerCase()
  const cleanColumns = columns.map((c) => c.replace(/[^a-z0-9_]/gi, '').toLowerCase())

  // Truncate if too long (PostgreSQL limit is 63 bytes)
  let name = `idx_${cleanTable}_${cleanColumns.join('_')}`
  if (name.length > 63) {
    name = name.substring(0, 63)
  }

  return name
}

/**
 * Suggest an optimal composite index based on query patterns.
 *
 * Best practices for column ordering:
 * 1. Equality columns first (WHERE col = ?)
 * 2. Range/inequality columns next (WHERE col > ?)
 * 3. ORDER BY columns last
 *
 * @param tableName - Table name
 * @param equalityColumns - Columns used with = operator
 * @param rangeColumns - Columns used with <, >, etc.
 * @param orderByColumns - Columns in ORDER BY
 * @param options - Additional index options
 * @returns CREATE INDEX statement
 */
export function suggestCompositeIndex(
  tableName: string,
  equalityColumns: string[],
  rangeColumns: string[],
  orderByColumns: string[],
  options: IndexSuggestionOptions = {}
): string {
  // Remove duplicates while preserving order
  const seen = new Set<string>()
  const columns: string[] = []

  // Add equality columns first
  for (const col of equalityColumns) {
    const lower = col.toLowerCase()
    if (!seen.has(lower)) {
      seen.add(lower)
      columns.push(lower)
    }
  }

  // Add range columns
  for (const col of rangeColumns) {
    const lower = col.toLowerCase()
    if (!seen.has(lower)) {
      seen.add(lower)
      columns.push(lower)
    }
  }

  // Add order by columns
  for (const col of orderByColumns) {
    const lower = col.toLowerCase()
    if (!seen.has(lower)) {
      seen.add(lower)
      columns.push(lower)
    }
  }

  return generateIndexSuggestion(tableName, columns, options)
}

/**
 * Format an index suggestion with explanation comment.
 *
 * @param tableName - Table name
 * @param columns - Index columns
 * @param reason - Why this index is suggested
 * @param options - Index options
 * @returns Formatted SQL with comment
 */
export function formatIndexSuggestionWithComment(
  tableName: string,
  columns: string[],
  reason: string,
  options: IndexSuggestionOptions = {}
): string {
  const sql = generateIndexSuggestion(tableName, columns, options)
  return `-- ${reason}\n${sql}`
}
