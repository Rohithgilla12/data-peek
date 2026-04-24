import * as React from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { escapeCSVValue } from '@/lib/export'
import { notify } from '@/stores'

interface RowContextMenuProps {
  children: React.ReactNode
  /** The row data keyed by column name. */
  row: Record<string, unknown>
  /** Columns in display order; used to produce CSV output. */
  columns: { name: string; dataType: string }[]
  /** Called when the user picks "Duplicate Row". Hidden when omitted. */
  onDuplicate?: () => void
  /** Called when the user picks "Delete Row". Hidden when omitted. */
  onDelete?: () => void
}

function formatRowAsJson(row: Record<string, unknown>, columns: { name: string }[]): string {
  const ordered: Record<string, unknown> = {}
  for (const col of columns) ordered[col.name] = row[col.name]
  return JSON.stringify(ordered, null, 2)
}

function formatRowAsCsv(row: Record<string, unknown>, columns: { name: string }[]): string {
  const header = columns.map((c) => escapeCSVValue(c.name)).join(',')
  const values = columns.map((c) => escapeCSVValue(row[c.name])).join(',')
  return `${header}\n${values}`
}

async function copy(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    notify.success(`${label} copied`)
  } catch (err) {
    notify.error('Copy failed', err instanceof Error ? err.message : String(err))
  }
}

export function RowContextMenu({
  children,
  row,
  columns,
  onDuplicate,
  onDelete
}: RowContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => copy(formatRowAsJson(row, columns), 'Row (JSON)')}>
          Copy Row as JSON
        </ContextMenuItem>
        <ContextMenuItem onClick={() => copy(formatRowAsCsv(row, columns), 'Row (CSV)')}>
          Copy Row as CSV
        </ContextMenuItem>
        {(onDuplicate || onDelete) && <ContextMenuSeparator />}
        {onDuplicate && <ContextMenuItem onClick={onDuplicate}>Duplicate Row</ContextMenuItem>}
        {onDelete && (
          <ContextMenuItem className="text-red-500 focus:text-red-500" onClick={onDelete}>
            Delete Row
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
