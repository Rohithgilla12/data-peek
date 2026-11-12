import type { ForeignKeyInfo } from '@data-peek/shared'

export interface CellPosition {
  row: number
  col: number
}

export interface CellRange {
  /** Inclusive anchor cell. */
  anchor: CellPosition
  /** Inclusive far corner. Equals anchor for single-cell selection. */
  active: CellPosition
}

export interface CellSelection {
  /** The primary range — extended by Shift+arrow / Shift+click. */
  primary: CellRange
  /** Additional disjoint ranges added by Cmd/Ctrl+click. */
  additional: CellRange[]
}

/** Inclusive bounds of a range, normalised so r1 ≤ r2 and c1 ≤ c2. */
export interface CellBounds {
  r1: number
  c1: number
  r2: number
  c2: number
}

export function rangeBounds(range: CellRange): CellBounds {
  const r1 = Math.min(range.anchor.row, range.active.row)
  const r2 = Math.max(range.anchor.row, range.active.row)
  const c1 = Math.min(range.anchor.col, range.active.col)
  const c2 = Math.max(range.anchor.col, range.active.col)
  return { r1, c1, r2, c2 }
}

export function containsCell(range: CellRange, pos: CellPosition): boolean {
  const { r1, c1, r2, c2 } = rangeBounds(range)
  return pos.row >= r1 && pos.row <= r2 && pos.col >= c1 && pos.col <= c2
}

export function selectionContains(selection: CellSelection, pos: CellPosition): boolean {
  if (containsCell(selection.primary, pos)) return true
  return selection.additional.some((r) => containsCell(r, pos))
}

/** Enumerates every cell in the selection — caller is responsible for de-duping if needed. */
export function* iterateSelection(selection: CellSelection): Iterable<CellPosition> {
  for (const range of [selection.primary, ...selection.additional]) {
    const { r1, c1, r2, c2 } = rangeBounds(range)
    for (let row = r1; row <= r2; row++) {
      for (let col = c1; col <= c2; col++) {
        yield { row, col }
      }
    }
  }
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
  kind?: 'cell' | 'range'
  count?: number
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
