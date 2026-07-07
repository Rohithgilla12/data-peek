import * as React from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import type { CellGridGeometry } from './cell-grid-types'
import type { WatchDiff } from '@/lib/watch-types'
import { cellKey, deriveRowKey, type KeyingPlan } from '@/lib/watch-row-keying'

interface RowLike {
  original: Record<string, unknown>
  /**
   * Absolute index of this row within the unpaginated result set. The
   * differ keys row_position diffs by absolute index; the overlay must
   * key the same way or paginated views map highlights onto the wrong
   * rows. Falls back to the visible index when the host doesn't provide
   * one (small / unpaginated tables behave identically).
   */
  index?: number
}

interface WatchDecorationOverlayProps {
  diff: WatchDiff | null
  rows: ReadonlyArray<RowLike>
  columnNames: ReadonlyArray<string>
  geometry: CellGridGeometry
  virtualizer: Virtualizer<HTMLDivElement, Element>
  fadeMs: number
}

/**
 * Renders an animated diff layer on top of the cell grid:
 *
 *   - Whole-row green tint for rows new in this snapshot
 *   - Per-cell amber background for cells whose value changed
 *   - Fade-out based on `changedAt` age vs. fadeMs
 *
 * The overlay is `pointer-events: none` so it never intercepts clicks. It
 * lives inside the table's scroll container and uses `transform: translate3d`
 * for GPU compositing. Only visible rows are rendered (virtualized) — large
 * results stay fast.
 */
export function WatchDecorationOverlay({
  diff,
  rows,
  columnNames,
  geometry,
  virtualizer,
  fadeMs
}: WatchDecorationOverlayProps) {
  // Tick a re-render every 200ms so fades visibly progress. Any of changed
  // cells, added rows, or removed rows needs the ticker — a tick that only
  // added rows would otherwise leave the green band stuck on screen
  // indefinitely.
  const [, force] = React.useState(0)
  React.useEffect(() => {
    if (!diff) return
    if (diff.cells.size === 0 && diff.addedRowKeys.size === 0 && diff.removedRowKeys.size === 0) {
      return
    }
    const id = setInterval(() => force((n) => n + 1), 200)
    return () => clearInterval(id)
  }, [diff])

  const plan: KeyingPlan = React.useMemo(
    () => ({
      strategy: diff?.keyingStrategy ?? 'row_position',
      keyColumns: diff?.keyColumns ?? []
    }),
    [diff?.keyingStrategy, diff?.keyColumns]
  )

  if (!diff) return null

  const virtualRows = virtualizer.getVirtualItems()
  if (virtualRows.length === 0) return null

  const now = Date.now()
  const nodes: React.ReactNode[] = []

  for (const vr of virtualRows) {
    const rowIndex = vr.index
    const rowLike = rows[rowIndex]
    if (!rowLike) continue
    const row = rowLike.original
    // Use the absolute index when the host provides one (paginated /
    // server-side results) so row_position keys match what the differ
    // computed. Falls back to the page-local index for un-paginated tables.
    const absoluteIndex = rowLike.index ?? rowIndex
    const key = deriveRowKey(row, plan, absoluteIndex)
    const y = geometry.headerHeight + rowIndex * geometry.rowHeight

    // Row-level: added rows get a band the full width
    if (diff.addedRowKeys.has(key)) {
      const intensity = Math.max(0, 1 - (now - diff.computedAt) / fadeMs)
      if (intensity > 0.05) {
        nodes.push(
          <div
            key={`row-added:${rowIndex}`}
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: geometry.totalWidth,
              height: geometry.rowHeight,
              transform: `translate3d(0, ${y}px, 0)`,
              pointerEvents: 'none',
              zIndex: 16,
              background: 'var(--cell-diff-added, oklch(0.75 0.15 145 / 0.18))',
              opacity: intensity,
              borderLeft: `2px solid var(--cell-diff-added-stripe, oklch(0.65 0.18 145 / 0.7))`,
              transition: 'opacity 220ms ease-out'
            }}
          />
        )
      }
    }

    // Per-cell changed highlights
    for (let c = 0; c < columnNames.length; c++) {
      const colName = columnNames[c]
      const cell = diff.cells.get(cellKey(key, colName))
      if (!cell || cell.kind !== 'changed') continue
      const age = now - cell.changedAt
      const intensity = Math.max(0, 1 - age / fadeMs)
      if (intensity < 0.05) continue
      const x = geometry.columnOffsets[c] ?? 0
      const w = geometry.columnWidths[c] ?? 0
      if (w === 0) continue
      nodes.push(
        <div
          key={`cell-changed:${rowIndex}:${c}`}
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: w,
            height: geometry.rowHeight,
            transform: `translate3d(${x}px, ${y}px, 0)`,
            pointerEvents: 'none',
            zIndex: 17,
            background: 'var(--cell-diff-fill, oklch(0.75 0.15 90 / 0.22))',
            boxShadow: `inset 2px 0 0 var(--cell-diff-stripe, oklch(0.7 0.18 70 / 0.85))`,
            opacity: intensity,
            transition: 'opacity 200ms ease-out'
          }}
        />
      )
    }
  }

  return <>{nodes}</>
}
