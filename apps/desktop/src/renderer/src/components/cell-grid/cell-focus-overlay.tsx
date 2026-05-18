import * as React from 'react'
import type { CellPosition, CellGridGeometry } from './cell-grid-context'

interface CellFocusOverlayProps {
  focus: CellPosition | null
  geometry: CellGridGeometry
  /** Total scrollable height for absolute positioning context */
  totalHeight: number
  /** Whether the inspector is open (suppresses the overlay outline) */
  suppressed?: boolean
}

/**
 * A single GPU-composited outline that snaps between cells.
 * Position derived from geometry — no per-cell ref tracking required.
 */
export const CellFocusOverlay = React.memo(function CellFocusOverlay({
  focus,
  geometry,
  totalHeight,
  suppressed = false
}: CellFocusOverlayProps) {
  if (!focus) return null

  const { rowHeight, columnWidths, columnOffsets, headerHeight } = geometry
  const x = columnOffsets[focus.col] ?? 0
  const y = headerHeight + focus.row * rowHeight
  const w = columnWidths[focus.col] ?? 0
  const h = rowHeight

  if (w === 0 || totalHeight === 0) return null

  const totalWidth = geometry.totalWidth || 0
  const stripeY = headerHeight + focus.row * rowHeight

  return (
    <>
      {/* Row stripe — subtle full-width band behind the cell ring */}
      <div
        aria-hidden
        data-cell-row-stripe
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: totalWidth || '100%',
          height: h,
          transform: `translate3d(0, ${stripeY}px, 0)`,
          transition: 'transform 160ms cubic-bezier(0.32, 0.72, 0, 1), opacity 120ms ease-out',
          pointerEvents: 'none',
          zIndex: 18,
          background: 'oklch(0.65 0.15 250 / 0.04)',
          opacity: suppressed ? 0 : 1
        }}
      />
      {/* Cell ring */}
      <div
        aria-hidden
        data-cell-focus-overlay
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: w,
          height: h,
          transform: `translate3d(${x}px, ${y}px, 0)`,
          transition:
            'transform 160ms cubic-bezier(0.32, 0.72, 0, 1), width 160ms cubic-bezier(0.32, 0.72, 0, 1), opacity 120ms ease-out',
          pointerEvents: 'none',
          zIndex: 20,
          boxSizing: 'border-box',
          borderRadius: 3,
          opacity: suppressed ? 0 : 1,
          background: 'oklch(0.65 0.15 250 / 0.1)',
          boxShadow:
            'inset 0 0 0 1px oklch(1 0 0 / 0.04), 0 0 0 2px var(--cell-focus-ring, oklch(0.65 0.15 250))'
        }}
      />
    </>
  )
})
