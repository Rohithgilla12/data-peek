import type { ForeignKeyInfo } from '@data-peek/shared'

export interface CellPosition {
  row: number
  col: number
}

export interface CellGridGeometry {
  rowHeight: number
  columnWidths: number[]
  columnOffsets: number[]
  totalWidth: number
  headerHeight: number
}

export interface CellSnapshot {
  value: unknown
  columnName: string
  dataType: string
  foreignKey?: ForeignKeyInfo
}

/**
 * Each copy action sets a fresh envelope so the consumer's effect re-fires
 * even when the same cell is copied twice in a row.
 */
export interface CellCopyEvent {
  pos: CellPosition
}

export function buildGeometry(
  columnWidths: number[],
  rowHeight: number,
  headerHeight: number
): CellGridGeometry {
  const columnOffsets: number[] = []
  let running = 0
  for (const w of columnWidths) {
    columnOffsets.push(running)
    running += w
  }
  return { rowHeight, columnWidths, columnOffsets, totalWidth: running, headerHeight }
}
