import { useMemo } from 'react'
import { ArrowLeft, GitCompareArrows, Trash2 } from 'lucide-react'
import { Badge, Button } from '@data-peek/ui'
import { DataTable } from '@/components/data-table'
import { useTimeMachineStore } from '@/stores/time-machine-store'
import { recordsFromColumnar } from '@/lib/time-machine-payload'

interface TimeMachineViewProps {
  tabId: string
  pageSize: number
}

function formatFullTime(capturedAt: number): string {
  const date = new Date(capturedAt)
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString(
    [],
    { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
  )}`
}

/**
 * Read-only view of a past run, replacing the live grid while active. In
 * compare mode the newer run's rows render with pinned diff decorations
 * against the older run.
 */
export function TimeMachineView({ tabId, pageSize }: TimeMachineViewProps) {
  const state = useTimeMachineStore((s) => s.states[tabId])

  const snapshot = state?.snapshot ?? null
  const rows = useMemo(
    () => (snapshot ? recordsFromColumnar(snapshot.columns, snapshot.rows) : []),
    [snapshot]
  )

  if (!state || !snapshot) return null

  const compareRun = state.compareRunId
    ? (state.runs.find((r) => r.id === state.compareRunId) ?? null)
    : null
  const diff = state.diff

  const changedCells = diff
    ? [...diff.cells.values()].filter((c) => c.kind === 'changed').length
    : 0

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 mb-2 shrink-0 text-xs">
        {compareRun && diff ? (
          <>
            <GitCompareArrows className="size-3.5 text-primary shrink-0" />
            <span className="font-medium">
              {formatFullTime(compareRun.capturedAt)} → {formatFullTime(snapshot.capturedAt)}
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground tabular-nums">
              <Badge
                variant="secondary"
                className="h-4 px-1.5 text-[10px] bg-green-500/15 text-green-500"
              >
                +{diff.addedRowKeys.size} added
              </Badge>
              <Badge
                variant="secondary"
                className="h-4 px-1.5 text-[10px] bg-red-500/15 text-red-400"
              >
                −{diff.removedRowKeys.size} removed
              </Badge>
              <Badge
                variant="secondary"
                className="h-4 px-1.5 text-[10px] bg-amber-500/15 text-amber-500"
              >
                {changedCells} cells changed
              </Badge>
            </span>
            <span className="text-muted-foreground/60">
              keyed by{' '}
              {diff.keyingStrategy === 'primary_key' ? diff.keyColumns.join(', ') : 'position'}
            </span>
            {diff.removedRowKeys.size > 0 && (
              <span className="text-muted-foreground/60">· removed rows not shown</span>
            )}
          </>
        ) : (
          <>
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary/60 animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            <span className="font-medium">
              Viewing run from {formatFullTime(snapshot.capturedAt)}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {snapshot.rowCount} rows · {snapshot.durationMs}ms · read-only
            </span>
            {snapshot.truncated && (
              <span className="text-amber-500">
                first {snapshot.storedRowCount} of {snapshot.rowCount} rows stored
              </span>
            )}
          </>
        )}
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-red-400"
            onClick={() => void useTimeMachineStore.getState().deleteRun(tabId, snapshot.id)}
            title="Delete this run from history"
          >
            <Trash2 className="size-3" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-6 gap-1 px-2 text-xs"
            onClick={() => void useTimeMachineStore.getState().selectRun(tabId, null)}
          >
            <ArrowLeft className="size-3" />
            Back to live
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <DataTable
          key={`tm-${snapshot.id}-${state.compareRunId ?? 'solo'}`}
          tabId={tabId}
          columns={snapshot.columns.map((c) => ({ name: c.name, dataType: c.dataType }))}
          data={rows}
          pageSize={pageSize}
          diffOverlay={diff}
        />
      </div>
    </div>
  )
}
