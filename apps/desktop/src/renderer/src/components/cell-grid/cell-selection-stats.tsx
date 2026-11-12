import * as React from 'react'
import { cn } from '@data-peek/ui'
import type { CellPosition, CellSelection, CellSnapshot } from './cell-grid-types'
import { computeSelectionStats, type SelectionStats } from './selection-stats'

export interface CellSelectionStatsProps {
  /** The current multi-cell selection. */
  selection?: CellSelection | null
  /** Getter for cell snapshots. */
  getCell?: (pos: CellPosition) => CellSnapshot
  /** Directly supplied precomputed stats (takes precedence over selection/getCell). */
  stats?: SelectionStats | null
  /** Debounce interval for stats computation in ms (defaults to 80ms). */
  debounceMs?: number
  className?: string
}

function formatStatNumber(n: number | undefined): string {
  if (n === null || n === undefined) return ''
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })
}

function formatNullPct(nullCount: number, cellCount: number): string {
  if (cellCount === 0) return '0%'
  const pct = (nullCount / cellCount) * 100
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`
}

export function CellSelectionStats({
  selection,
  getCell,
  stats: directStats,
  debounceMs = 80,
  className
}: CellSelectionStatsProps): React.JSX.Element | null {
  const [computedStats, setComputedStats] = React.useState<SelectionStats | null>(null)

  React.useEffect(() => {
    // If stats are directly supplied via props, do not compute
    if (directStats !== undefined) return

    if (!selection || !selection.primary || !getCell) {
      setComputedStats(null)
      return
    }

    // Quick single-cell check before setting debounce timer
    if (
      selection.additional.length === 0 &&
      selection.primary.anchor.row === selection.primary.active.row &&
      selection.primary.anchor.col === selection.primary.active.col
    ) {
      setComputedStats(null)
      return
    }

    const timer = setTimeout(() => {
      const stats = computeSelectionStats(selection, getCell)
      setComputedStats(stats)
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [selection, getCell, directStats, debounceMs])

  const stats = directStats ?? computedStats

  if (!stats || stats.cellCount <= 1) {
    return null
  }

  return (
    <div
      role="status"
      aria-label="Selection statistics"
      data-testid="cell-selection-stats"
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1 text-2xs text-muted-foreground border-t border-border bg-muted/40 select-none',
        className
      )}
    >
      <div>
        Selected:{' '}
        <span className="font-mono tabular-nums font-medium text-foreground">
          {stats.cellCount.toLocaleString()}
        </span>{' '}
        cells
      </div>

      {stats.numericCount > 0 && stats.sum !== undefined && (
        <>
          <span className="text-muted-foreground/60 select-none">·</span>
          <div>
            Sum:{' '}
            <span className="font-mono tabular-nums font-medium text-foreground">
              {formatStatNumber(stats.sum)}
            </span>
          </div>
        </>
      )}

      {stats.numericCount > 0 && stats.avg !== undefined && (
        <>
          <span className="text-muted-foreground/60 select-none">·</span>
          <div>
            Avg:{' '}
            <span className="font-mono tabular-nums font-medium text-foreground">
              {formatStatNumber(stats.avg)}
            </span>
          </div>
        </>
      )}

      {stats.numericCount > 0 && stats.min !== undefined && (
        <>
          <span className="text-muted-foreground/60 select-none">·</span>
          <div>
            Min:{' '}
            <span className="font-mono tabular-nums font-medium text-foreground">
              {formatStatNumber(stats.min)}
            </span>
          </div>
        </>
      )}

      {stats.numericCount > 0 && stats.max !== undefined && (
        <>
          <span className="text-muted-foreground/60 select-none">·</span>
          <div>
            Max:{' '}
            <span className="font-mono tabular-nums font-medium text-foreground">
              {formatStatNumber(stats.max)}
            </span>
          </div>
        </>
      )}

      <span className="text-muted-foreground/60 select-none">·</span>
      <div>
        Distinct:{' '}
        <span className="font-mono tabular-nums font-medium text-foreground">
          {stats.distinctCount.toLocaleString()}
        </span>
      </div>

      {stats.nullCount > 0 && (
        <>
          <span className="text-muted-foreground/60 select-none">·</span>
          <div>
            Null:{' '}
            <span className="font-mono tabular-nums font-medium text-foreground">
              {stats.nullCount.toLocaleString()}
            </span>{' '}
            <span className="font-mono tabular-nums text-muted-foreground">
              ({formatNullPct(stats.nullCount, stats.cellCount)})
            </span>
          </div>
        </>
      )}
    </div>
  )
}
