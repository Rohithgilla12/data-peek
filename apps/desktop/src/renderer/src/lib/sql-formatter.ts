import { format, type SqlLanguage } from 'sql-formatter'
import type { DatabaseType } from '@shared/index'

export interface FormatOptions {
  language?: SqlLanguage
  tabWidth?: number
  useTabs?: boolean
  keywordCase?: 'upper' | 'lower' | 'preserve'
  linesBetweenQueries?: number
}

const defaultOptions: FormatOptions = {
  language: 'postgresql',
  tabWidth: 2,
  useTabs: false,
  keywordCase: 'upper',
  linesBetweenQueries: 2
}

const DB_TYPE_TO_LANGUAGE: Record<DatabaseType, SqlLanguage> = {
  postgresql: 'postgresql',
  mysql: 'mysql',
  sqlite: 'sqlite',
  mssql: 'transactsql',
  clickhouse: 'clickhouse'
}

export function formatterLanguage(dbType: DatabaseType | undefined): SqlLanguage {
  return dbType ? (DB_TYPE_TO_LANGUAGE[dbType] ?? 'postgresql') : 'postgresql'
}

/**
 * Format SQL query with configurable options
 */
export function formatSQL(query: string, options: FormatOptions = {}): string {
  const mergedOptions = { ...defaultOptions, ...options }

  try {
    return format(query, {
      language: mergedOptions.language,
      tabWidth: mergedOptions.tabWidth,
      useTabs: mergedOptions.useTabs,
      keywordCase: mergedOptions.keywordCase,
      linesBetweenQueries: mergedOptions.linesBetweenQueries
    })
  } catch {
    // If formatting fails, return the original query
    return query
  }
}

/**
 * Check if a query is valid SQL (basic validation)
 */
export function isValidSQL(query: string): boolean {
  const trimmed = query.trim()
  if (!trimmed) return false

  // Check for common SQL statement patterns
  const sqlPatterns = [
    /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|WITH)\s/i,
    /^\s*--/i, // SQL comments are valid
    /^\s*\/\*/i // Block comments
  ]

  return sqlPatterns.some((pattern) => pattern.test(trimmed))
}

/**
 * Get the type of SQL statement
 */
export function getQueryType(query: string): string | null {
  const trimmed = query.trim().toUpperCase()

  if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) return 'SELECT'
  if (trimmed.startsWith('INSERT')) return 'INSERT'
  if (trimmed.startsWith('UPDATE')) return 'UPDATE'
  if (trimmed.startsWith('DELETE')) return 'DELETE'
  if (trimmed.startsWith('CREATE')) return 'CREATE'
  if (trimmed.startsWith('ALTER')) return 'ALTER'
  if (trimmed.startsWith('DROP')) return 'DROP'
  if (trimmed.startsWith('TRUNCATE')) return 'TRUNCATE'

  return null
}
