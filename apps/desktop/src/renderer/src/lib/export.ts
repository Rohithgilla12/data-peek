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
function escapeCSVValue(value: unknown): string {
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

// Escape SQL string value
function escapeSQLValue(value: unknown, dataType: string): string {
  if (value === null || value === undefined) {
    return 'NULL'
  }

  const lowerType = dataType.toLowerCase()

  // Boolean types
  if (lowerType.includes('bool')) {
    return value ? 'TRUE' : 'FALSE'
  }

  // Numeric types - don't quote
  if (
    lowerType.includes('int') ||
    lowerType.includes('numeric') ||
    lowerType.includes('decimal') ||
    lowerType.includes('float') ||
    lowerType.includes('double') ||
    lowerType.includes('real') ||
    lowerType.includes('money')
  ) {
    return String(value)
  }

  // JSON/JSONB types
  if (lowerType.includes('json')) {
    const jsonStr = typeof value === 'string' ? value : JSON.stringify(value)
    return `'${jsonStr.replace(/'/g, "''")}'`
  }

  // Array types
  if (Array.isArray(value)) {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`
  }

  // Object types (for complex types)
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`
  }

  // String and other types - quote and escape
  const stringValue = String(value)
  return `'${stringValue.replace(/'/g, "''")}'`
}

// Escape SQL identifier (table/column name)
function escapeSQLIdentifier(name: string): string {
  // Use double quotes for identifiers that need escaping
  if (/^[a-z_][a-z0-9_]*$/i.test(name) && !isSQLKeyword(name)) {
    return name
  }
  return `"${name.replace(/"/g, '""')}"`
}

// Check if a word is a SQL reserved keyword
function isSQLKeyword(word: string): boolean {
  const keywords = new Set([
    'select',
    'from',
    'where',
    'insert',
    'update',
    'delete',
    'create',
    'drop',
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
    'set'
  ])
  return keywords.has(word.toLowerCase())
}

export interface SQLExportOptions {
  tableName: string
  schemaName?: string
}

// Export data to SQL INSERT statements
export function exportToSQL(data: ExportData, options: SQLExportOptions): string {
  if (data.rows.length === 0) {
    return '-- No data to export'
  }

  const qualifiedName = options.schemaName
    ? `${escapeSQLIdentifier(options.schemaName)}.${escapeSQLIdentifier(options.tableName)}`
    : escapeSQLIdentifier(options.tableName)

  const columnNames = data.columns.map((col) => escapeSQLIdentifier(col.name)).join(', ')

  const statements = data.rows.map((row) => {
    const values = data.columns.map((col) => escapeSQLValue(row[col.name], col.dataType)).join(', ')
    return `INSERT INTO ${qualifiedName} (${columnNames}) VALUES (${values});`
  })

  return statements.join('\n')
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
