import { useMemo } from 'react'
import { cn } from '@data-peek/ui'
import type { WatchMetricPoint } from '@/lib/watch-types'

interface WatchSparklineProps {
  /** Metric history, oldest-first (as stored). */
  points: ReadonlyArray<WatchMetricPoint>
  className?: string
}

const W = 256
const H = 36
const PAD = 3

/**
 * Row count over time as a single SVG polyline. Errored ticks render as dots
 * along the baseline instead of contributing a misleading rowCount of 0.
 */
export function WatchSparkline({ points, className }: WatchSparklineProps) {
  const { path, errorDots, min, max, last } = useMemo(() => {
    const ok = points.filter((p) => !p.errored)
    if (ok.length === 0) {
      return { path: '', errorDots: [] as number[], min: 0, max: 0, last: null as number | null }
    }
    const counts = ok.map((p) => p.rowCount)
    const lo = Math.min(...counts)
    const hi = Math.max(...counts)
    const span = points.length > 1 ? points.length - 1 : 1
    const x = (i: number) => PAD + (i / span) * (W - PAD * 2)
    // Flat series renders as a midline rather than hugging an edge.
    const y = (v: number) => (hi === lo ? H / 2 : H - PAD - ((v - lo) / (hi - lo)) * (H - PAD * 2))

    const segments: string[] = []
    points.forEach((p, i) => {
      if (p.errored) return
      segments.push(
        `${segments.length === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.rowCount).toFixed(1)}`
      )
    })
    const dots = points.flatMap((p, i) => (p.errored ? [x(i)] : []))
    return {
      path: segments.join(' '),
      errorDots: dots,
      min: lo,
      max: hi,
      last: ok[ok.length - 1].rowCount
    }
  }, [points])

  if (points.length < 2) {
    return (
      <div
        className={cn(
          'flex h-9 items-center justify-center rounded border border-dashed text-[10px] text-muted-foreground',
          className
        )}
      >
        trend appears after a couple of ticks
      </div>
    )
  }

  return (
    <div className={cn('space-y-0.5', className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-9 w-full rounded border bg-muted/30"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Row count trend, currently ${last ?? '—'}, min ${min}, max ${max}`}
      >
        {path && (
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            className="text-amber-500"
          />
        )}
        {errorDots.map((cx, i) => (
          <circle key={i} cx={cx} cy={H - PAD} r={2} className="fill-rose-500" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>
          min {min} · max {max}
        </span>
        <span className="text-foreground font-medium">{last ?? '—'} rows</span>
      </div>
    </div>
  )
}
