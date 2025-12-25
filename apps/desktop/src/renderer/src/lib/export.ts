// Export utilities for CSV, JSON, SQL, and Excel formats

export interface ExportOptions {
  filename: string
  format: 'csv' | 'json' | 'sql' | 'xlsx'
}

export interface ExportData {
  columns: { name: string; dataType: string }[]
  rows: Record<string, unknown>[]
}

// Convert value to CSV-safe string
export function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value)

  // Escape if contains comma, newline, or double quotes
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  return stringValue
}

// Export data to CSV format
export function exportToCSV(data: ExportData): string {
  const headers = data.columns.map((col) => escapeCSVValue(col.name)).join(',')
  const rows = data.rows.map((row) =>
    data.columns.map((col) => escapeCSVValue(row[col.name])).join(',')
  )
  return [headers, ...rows].join('\n')
}

// Export data to JSON format
export function exportToJSON(data: ExportData, pretty: boolean = true): string {
  const jsonData = data.rows.map((row) => {
    const obj: Record<string, unknown> = {}
    data.columns.forEach((col) => {
      obj[col.name] = row[col.name]
    })
    return obj
  })
  return pretty ? JSON.stringify(jsonData, null, 2) : JSON.stringify(jsonData)
}

// SQL dialect for database-specific syntax
export type SQLDialect = 'postgresql' | 'mysql' | 'mssql' | 'standard'

// Escape SQL string value based on data type and dialect
export function escapeSQLValue(
  value: unknown,
  dataType: string,
  dialect: SQLDialect = 'standard'
): string {
  if (value === null || value === undefined) {
    return 'NULL'
  }

  const lowerType = dataType.toLowerCase()

  // Boolean types
  if (lowerType.includes('bool') || lowerType === 'bit') {
    if (dialect === 'mysql' || dialect === 'mssql') {
      return value ? '1' : '0'
    }
    return value ? 'TRUE' : 'FALSE'
  }

  // Handle special numeric values
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return dialect === 'postgresql' ? "'NaN'::float" : 'NULL'
    }
    if (!Number.isFinite(value)) {
      if (dialect === 'postgresql') {
        return value > 0 ? "'Infinity'::float" : "'-Infinity'::float"
      }
      return 'NULL'
    }
  }

  // Handle BigInt
  if (typeof value === 'bigint') {
    return value.toString()
  }

  // Numeric types - don't quote
  if (
    lowerType.includes('int') ||
    lowerType.includes('numeric') ||
    lowerType.includes('decimal') ||
    lowerType.includes('float') ||
    lowerType.includes('double') ||
    lowerType.includes('real') ||
    lowerType.includes('money') ||
    lowerType.includes('serial') ||
    lowerType === 'number'
  ) {
    // Validate it's actually a number
    const numVal = Number(value)
    if (!Number.isNaN(numVal)) {
      return String(value)
    }
    // Fall through to string handling if not a valid number
  }

  // UUID types
  if (lowerType.includes('uuid') || lowerType.includes('uniqueidentifier')) {
    const strValue = String(value)
    return `'${strValue.replace(/'/g, "''")}'`
  }

  // Date/Time types
  if (lowerType.includes('date') || lowerType.includes('time') || lowerType.includes('timestamp')) {
    if (value instanceof Date) {
      const isoString = value.toISOString()
      if (lowerType === 'date') {
        return `'${isoString.split('T')[0]}'`
      }
      if (lowerType === 'time' || lowerType === 'time without time zone') {
        return `'${isoString.split('T')[1].replace('Z', '')}'`
      }
      return `'${isoString}'`
    }
    // String date value
    const strValue = String(value)
    return `'${strValue.replace(/'/g, "''")}'`
  }

  // Binary/Bytea types
  if (
    lowerType.includes('bytea') ||
    lowerType.includes('binary') ||
    lowerType.includes('blob') ||
    lowerType.includes('varbinary')
  ) {
    if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value
      const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      if (dialect === 'postgresql') {
        return `'\\x${hex}'`
      }
      if (dialect === 'mysql') {
        return `X'${hex}'`
      }
      if (dialect === 'mssql') {
        return `0x${hex}`
      }
      return `'${hex}'`
    }
    // Assume it's already a hex string or base64
    const strValue = String(value)
    return `'${strValue.replace(/'/g, "''")}'`
  }

  // JSON/JSONB types
  if (lowerType.includes('json')) {
    const jsonStr = typeof value === 'string' ? value : JSON.stringify(value)
    const escaped = jsonStr.replace(/'/g, "''")
    if (dialect === 'postgresql' && lowerType === 'jsonb') {
      return `'${escaped}'::jsonb`
    }
    return `'${escaped}'`
  }

  // Array types (PostgreSQL)
  if (lowerType.startsWith('_') || lowerType.includes('[]') || lowerType === 'array') {
    if (Array.isArray(value)) {
      if (dialect === 'postgresql') {
        const arrayLiteral = JSON.stringify(value)
          .replace(/^\[/, '{')
          .replace(/\]$/, '}')
          .replace(/'/g, "''")
        return `'${arrayLiteral}'`
      }
      return `'${JSON.stringify(value).replace(/'/g, "''")}'`
    }
  }

  // Handle arrays that weren't caught by type
  if (Array.isArray(value)) {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`
  }

  // Object types (for complex types)
  if (typeof value === 'object' && value !== null) {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`
  }

  // String and other types - quote and escape
  const stringValue = String(value)
  return `'${stringValue.replace(/'/g, "''")}'`
}

// Escape SQL identifier (table/column name) based on dialect
export function escapeSQLIdentifier(name: string, dialect: SQLDialect = 'standard'): string {
  // Check if identifier needs quoting
  const needsQuoting = !/^[a-z_][a-z0-9_]*$/i.test(name) || isSQLKeyword(name)

  if (!needsQuoting) {
    return name
  }

  switch (dialect) {
    case 'mysql':
      return `\`${name.replace(/`/g, '``')}\``
    case 'mssql':
      return `[${name.replace(/\]/g, ']]')}]`
    default:
      // PostgreSQL and standard SQL use double quotes
      return `"${name.replace(/"/g, '""')}"`
  }
}

// SQL reserved keywords (common across dialects)
const SQL_KEYWORDS = new Set([
  'select',
  'from',
  'where',
  'insert',
  'update',
  'delete',
  'create',
  'drop',
  'alter',
  'table',
  'index',
  'view',
  'order',
  'by',
  'group',
  'having',
  'join',
  'left',
  'right',
  'inner',
  'outer',
  'cross',
  'full',
  'on',
  'and',
  'or',
  'not',
  'null',
  'true',
  'false',
  'as',
  'in',
  'is',
  'like',
  'between',
  'case',
  'when',
  'then',
  'else',
  'end',
  'user',
  'role',
  'grant',
  'revoke',
  'limit',
  'offset',
  'values',
  'set',
  'primary',
  'key',
  'foreign',
  'references',
  'unique',
  'check',
  'default',
  'constraint',
  'asc',
  'desc',
  'distinct',
  'all',
  'any',
  'exists',
  'union',
  'intersect',
  'except',
  'into',
  'with',
  'recursive',
  'using',
  'natural',
  'partition',
  'over',
  'window',
  'row',
  'rows',
  'range',
  'current',
  'first',
  'last',
  'next',
  'prior',
  'fetch',
  'percent',
  'only',
  'ties'
])

// Check if a word is a SQL reserved keyword
export function isSQLKeyword(word: string): boolean {
  return SQL_KEYWORDS.has(word.toLowerCase())
}

export interface SQLExportOptions {
  tableName: string
  schemaName?: string
  dialect?: SQLDialect
  batchSize?: number // Number of rows per INSERT statement (for batch mode)
  includeTransaction?: boolean // Wrap in BEGIN/COMMIT
}

// Export data to SQL INSERT statements
export function exportToSQL(data: ExportData, options: SQLExportOptions): string {
  if (data.rows.length === 0) {
    return '-- No data to export'
  }

  const dialect = options.dialect || 'standard'
  const batchSize = options.batchSize || 1

  const qualifiedName = options.schemaName
    ? `${escapeSQLIdentifier(options.schemaName, dialect)}.${escapeSQLIdentifier(options.tableName, dialect)}`
    : escapeSQLIdentifier(options.tableName, dialect)

  const columnNames = data.columns.map((col) => escapeSQLIdentifier(col.name, dialect)).join(', ')

  const lines: string[] = []

  // Add transaction wrapper if requested
  if (options.includeTransaction) {
    lines.push('BEGIN;')
    lines.push('')
  }

  // Add header comment
  lines.push(`-- Exported ${data.rows.length} rows from ${options.tableName}`)
  lines.push(`-- Generated at ${new Date().toISOString()}`)
  lines.push('')

  if (batchSize === 1) {
    // Single row per INSERT
    for (const row of data.rows) {
      const values = data.columns
        .map((col) => escapeSQLValue(row[col.name], col.dataType, dialect))
        .join(', ')
      lines.push(`INSERT INTO ${qualifiedName} (${columnNames}) VALUES (${values});`)
    }
  } else {
    // Batch INSERT (multiple rows per statement)
    for (let i = 0; i < data.rows.length; i += batchSize) {
      const batch = data.rows.slice(i, i + batchSize)
      const valuesClauses = batch.map((row) => {
        const values = data.columns
          .map((col) => escapeSQLValue(row[col.name], col.dataType, dialect))
          .join(', ')
        return `(${values})`
      })

      lines.push(`INSERT INTO ${qualifiedName} (${columnNames})`)
      lines.push(`VALUES ${valuesClauses.join(',\n       ')};`)
      lines.push('')
    }
  }

  // Close transaction if opened
  if (options.includeTransaction) {
    lines.push('')
    lines.push('COMMIT;')
  }

  return lines.join('\n')
}

// Trigger download in browser
export function downloadFile(content: string | Blob, filename: string, mimeType: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Export and download CSV
export function downloadCSV(data: ExportData, filename: string): void {
  const csv = exportToCSV(data)
  downloadFile(csv, filename.endsWith('.csv') ? filename : `${filename}.csv`, 'text/csv')
}

// Export and download JSON
export function downloadJSON(data: ExportData, filename: string): void {
  const json = exportToJSON(data)
  downloadFile(json, filename.endsWith('.json') ? filename : `${filename}.json`, 'application/json')
}

// Export and download SQL
export function downloadSQL(data: ExportData, filename: string, options: SQLExportOptions): void {
  const sql = exportToSQL(data, options)
  downloadFile(sql, filename.endsWith('.sql') ? filename : `${filename}.sql`, 'text/sql')
}

// Generate default filename based on timestamp and optional table name
export function generateExportFilename(tableName?: string): string {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')
  return tableName ? `${tableName}_${timestamp}` : `query_result_${timestamp}`
}
