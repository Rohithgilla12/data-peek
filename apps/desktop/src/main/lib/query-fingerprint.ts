/**
 * Query Fingerprinting Utility
 *
 * Normalizes SQL queries by replacing literals with placeholders,
 * enabling pattern detection for N+1 query analysis.
 */

/**
 * Normalize a SQL query for pattern detection by replacing literals with placeholders.
 * This creates a "fingerprint" that can be used to detect repeated similar queries.
 *
 * @param sql - The SQL query to normalize
 * @returns Normalized query with literals replaced by '?'
 */
export function fingerprintQuery(sql: string): string {
  let normalized = sql.trim()

  // Normalize whitespace (but preserve structure)
  normalized = normalized.replace(/\s+/g, ' ')

  // Replace single-quoted string literals (handles escaped quotes)
  // Matches 'string', 'it''s', etc.
  normalized = normalized.replace(/'(?:[^'\\]|\\.|'')*'/g, '?')

  // Replace double-quoted strings (if used as literals, not identifiers)
  // Be careful here - in PostgreSQL, double quotes are for identifiers
  // We only replace them if they look like string values (after operators)
  normalized = normalized.replace(/=\s*"[^"]*"/g, '= ?')

  // Replace numeric literals (integers and decimals)
  // Handles: 123, 123.45, .45, -123, +123
  // But preserve identifiers like table1
  normalized = normalized.replace(/(?<=\s|=|<|>|,|\(|!|^)-?\d+\.?\d*/g, '?')
  normalized = normalized.replace(/(?<=\s|=|<|>|,|\(|!|^)\.\d+/g, '?')

  // Replace UUIDs
  normalized = normalized.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '?'
  )

  // Replace hex literals (0x...)
  normalized = normalized.replace(/0x[0-9a-f]+/gi, '?')

  // Normalize IN lists: IN (?, ?, ?) -> IN (?)
  normalized = normalized.replace(/in\s*\(\s*\?(?:\s*,\s*\?)*\s*\)/gi, 'IN (?)')

  // Normalize multiple consecutive placeholders in VALUES
  normalized = normalized.replace(/\(\s*\?(?:\s*,\s*\?)*\s*\)/g, '(?)')

  // Normalize LIMIT and OFFSET values (already replaced by numeric handling above)
  // Just ensure consistent formatting
  normalized = normalized.replace(/limit\s+\?/gi, 'LIMIT ?')
  normalized = normalized.replace(/offset\s+\?/gi, 'OFFSET ?')

  // Convert to lowercase for consistent comparison
  normalized = normalized.toLowerCase()

  return normalized
}

/**
 * Extract table and column information from a SELECT query's WHERE clause.
 * Used for generating index suggestions.
 *
 * @param sql - The SQL query to analyze
 * @returns Object with table name and array of columns used in WHERE clause
 */
export function extractWhereInfo(sql: string): {
  tableName?: string
  schema?: string
  whereColumns: string[]
  joinColumns: string[]
  orderByColumns: string[]
} {
  const normalized = sql.replace(/\s+/g, ' ').trim()
  const whereColumns: string[] = []
  const joinColumns: string[] = []
  const orderByColumns: string[] = []

  // Extract table name from FROM clause
  // Handles: FROM table, FROM schema.table, FROM table AS t, FROM "Table"
  const fromMatch = normalized.match(
    /from\s+(?:"([^"]+)"|(\w+))(?:\.(?:"([^"]+)"|(\w+)))?\s*(?:as\s+\w+)?/i
  )

  let schema: string | undefined
  let tableName: string | undefined

  if (fromMatch) {
    if (fromMatch[3] || fromMatch[4]) {
      // schema.table format
      schema = fromMatch[1] || fromMatch[2]
      tableName = fromMatch[3] || fromMatch[4]
    } else {
      tableName = fromMatch[1] || fromMatch[2]
    }
  }

  // Extract columns from WHERE clause
  const whereMatch = normalized.match(
    /where\s+(.+?)(?:\s+order\s+by|\s+group\s+by|\s+limit|\s+offset|$)/i
  )
  if (whereMatch) {
    const whereClause = whereMatch[1]
    // Match column names before comparison operators
    // Handles: column =, column <, column >, column !=, column <>, column LIKE, column IN, column IS
    const whereColPattern =
      /(?:^|\s|and|or|\()\s*(?:(\w+)\.)?(\w+)\s*(?:=|<|>|<=|>=|<>|!=|like|ilike|in\s*\(|is\s+)/gi
    const colMatches = whereClause.matchAll(whereColPattern)
    for (const match of colMatches) {
      const col = match[2]
      if (col && !['and', 'or', 'not', 'null', 'true', 'false'].includes(col.toLowerCase())) {
        whereColumns.push(col.toLowerCase())
      }
    }
  }

  // Extract columns from JOIN conditions
  const joinPattern =
    /join\s+\w+(?:\.\w+)?\s+(?:as\s+\w+\s+)?on\s+([^,]+?)(?:\s+(?:left|right|inner|outer|join|where|order|group|limit)|$)/gi
  const joinMatches = normalized.matchAll(joinPattern)
  for (const joinMatch of joinMatches) {
    const onClause = joinMatch[1]
    const colMatches = onClause.matchAll(/(\w+)\.(\w+)\s*=/gi)
    for (const match of colMatches) {
      joinColumns.push(match[2].toLowerCase())
    }
  }

  // Extract columns from ORDER BY
  const orderMatch = normalized.match(/order\s+by\s+(.+?)(?:\s+limit|\s+offset|$)/i)
  if (orderMatch) {
    const orderClause = orderMatch[1]
    const colMatches = orderClause.matchAll(/(?:^|,)\s*(?:\w+\.)?(\w+)(?:\s+(?:asc|desc))?/gi)
    for (const match of colMatches) {
      const col = match[1]
      if (col && !['asc', 'desc'].includes(col.toLowerCase())) {
        orderByColumns.push(col.toLowerCase())
      }
    }
  }

  return {
    tableName,
    schema,
    whereColumns: [...new Set(whereColumns)],
    joinColumns: [...new Set(joinColumns)],
    orderByColumns: [...new Set(orderByColumns)]
  }
}

/**
 * Check if a query looks like a SELECT query (for N+1 detection).
 *
 * @param sql - The SQL query
 * @returns true if the query is a SELECT statement
 */
export function isSelectQuery(sql: string): boolean {
  const normalized = sql.trim().toLowerCase()
  return normalized.startsWith('select')
}

/**
 * Generate a shorter hash-like fingerprint for quick comparison.
 * Uses a simple string hash for efficiency.
 *
 * @param fingerprint - The normalized query fingerprint
 * @returns A short hash string
 */
export function hashFingerprint(fingerprint: string): string {
  let hash = 0
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}
