import type { NotebookWithCells, PinnedResult } from '@shared/index'

export interface DpnbFile {
  version: 1
  title: string
  folder: string | null
  cells: DpnbCell[]
}

export interface DpnbCell {
  type: 'sql' | 'markdown'
  content: string
  pinnedResult?: PinnedResult
}

const MAX_TABLE_ROWS = 50

export function renderResultAsMarkdownTable(result: PinnedResult): string {
  const { columns, rows } = result
  const displayRows = rows.slice(0, MAX_TABLE_ROWS)

  const header = `| ${columns.join(' | ')} |`
  const separator = `| ${columns.map(() => '---').join(' | ')} |`
  const dataRows = displayRows.map((row) => {
    const cells = columns.map((_, i) => {
      const val = row[i]
      return val === null ? '*null*' : String(val).replace(/\|/g, '\\|')
    })
    return `| ${cells.join(' | ')} |`
  })

  const lines = [header, separator, ...dataRows]

  if (rows.length > MAX_TABLE_ROWS) {
    lines.push('')
    lines.push(`*${rows.length - MAX_TABLE_ROWS} more rows not shown (${rows.length} total)*`)
  }

  return lines.join('\n')
}

export function exportAsDpnb(notebook: NotebookWithCells): string {
  const file: DpnbFile = {
    version: 1,
    title: notebook.title,
    folder: notebook.folder,
    cells: notebook.cells.map((cell) => {
      const dpnbCell: DpnbCell = {
        type: cell.type,
        content: cell.content
      }
      if (cell.pinnedResult !== null) {
        dpnbCell.pinnedResult = cell.pinnedResult
      }
      return dpnbCell
    })
  }

  return JSON.stringify(file, null, 2)
}

export function exportAsMarkdown(notebook: NotebookWithCells): string {
  const lines: string[] = [`# ${notebook.title}`]

  for (const cell of notebook.cells) {
    lines.push('')

    if (cell.type === 'markdown') {
      lines.push(cell.content)
    } else {
      lines.push('```sql')
      lines.push(cell.content)
      lines.push('```')
    }

    if (cell.pinnedResult !== null) {
      lines.push('')
      lines.push(renderResultAsMarkdownTable(cell.pinnedResult))
      lines.push('')
      const date = new Date(cell.pinnedResult.executedAt).toISOString()
      lines.push(
        `*Last run: ${date} (${cell.pinnedResult.durationMs}ms, ${cell.pinnedResult.rowCount} rows)*`
      )
    }
  }

  return lines.join('\n')
}

export function parseDpnb(json: string): DpnbFile | null {
  try {
    const parsed = JSON.parse(json)

    if (parsed.version !== 1) return null
    if (!Array.isArray(parsed.cells)) return null
    if (typeof parsed.title !== 'string') return null

    return parsed as DpnbFile
  } catch {
    return null
  }
}
