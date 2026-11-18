import * as React from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import type { SelectionCopyTarget } from '@/components/cell-grid'
import { escapeCSVValue } from '@/lib/export'
import { SELECTION_COPY_CHOICES } from '@/lib/selection-serialize'
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
  /** Offers "Copy Selection As" when the right-clicked cell is inside a multi-cell selection. */
  selectionCopy?: SelectionCopyTarget
  /** Columns whose values copy as null, matching what the grid shows. */
  maskedColumns?: ReadonlySet<string>
}

function cellPositionOf(target: EventTarget): { row: number; col: number } | null {
  if (!(target instanceof Element)) return null
  const cell = target.closest<HTMLElement>('[data-cell-row][data-cell-col]')
  if (!cell) return null
  const row = Number(cell.dataset.cellRow)
  const col = Number(cell.dataset.cellCol)
  return Number.isNaN(row) || Number.isNaN(col) ? null : { row, col }
}

const NO_MASK: ReadonlySet<string> = new Set()

function copyValue(row: Record<string, unknown>, name: string, masked: ReadonlySet<string>) {
  return masked.has(name) ? null : row[name]
}

export function formatRowAsJson(
  row: Record<string, unknown>,
  columns: { name: string }[],
  masked: ReadonlySet<string> = NO_MASK
): string {
  const ordered: Record<string, unknown> = {}
  for (const col of columns) ordered[col.name] = copyValue(row, col.name, masked)
  return JSON.stringify(ordered, null, 2)
}

export function formatRowAsCsv(
  row: Record<string, unknown>,
  columns: { name: string }[],
  masked: ReadonlySet<string> = NO_MASK
): string {
  const header = columns.map((c) => escapeCSVValue(c.name)).join(',')
  const values = columns.map((c) => escapeCSVValue(copyValue(row, c.name, masked))).join(',')
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
  onDelete,
  selectionCopy,
  maskedColumns
}: RowContextMenuProps) {
  const [offerSelectionCopy, setOfferSelectionCopy] = React.useState(false)

  const handleContextMenu = (e: React.MouseEvent) => {
    const pos = cellPositionOf(e.target)
    setOfferSelectionCopy(Boolean(selectionCopy && pos && selectionCopy.covers(pos)))
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenu={handleContextMenu}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {selectionCopy && offerSelectionCopy && (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger>Copy Selection As</ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-44">
                {SELECTION_COPY_CHOICES.map((choice) => (
                  <ContextMenuItem
                    key={choice.label}
                    onClick={() =>
                      selectionCopy.copy(choice.format, { includeHeaders: choice.includeHeaders })
                    }
                  >
                    {choice.label}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem
          onClick={() => copy(formatRowAsJson(row, columns, maskedColumns), 'Row (JSON)')}
        >
          Copy Row as JSON
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => copy(formatRowAsCsv(row, columns, maskedColumns), 'Row (CSV)')}
        >
          Copy Row as CSV
        </ContextMenuItem>
        {(onDuplicate || onDelete) && <ContextMenuSeparator />}
        {onDuplicate && <ContextMenuItem onClick={onDuplicate}>Duplicate Row</ContextMenuItem>}
        {onDelete && (
          <ContextMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
            Delete Row
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
