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

export function buildColumnOffsets(widths: number[]): number[] {
  const offsets: number[] = []
  let running = 0
  for (const w of widths) {
    offsets.push(running)
    running += w
  }
  return offsets
}

export function buildGeometry(
  columnWidths: number[],
  rowHeight: number,
  headerHeight: number
): CellGridGeometry {
  const columnOffsets = buildColumnOffsets(columnWidths)
  let totalWidth = 0
  for (const w of columnWidths) totalWidth += w
  return { rowHeight, columnWidths, columnOffsets, totalWidth, headerHeight }
}
