import { useEffect, useMemo, useRef } from 'react'
import { History, Loader2, X } from 'lucide-react'
import { cn, Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@data-peek/ui'
import type { TimeMachineRunMeta } from '@data-peek/shared'
import { useTimeMachineStore } from '@/stores/time-machine-store'
import { ensureTimeMachineTabListener } from '@/lib/time-machine-capture'
import { WatchSparkline } from '@/components/watch-sparkline'
import type { WatchMetricPoint } from '@/lib/watch-types'

const LOAD_DEBOUNCE_MS = 400

interface TimeMachineStripProps {
  tabId: string
  connectionId: string | undefined
  sql: string
}

function formatRunTime(capturedAt: number, now: number): string {
  const date = new Date(capturedAt)
  const sameDay = new Date(now).toDateString() === date.toDateString()
  const time = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  if (sameDay) return time
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

/**
 * Timeline of persisted runs for the tab's current query. Chips read oldest →
 * newest left-to-right, with Live pinned at the right edge. Click a chip to
 * view that run; alt-click (or click while viewing another run) to diff.
 */
export function TimeMachineStrip({ tabId, connectionId, sql }: TimeMachineStripProps) {
  const state = useTimeMachineStore((s) => s.states[tabId])
  const railRef = useRef<HTMLDivElement | null>(null)

  const open = !!state?.open
  const trimmedSql = sql.trim()

  useEffect(() => {
    if (!open || !connectionId || !trimmedSql) return
    // Tab-close cleanup must be armed even if this tab never captures a run.
    ensureTimeMachineTabListener()
    const timer = setTimeout(() => {
      void useTimeMachineStore.getState().loadRuns(tabId, connectionId, trimmedSql)
    }, LOAD_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [open, tabId, connectionId, trimmedSql])

  // Keep the rail scrolled to the newest run when the timeline grows.
  const runCount = state?.runs.length ?? 0
  useEffect(() => {
    const rail = railRef.current
    if (rail) rail.scrollLeft = rail.scrollWidth
  }, [runCount])

  const chronological = useMemo(() => (state ? [...state.runs].reverse() : []), [state?.runs])

  const sparklinePoints = useMemo<WatchMetricPoint[]>(
    () =>
      chronological.map((run, index) => ({
        tick: index,
        capturedAt: run.capturedAt,
        rowCount: run.rowCount,
        durationMs: run.durationMs,
        errored: false
      })),
    [chronological]
  )

  if (!state || !open) return null

  const now = Date.now()
  const viewingLive = state.selectedRunId === null

  const handleChipClick = (run: TimeMachineRunMeta, event: React.MouseEvent) => {
    const store = useTimeMachineStore.getState()
    if (!run.hasRows) return
    if ((event.altKey || event.shiftKey) && state.selectedRunId && run.id !== state.selectedRunId) {
      void store.selectCompare(tabId, run.id)
      return
    }
    if (run.id === state.selectedRunId && state.compareRunId === null) {
      void store.selectRun(tabId, null)
      return
    }
    void store.selectRun(tabId, run.id)
  }

  return (
    <div
      data-testid="time-machine-strip"
      className="flex items-center gap-2 border-b border-border/40 bg-muted/10 px-3 py-1.5 shrink-0"
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
        <History className="size-3.5" />
        <span className="font-medium">Time Machine</span>
        {state.isLoading && <Loader2 className="size-3 animate-spin" />}
      </div>

      {chronological.length > 1 && (
        <div className="w-28 shrink-0 hidden md:block">
          <WatchSparkline points={sparklinePoints} />
        </div>
      )}

      {state.error ? (
        <span className="text-xs text-red-400 truncate">{state.error}</span>
      ) : chronological.length === 0 ? (
        <span className="text-xs text-muted-foreground/60">
          No runs captured yet — successful SELECTs are snapshotted automatically
        </span>
      ) : (
        <div ref={railRef} className="flex items-center gap-1 overflow-x-auto min-w-0 flex-1">
          {chronological.map((run, index) => {
            const isSelected = run.id === state.selectedRunId
            const isCompare = run.id === state.compareRunId
            const previous = index > 0 ? chronological[index - 1] : null
            const unchanged = previous !== null && previous.contentHash === run.contentHash
            return (
              <TooltipProvider key={run.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => handleChipClick(run, e)}
                      disabled={!run.hasRows}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs whitespace-nowrap transition-colors font-mono tabular-nums',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : isCompare
                            ? 'bg-primary/20 text-foreground ring-1 ring-primary/50'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        unchanged && !isSelected && !isCompare && 'opacity-50',
                        !run.hasRows && 'opacity-40 cursor-not-allowed'
                      )}
                    >
                      {formatRunTime(run.capturedAt, now)}
                      <span className={isSelected ? 'opacity-80' : 'opacity-60'}>
                        {run.rowCount}
                        {run.truncated && '†'}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">
                      {run.rowCount} rows · {run.durationMs}ms
                      {run.truncated && ' · stored first rows only'}
                      {!run.hasRows && ' · too large to store — metadata only'}
                      {unchanged && ' · no change vs previous run'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Click to view · ⌥-click to compare with the selected run
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
          })}
          <button
            onClick={() => void useTimeMachineStore.getState().selectRun(tabId, null)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs whitespace-nowrap transition-colors sticky right-0',
              viewingLive
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground ring-1 ring-border'
            )}
          >
            <span className="size-1.5 rounded-full bg-green-500" />
            Live
          </button>
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 shrink-0 ml-auto"
        onClick={() => useTimeMachineStore.getState().closeStrip(tabId)}
        title="Close Time Machine"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}
