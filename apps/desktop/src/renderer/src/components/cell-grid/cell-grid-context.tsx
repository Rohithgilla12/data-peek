import * as React from 'react'

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

export interface CellGridApi {
  focus: CellPosition | null
  setFocus: (next: CellPosition | null) => void
  rowCount: number
  colCount: number
  geometry: CellGridGeometry
  containerRef: React.RefObject<HTMLElement | null>
  scrollToCell: (pos: CellPosition) => void
  getCellValue: (pos: CellPosition) => unknown
  getColumnName: (col: number) => string
  inspector: CellPosition | null
  openInspector: (pos: CellPosition) => void
  closeInspector: () => void
}

const CellGridContext = React.createContext<CellGridApi | null>(null)

export function useCellGrid(): CellGridApi {
  const ctx = React.useContext(CellGridContext)
  if (!ctx) throw new Error('useCellGrid must be used inside <CellGridProvider>')
  return ctx
}

export function useCellGridOptional(): CellGridApi | null {
  return React.useContext(CellGridContext)
}

export const CellGridContextProvider = CellGridContext.Provider

export function buildColumnOffsets(widths: number[]): number[] {
  const offsets: number[] = []
  let running = 0
  for (const w of widths) {
    offsets.push(running)
    running += w
  }
  return offsets
}
