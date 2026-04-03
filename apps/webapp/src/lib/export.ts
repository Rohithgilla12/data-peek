function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function exportToCSV(rows: Record<string, unknown>[], fields: { name: string }[]): string {
  const header = fields.map((f) => escapeCSVValue(f.name)).join(',')
  const body = rows
    .map((row) => fields.map((f) => escapeCSVValue(row[f.name])).join(','))
    .join('\n')
  return `${header}\n${body}`
}

export function exportToJSON(rows: Record<string, unknown>[], pretty = true): string {
  return pretty ? JSON.stringify(rows, null, 2) : JSON.stringify(rows)
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadCSV(
  rows: Record<string, unknown>[],
  fields: { name: string }[],
  filename?: string
) {
  const csv = exportToCSV(rows, fields)
  downloadFile(
    csv,
    filename ??
      `export_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.csv`,
    'text/csv'
  )
}

export function downloadJSON(rows: Record<string, unknown>[], filename?: string) {
  const json = exportToJSON(rows)
  downloadFile(
    json,
    filename ??
      `export_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.json`,
    'application/json'
  )
}
