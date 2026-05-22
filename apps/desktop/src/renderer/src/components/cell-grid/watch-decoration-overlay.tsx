import * as React from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import type { CellGridGeometry } from './cell-grid-types'
import type { WatchDiff } from '@/lib/watch-types'
import { deriveRowKey, type KeyingPlan } from '@/lib/watch-row-keying'

interface RowLike {
  original: Record<string, unknown>
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
  // Tick a re-render every 200ms so fades visibly progress. Only while a
  // diff is present.
  const [, force] = React.useState(0)
  React.useEffect(() => {
    if (!diff || diff.cells.size === 0) return
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
    const key = deriveRowKey(row, plan, rowIndex)
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
      const cellKey = `${key}:${colName}`
      const cell = diff.cells.get(cellKey)
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
