import * as React from 'react'
import type { CellGridGeometry, CellPosition } from './cell-grid-types'

interface FindMatchOverlayProps {
  matches: ReadonlyArray<CellPosition>
  current: CellPosition | null
  geometry: CellGridGeometry
  /** Inclusive range of rendered rows; matches outside it are not painted. */
  rowWindow: { start: number; end: number }
}

function isSame(a: CellPosition | null, b: CellPosition): boolean {
  return a !== null && a.row === b.row && a.col === b.col
}

export const FindMatchOverlay = React.memo(function FindMatchOverlay({
  matches,
  current,
  geometry,
  rowWindow
}: FindMatchOverlayProps) {
  const { rowHeight, columnWidths, columnOffsets, headerHeight } = geometry
  if (columnWidths.length === 0) return null

  return (
    <>
      {matches.map((match) => {
        if (match.row < rowWindow.start || match.row > rowWindow.end) return null
        const width = columnWidths[match.col] ?? 0
        if (width === 0) return null
        const isCurrent = isSame(current, match)
        return (
          <div
            key={`${match.row}:${match.col}`}
            aria-hidden
            data-cell-find-match={isCurrent ? 'current' : ''}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width,
              height: rowHeight,
              transform: `translate3d(${columnOffsets[match.col] ?? 0}px, ${
                headerHeight + match.row * rowHeight
              }px, 0)`,
              pointerEvents: 'none',
              zIndex: 17,
              boxSizing: 'border-box',
              borderRadius: 3,
              background: isCurrent ? 'var(--cell-match-current-fill)' : 'var(--cell-match-fill)',
              boxShadow: isCurrent ? 'inset 0 0 0 1px var(--cell-match-current-border)' : undefined
            }}
          />
        )
      })}
    </>
  )
})
