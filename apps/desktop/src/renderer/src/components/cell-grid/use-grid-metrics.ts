import * as React from 'react'

export interface GridMetrics {
  columnWidths: number[]
  headerHeight: number
}

const EMPTY_METRICS: GridMetrics = { columnWidths: [], headerHeight: 0 }

function sameMetrics(a: GridMetrics, b: GridMetrics): boolean {
  return (
    a.headerHeight === b.headerHeight &&
    a.columnWidths.length === b.columnWidths.length &&
    a.columnWidths.every((w, i) => w === b.columnWidths[i])
  )
}

/**
 * Measures the rendered header row so the overlays line up with real cells on
 * both the virtualized and the plain table path. The header height is measured
 * rather than assumed because foreign-key columns add a second header line.
 */
export function useGridMetrics(
  headerRef: React.RefObject<HTMLTableRowElement | null>,
  /** Changes whenever the set of header cells changes, so new cells get observed. */
  layoutKey: string
): GridMetrics {
  const [metrics, setMetrics] = React.useState<GridMetrics>(EMPTY_METRICS)

  React.useEffect(() => {
    const header = headerRef.current
    if (!header) return

    const measure = () => {
      const next: GridMetrics = {
        columnWidths: Array.from(header.querySelectorAll('th'), (cell) => cell.offsetWidth),
        headerHeight: header.parentElement?.offsetHeight ?? header.offsetHeight
      }
      // Keeping the old object on a no-op tick stops ResizeObserver churn from
      // re-rendering the overlay layer.
      setMetrics((prev) => (sameMetrics(prev, next) ? prev : next))
    }

    const timeoutId = setTimeout(measure, 0)
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(header)
    header.querySelectorAll('th').forEach((cell) => resizeObserver.observe(cell))

    return () => {
      clearTimeout(timeoutId)
      resizeObserver.disconnect()
    }
  }, [headerRef, layoutKey])

  return metrics
}
