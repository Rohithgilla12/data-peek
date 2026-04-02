// Export utilities for CSV, JSON, SQL, and Excel formats

export { escapeSQLValue, escapeSQLIdentifier, isSQLKeyword } from '@shared/sql-escape'
export type { SQLDialect } from '@shared/sql-escape'

import { escapeSQLIdentifier, escapeSQLValue } from '@shared/sql-escape'
import type { SQLDialect } from '@shared/sql-escape'

export interface ExportOptions {
  filename: string
  format: 'csv' | 'json' | 'sql' | 'xlsx'
}

export interface ExportData {
  columns: { name: string; dataType: string }[]
  rows: Record<string, unknown>[]
}

export function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value)

  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  return stringValue
}

export function exportToCSV(data: ExportData): string {
  const headers = data.columns.map((col) => escapeCSVValue(col.name)).join(',')
  const rows = data.rows.map((row) =>
    data.columns.map((col) => escapeCSVValue(row[col.name])).join(',')
  )
  return [headers, ...rows].join('\n')
}

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
