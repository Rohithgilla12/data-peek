import {
  type CellSelection,
  type CellPosition,
  type CellSnapshot,
  rangeBounds
} from '../components/cell-grid/cell-grid-types'

export type SelectionFormat = 'tsv' | 'csv' | 'json' | 'markdown'

export interface SerializeSelectionOptions {
  includeHeaders?: boolean
}

export function escapeTSVValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (str.includes('\t') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function escapeMarkdownValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return str.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

/**
 * Serializes a CellSelection in TSV, CSV, JSON, or Markdown format.
 *
 * Spec: If sparse selection is present (additional.length > 0), only serialize the primary range.
 */
export function serializeSelection(
  selection: CellSelection,
  format: SelectionFormat,
  getCell: (pos: CellPosition) => CellSnapshot,
  options?: SerializeSelectionOptions
): string {
  // Always serialize only the primary range (sparse selections are ambiguous in table geometry)
  const { r1, c1, r2, c2 } = rangeBounds(selection.primary)

  const columnNames: string[] = []
  for (let c = c1; c <= c2; c++) {
    const snap = getCell({ row: r1, col: c })
    columnNames.push(snap.columnName)
  }

  const rows: CellSnapshot[][] = []
  for (let r = r1; r <= r2; r++) {
    const rowSnapshots: CellSnapshot[] = []
    for (let c = c1; c <= c2; c++) {
      rowSnapshots.push(getCell({ row: r, col: c }))
    }
    rows.push(rowSnapshots)
  }

  switch (format) {
    case 'tsv': {
      const dataRows = rows.map((row) => row.map((cell) => escapeTSVValue(cell.value)).join('\t'))
      if (options?.includeHeaders) {
        const headerRow = columnNames.map(escapeTSVValue).join('\t')
        return [headerRow, ...dataRows].join('\n')
      }
      return dataRows.join('\n')
    }

    case 'csv': {
      const dataRows = rows.map((row) => row.map((cell) => escapeCSVValue(cell.value)).join(','))
      if (options?.includeHeaders) {
        const headerRow = columnNames.map(escapeCSVValue).join(',')
        return [headerRow, ...dataRows].join('\n')
      }
      return dataRows.join('\n')
    }

    case 'json': {
      if (options?.includeHeaders) {
        const nameCount = new Map<string, number>()
        const uniqueKeys = columnNames.map((name) => {
          const count = nameCount.get(name) ?? 0
          nameCount.set(name, count + 1)
          return count === 0 ? name : `${name}_${count + 1}`
        })

        const objects = rows.map((row) => {
          const obj = Object.create(null)
          row.forEach((cell, idx) => {
            const key = uniqueKeys[idx]
            Object.defineProperty(obj, key, {
              value: cell.value === undefined ? null : cell.value,
              enumerable: true,
              writable: true,
              configurable: true
            })
          })
          return obj
        })
        return JSON.stringify(objects, null, 2)
      }
      const arrays = rows.map((row) =>
        row.map((cell) => (cell.value === undefined ? null : cell.value))
      )
      return JSON.stringify(arrays, null, 2)
    }

    case 'markdown': {
      const headers = columnNames.map((name) => escapeMarkdownValue(name)).join(' | ')
      const separator = columnNames.map(() => '---').join(' | ')
      const dataRows = rows.map(
        (row) => `| ${row.map((cell) => escapeMarkdownValue(cell.value)).join(' | ')} |`
      )
      return [`| ${headers} |`, `| ${separator} |`, ...dataRows].join('\n')
    }
  }
}
