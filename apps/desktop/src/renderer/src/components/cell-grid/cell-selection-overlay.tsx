import * as React from 'react'
import { type CellSelection, type CellGridGeometry, rangeBounds } from './cell-grid-types'

export interface CellSelectionOverlayProps {
  selection: CellSelection | null
  geometry: CellGridGeometry
  suppressed?: boolean
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
  if (!selection) return null

  const { rowHeight, columnWidths, columnOffsets, headerHeight } = geometry
  const ranges = [selection.primary, ...selection.additional]

  return (
    <>
      {ranges.map((range, index) => {
        const { r1, c1, r2, c2 } = rangeBounds(range)
        const x1 = columnOffsets[c1] ?? 0
        const c2Offset = columnOffsets[c2] ?? 0
        const c2Width = columnWidths[c2] ?? 0
        const w = c2Offset + c2Width - x1
        const y1 = headerHeight + r1 * rowHeight
        const h = (r2 - r1 + 1) * rowHeight

        if (w <= 0 || h <= 0) return null

        return (
          <div
            key={index === 0 ? 'primary' : `additional-${index}-${r1}-${c1}-${r2}-${c2}`}
            aria-hidden
            data-cell-selection-rect
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: w,
              height: h,
              transform: `translate3d(${x1}px, ${y1}px, 0)`,
              pointerEvents: 'none',
              zIndex: 19,
              boxSizing: 'border-box',
              borderRadius: 3,
              background: 'var(--cell-selection-fill)',
              opacity: suppressed ? 0 : 1
            }}
          />
        )
      })}
    </>
  )
})
