import * as React from 'react'
import type { CellPosition, CellGridGeometry } from './cell-grid-types'

interface CellFocusOverlayProps {
  focus: CellPosition | null
  geometry: CellGridGeometry
  /** Hide the outline while the inspector is taking over the cell. */
  suppressed?: boolean
}

/**
 * Two GPU-composited layers: a full-width row tint and the per-cell ring.
 * Position is derived from geometry so no per-cell ref tracking is needed.
 */
export const CellFocusOverlay = React.memo(function CellFocusOverlay({
  focus,
  geometry,
  suppressed = false
}: CellFocusOverlayProps) {
  if (!focus) return null

  const { rowHeight, columnWidths, columnOffsets, headerHeight, totalWidth } = geometry
  const w = columnWidths[focus.col] ?? 0
  if (w === 0) return null

  const x = columnOffsets[focus.col] ?? 0
  const y = headerHeight + focus.row * rowHeight

  return (
    <>
      <div
        aria-hidden
        data-cell-row-stripe
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: totalWidth,
          height: rowHeight,
          transform: `translate3d(0, ${y}px, 0)`,
          transition: 'transform 160ms cubic-bezier(0.32, 0.72, 0, 1), opacity 120ms ease-out',
          pointerEvents: 'none',
          zIndex: 18,
          background: 'var(--cell-row-stripe)',
          opacity: suppressed ? 0 : 1
        }}
      />
      <div
        aria-hidden
        data-cell-focus-overlay
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: w,
          height: rowHeight,
          transform: `translate3d(${x}px, ${y}px, 0)`,
          transition:
            'transform 160ms cubic-bezier(0.32, 0.72, 0, 1), width 160ms cubic-bezier(0.32, 0.72, 0, 1), opacity 120ms ease-out',
          pointerEvents: 'none',
          zIndex: 20,
          boxSizing: 'border-box',
          borderRadius: 3,
          opacity: suppressed ? 0 : 1,
          background: 'var(--cell-focus-fill)',
          boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.04), 0 0 0 2px var(--cell-focus-ring)'
        }}
      />
    </>
  )
})
