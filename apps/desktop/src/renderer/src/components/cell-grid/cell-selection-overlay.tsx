import * as React from 'react'
import { type CellSelection, type CellGridGeometry, rangeBounds } from './cell-grid-types'

export interface CellSelectionOverlayProps {
  selection: CellSelection | null
  geometry: CellGridGeometry
  suppressed?: boolean
}

export interface SelectionRect {
  key: string
  x: number
  y: number
  width: number
  height: number
}

export function computeSelectionRects(
  selection: CellSelection | null,
  geometry: CellGridGeometry
): SelectionRect[] {
  if (!selection) return []

  const { rowHeight, columnWidths, columnOffsets, headerHeight } = geometry
  const ranges = [selection.primary, ...selection.additional]
  const rects: SelectionRect[] = []

  ranges.forEach((range, index) => {
    const { r1, c1, r2, c2 } = rangeBounds(range)
    const x1 = columnOffsets[c1] ?? 0
    const c2Offset = columnOffsets[c2] ?? 0
    const c2Width = columnWidths[c2] ?? 0
    const w = c2Offset + c2Width - x1
    const y1 = headerHeight + r1 * rowHeight
    const h = (r2 - r1 + 1) * rowHeight

    if (w <= 0 || h <= 0) return

    rects.push({
      key: index === 0 ? 'primary' : `additional-${index}-${r1}-${c1}-${r2}-${c2}`,
      x: x1,
      y: y1,
      width: w,
      height: h
    })
  })

  return rects
}

/**
 * Renders an absolute rect <div> per range in selection (primary + additional).
 * Coordinates are derived from geometry (columnOffsets, columnWidths, rowHeight).
 */
export const CellSelectionOverlay = React.memo(function CellSelectionOverlay({
  selection,
  geometry,
  suppressed = false
}: CellSelectionOverlayProps) {
  const rects = computeSelectionRects(selection, geometry)
  if (rects.length === 0) return null

  return (
    <>
      {rects.map((rect) => (
        <div
          key={rect.key}
          aria-hidden
          data-cell-selection-rect
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: rect.width,
            height: rect.height,
            transform: `translate3d(${rect.x}px, ${rect.y}px, 0)`,
            pointerEvents: 'none',
            zIndex: 19,
            boxSizing: 'border-box',
            borderRadius: 3,
            background: 'var(--cell-selection-fill)',
            opacity: suppressed ? 0 : 1
          }}
        />
      ))}
    </>
  )
})
