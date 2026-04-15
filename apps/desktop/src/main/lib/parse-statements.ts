import type { DatabaseType } from '@shared/index'
import { DDL_KEYWORD_REGEX } from '@shared/index'
import type { ParsedStatement } from '@shared/index'
import { splitStatements } from './sql-parser'

/**
 * Strip leading single-line (--) and block (/* *\/) comments from a SQL statement,
 * returning only the actual statement text with surrounding whitespace trimmed.
 */
function stripLeadingComments(stmt: string): string {
  let s = stmt.trimStart()
  let changed = true
  while (changed) {
    changed = false
    if (s.startsWith('--')) {
      const nl = s.indexOf('\n')
      s = nl === -1 ? '' : s.slice(nl + 1).trimStart()
      changed = true
    } else if (s.startsWith('/*')) {
      const end = s.indexOf('*/')
      s = end === -1 ? '' : s.slice(end + 2).trimStart()
      changed = true
    }
  }
  return s.trimEnd()
}

/**
 * Parse SQL into statements with line-range metadata.
 * Uses the existing splitStatements parser to preserve dialect-specific behavior
 * (dollar quotes, backticks, bracket identifiers, etc.) then walks the original
 * SQL to find each statement's line range.
 */
export function parseStatementsWithLines(
  sql: string,
  dbType: DatabaseType
): ParsedStatement[] {
  const rawStatements = splitStatements(sql, dbType)
  if (rawStatements.length === 0) return []

  const result: ParsedStatement[] = []
  let searchFrom = 0

  for (let i = 0; i < rawStatements.length; i++) {
    const stmt = rawStatements[i]
    const sqlOnly = stripLeadingComments(stmt)
    if (sqlOnly.length === 0) continue

    const startInSql = sql.indexOf(sqlOnly, searchFrom)
    if (startInSql === -1) {
      result.push({
        index: result.length,
        sql: sqlOnly,
        startLine: countLines(sql, searchFrom) + 1,
        endLine: countLines(sql, searchFrom + sqlOnly.length) + 1,
        isDDL: DDL_KEYWORD_REGEX.test(sqlOnly)
      })
      searchFrom += sqlOnly.length
      continue
    }

    const endInSql = startInSql + sqlOnly.length
    const startLine = countLines(sql, startInSql) + 1
    const endLine = countLines(sql, endInSql) + 1

    result.push({
      index: result.length,
      sql: sqlOnly,
      startLine,
      endLine,
      isDDL: DDL_KEYWORD_REGEX.test(sqlOnly)
    })

    searchFrom = endInSql
  }

  return result
}

function countLines(sql: string, upTo: number): number {
  let count = 0
  for (let i = 0; i < upTo && i < sql.length; i++) {
    if (sql[i] === '\n') count++
  }
  return count
}
