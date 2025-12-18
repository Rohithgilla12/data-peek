import { useEffect, useCallback } from 'react'
import { History, CheckCircle, XCircle, Clock, Trash2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useScheduledQueryStore } from '@/stores'
import { cn } from '@/lib/utils'
import type { ScheduledQuery, ScheduledQueryRun } from '@shared/index'

interface ScheduledQueryRunsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  query: ScheduledQuery | null
}

/**
 * Format a numeric timestamp into a locale-aware date and time string.
 *
 * @param timestamp - Milliseconds since the Unix epoch
 * @returns A locale-formatted date-time string with short month, numeric day, and two-digit hour, minute, and second
 */
function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

/**
 * Formats a duration given in milliseconds into a compact, human-readable string.
 *
 * @param ms - Duration in milliseconds
 * @returns A formatted duration string:
 * - If less than 1,000 ms: "`<n>ms`"
 * - If less than 60,000 ms: "`<s.ss>s`" (seconds with two decimals)
 * - Otherwise: "`<m>m <s>s`" (minutes and whole seconds)
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  const mins = Math.floor(ms / 60000)
  const secs = ((ms % 60000) / 1000).toFixed(0)
  return `${mins}m ${secs}s`
}

/**
 * Render a single scheduled query run entry showing status, timing, and optional details.
 *
 * Renders a compact row that visually indicates success or failure, displays start and completion timestamps,
 * an optional duration badge, optional row count (when successful), an inline error block when present,
 * and an optional JSON result preview.
 *
 * @param run - The scheduled query run to display
 * @returns A React element representing the run item
 */
function RunItem({ run }: { run: ScheduledQueryRun }) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        run.success ? 'border-green-500/20' : 'border-red-500/20'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'shrink-0 size-6 rounded-full flex items-center justify-center',
            run.success ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
          )}
        >
          {run.success ? <CheckCircle className="size-4" /> : <XCircle className="size-4" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium">{run.success ? 'Success' : 'Failed'}</span>
            {run.durationMs !== undefined && (
              <Badge variant="secondary" className="text-[10px]">
                {formatDuration(run.durationMs)}
              </Badge>
            )}
            {run.rowCount !== undefined && run.success && (
              <Badge variant="secondary" className="text-[10px]">
                {run.rowCount} {run.rowCount === 1 ? 'row' : 'rows'}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="size-3" />
            <span>Started: {formatDateTime(run.startedAt)}</span>
            {run.completedAt && (
              <span className="text-muted-foreground/70">
                | Completed: {formatDateTime(run.completedAt)}
              </span>
            )}
          </div>

          {run.error && (
            <div className="mt-2 text-xs text-red-500 bg-red-500/10 rounded px-2 py-1.5 font-mono">
              {run.error}
            </div>
          )}

          {run.resultPreview && run.resultPreview.length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-muted-foreground mb-1">Result preview:</div>
              <div className="text-xs bg-muted/50 rounded px-2 py-1.5 overflow-auto max-h-[100px]">
                <pre className="font-mono">{JSON.stringify(run.resultPreview, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Render a modal dialog that displays and manages the run history for a scheduled query.
 *
 * Loads run history when opened for a given query and provides UI to refresh runs or clear history.
 *
 * @param open - Whether the dialog is visible
 * @param onOpenChange - Callback invoked with the new open state when the dialog is closed or opened
 * @param query - The scheduled query whose runs are shown, or `null` to show an empty state
 * @returns The dialog element containing run statistics, a scrollable list of runs, and action controls
 */
export function ScheduledQueryRunsDialog({
  open,
  onOpenChange,
  query
}: ScheduledQueryRunsDialogProps) {
  const loadRuns = useScheduledQueryStore((s) => s.loadRuns)
  const clearRuns = useScheduledQueryStore((s) => s.clearRuns)
  const getRunsForQuery = useScheduledQueryStore((s) => s.getRunsForQuery)

  // Load runs when dialog opens
  useEffect(() => {
    if (open && query) {
      loadRuns(query.id, 50)
    }
  }, [open, query, loadRuns])

  const queryRuns = query ? getRunsForQuery(query.id) : []

  const handleClearRuns = useCallback(async () => {
    if (!query) return
    if (confirm('Are you sure you want to clear all run history for this scheduled query?')) {
      await clearRuns(query.id)
    }
  }, [query, clearRuns])

  const handleRefresh = useCallback(() => {
    if (query) {
      loadRuns(query.id, 50)
    }
  }, [query, loadRuns])

  const successCount = queryRuns.filter((r) => r.success).length
  const failureCount = queryRuns.filter((r) => !r.success).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4" />
            Run History
            {query && <span className="text-muted-foreground font-normal">- {query.name}</span>}
          </DialogTitle>
        </DialogHeader>

        {/* Stats */}
        {queryRuns.length > 0 && (
          <div className="px-4 py-2 border-b flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{queryRuns.length} runs</Badge>
            </div>
            <div className="flex items-center gap-1 text-green-600">
              <CheckCircle className="size-3" />
              {successCount} success
            </div>
            <div className="flex items-center gap-1 text-red-500">
              <XCircle className="size-3" />
              {failureCount} failed
            </div>
            <div className="ml-auto flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7" onClick={handleRefresh}>
                      <RefreshCw className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      onClick={handleClearRuns}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Clear history</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}

        {/* Runs List */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {queryRuns.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <History className="size-8 mx-auto opacity-50 mb-2" />
                <p>No runs yet</p>
                <p className="text-xs">Runs will appear here when the schedule executes</p>
              </div>
            ) : (
              queryRuns.map((run) => <RunItem key={run.id} run={run} />)
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-4 py-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
