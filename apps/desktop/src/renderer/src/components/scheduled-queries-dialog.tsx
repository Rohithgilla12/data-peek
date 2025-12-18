import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Clock,
  Play,
  Pause,
  Trash2,
  Search,
  X,
  Pencil,
  Plus,
  AlertCircle,
  CheckCircle,
  Timer,
  History,
  RefreshCw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useScheduledQueryStore, useConnectionStore } from '@/stores'
import { cn } from '@/lib/utils'
import type { ScheduledQuery, ScheduledQueryStatus } from '@shared/index'
import { SCHEDULE_PRESETS } from '@shared/index'
import { ScheduledQueryFormDialog } from './scheduled-query-form-dialog'
import { ScheduledQueryRunsDialog } from './scheduled-query-runs-dialog'

interface ScheduledQueriesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Produce a human-readable representation of how long ago a timestamp occurred.
 *
 * @param timestamp - Time in milliseconds since the Unix epoch
 * @returns A string like `just now`, `Nm ago`, `Nh ago`, `Nd ago`, or a locale-formatted date for times >= 7 days
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diffMs = now - timestamp
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(timestamp).toLocaleDateString()
}

/**
 * Formats a future timestamp into a concise human-readable relative string.
 *
 * @param timestamp - Future time in milliseconds since the Unix epoch
 * @returns `now` if within one minute, `in Xm` for minutes, `in Xh` for hours, `in Xd` for days (less than 7 days), or a locale date string for later times
 */
function formatFutureTime(timestamp: number): string {
  const now = Date.now()
  const diffMs = timestamp - now
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `in ${diffMins}m`
  if (diffHours < 24) return `in ${diffHours}h`
  if (diffDays < 7) return `in ${diffDays}d`
  return new Date(timestamp).toLocaleDateString()
}

/**
 * Map a scheduled query status to Tailwind-style CSS classes for background, text, and border styling.
 *
 * @param status - The scheduled query status to map (e.g., `"active"`, `"paused"`, `"error"`).
 * @returns A string of CSS utility classes (background, text color, and border) appropriate for the provided status.
 */
function getStatusColor(status: ScheduledQueryStatus): string {
  switch (status) {
    case 'active':
      return 'bg-green-500/10 text-green-500 border-green-500/20'
    case 'paused':
      return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
    case 'error':
      return 'bg-red-500/10 text-red-500 border-red-500/20'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

/**
 * Return an icon component corresponding to a scheduled query status.
 *
 * @param status - The scheduled query status to map to an icon (`'active'`, `'paused'`, `'error'`, or other)
 * @returns A React element with the status icon, or `null` if no icon is defined for the status
 */
function getStatusIcon(status: ScheduledQueryStatus) {
  switch (status) {
    case 'active':
      return <CheckCircle className="size-3" />
    case 'paused':
      return <Pause className="size-3" />
    case 'error':
      return <AlertCircle className="size-3" />
    default:
      return null
  }
}

/**
 * Produce a human-readable label for a scheduled query's schedule.
 *
 * @param schedule - The schedule object from a scheduled query; if `preset` is `"custom"`, the `cronExpression` may be used.
 * @returns A display label for the schedule: the preset's configured label, the preset key if no label exists, or the cron expression (or "Custom") for custom schedules.
 */
function getScheduleLabel(schedule: ScheduledQuery['schedule']): string {
  if (schedule.preset === 'custom') {
    return schedule.cronExpression || 'Custom'
  }
  return (
    SCHEDULE_PRESETS[schedule.preset as keyof typeof SCHEDULE_PRESETS]?.label || schedule.preset
  )
}

type FilterStatus = 'all' | ScheduledQueryStatus

/**
 * Render a modal dialog for managing scheduled queries, including search, status filtering, listing, and per-query actions (run, pause/resume, view runs, edit, delete).
 *
 * Renders UI for creating and editing schedules and for viewing run history; initializes schedule data when opened and wires actions to the scheduled query store.
 *
 * @param open - Whether the dialog is currently open
 * @param onOpenChange - Callback invoked when the dialog open state changes
 * @returns The Scheduled Queries dialog component tree
 */
export function ScheduledQueriesDialog({ open, onOpenChange }: ScheduledQueriesDialogProps) {
  const scheduledQueries = useScheduledQueryStore((s) => s.scheduledQueries)
  const isInitialized = useScheduledQueryStore((s) => s.isInitialized)
  const initialize = useScheduledQueryStore((s) => s.initialize)
  const deleteScheduledQuery = useScheduledQueryStore((s) => s.deleteScheduledQuery)
  const pauseScheduledQuery = useScheduledQueryStore((s) => s.pauseScheduledQuery)
  const resumeScheduledQuery = useScheduledQueryStore((s) => s.resumeScheduledQuery)
  const runNow = useScheduledQueryStore((s) => s.runNow)

  const connections = useConnectionStore((s) => s.connections)

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingQuery, setEditingQuery] = useState<ScheduledQuery | null>(null)
  const [runsDialogOpen, setRunsDialogOpen] = useState(false)
  const [selectedQueryForRuns, setSelectedQueryForRuns] = useState<ScheduledQuery | null>(null)
  const [runningNow, setRunningNow] = useState<string | null>(null)

  // Initialize on open
  useEffect(() => {
    if (open && !isInitialized) {
      initialize()
    }
  }, [open, isInitialized, initialize])

  // Filter queries
  const filteredQueries = useMemo(() => {
    let result = scheduledQueries

    // Search filter
    if (searchQuery) {
      const lowerSearch = searchQuery.toLowerCase()
      result = result.filter(
        (q) =>
          q.name.toLowerCase().includes(lowerSearch) ||
          q.query.toLowerCase().includes(lowerSearch) ||
          q.description?.toLowerCase().includes(lowerSearch)
      )
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((q) => q.status === statusFilter)
    }

    // Sort by next run time (active first), then by name
    return [...result].sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1
      if (a.status !== 'active' && b.status === 'active') return 1
      return a.name.localeCompare(b.name)
    })
  }, [scheduledQueries, searchQuery, statusFilter])

  const getConnectionName = useCallback(
    (connectionId: string) => {
      const conn = connections.find((c) => c.id === connectionId)
      return conn?.name || 'Unknown connection'
    },
    [connections]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      if (confirm('Are you sure you want to delete this scheduled query?')) {
        await deleteScheduledQuery(id)
      }
    },
    [deleteScheduledQuery]
  )

  const handleTogglePause = useCallback(
    async (query: ScheduledQuery) => {
      if (query.status === 'paused' || query.status === 'error') {
        await resumeScheduledQuery(query.id)
      } else {
        await pauseScheduledQuery(query.id)
      }
    },
    [pauseScheduledQuery, resumeScheduledQuery]
  )

  const handleRunNow = useCallback(
    async (id: string) => {
      setRunningNow(id)
      try {
        await runNow(id)
      } finally {
        setRunningNow(null)
      }
    },
    [runNow]
  )

  const handleEdit = useCallback((query: ScheduledQuery) => {
    setEditingQuery(query)
    setFormOpen(true)
  }, [])

  const handleViewRuns = useCallback((query: ScheduledQuery) => {
    setSelectedQueryForRuns(query)
    setRunsDialogOpen(true)
  }, [])

  const handleFormClose = useCallback(() => {
    setFormOpen(false)
    setEditingQuery(null)
  }, [])

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Clock className="size-4" />
              Scheduled Queries
              <Badge variant="secondary" className="ml-2">
                {filteredQueries.length} {filteredQueries.length === 1 ? 'schedule' : 'schedules'}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setEditingQuery(null)
                  setFormOpen(true)
                }}
              >
                <Plus className="size-4 mr-1" />
                New Schedule
              </Button>
            </DialogTitle>
          </DialogHeader>

          {/* Search and Filters */}
          <div className="px-4 py-3 border-b space-y-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search scheduled queries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as FilterStatus)}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Query List */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {filteredQueries.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {scheduledQueries.length === 0 ? (
                    <div className="space-y-2">
                      <Clock className="size-8 mx-auto opacity-50" />
                      <p>No scheduled queries yet</p>
                      <p className="text-xs">Create a schedule to run queries automatically</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => setFormOpen(true)}
                      >
                        <Plus className="size-4 mr-1" />
                        Create Schedule
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Search className="size-8 mx-auto opacity-50" />
                      <p>No schedules match your filters</p>
                    </div>
                  )}
                </div>
              ) : (
                filteredQueries.map((query) => (
                  <div
                    key={query.id}
                    className="group rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="font-medium text-sm truncate">{query.name}</span>
                          <Badge
                            variant="outline"
                            className={cn('text-[10px] gap-1', getStatusColor(query.status))}
                          >
                            {getStatusIcon(query.status)}
                            {query.status}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {getConnectionName(query.connectionId)}
                          </Badge>
                        </div>

                        {query.description && (
                          <p className="text-xs text-muted-foreground mb-1.5 line-clamp-1">
                            {query.description}
                          </p>
                        )}

                        <pre className="text-xs font-mono text-foreground/90 whitespace-pre-wrap break-all bg-muted/50 rounded px-2 py-1.5 max-h-[60px] overflow-auto">
                          {query.query}
                        </pre>

                        <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Timer className="size-3" />
                            {getScheduleLabel(query.schedule)}
                          </span>
                          {query.status === 'active' && query.nextRunAt && (
                            <span className="flex items-center gap-1 text-green-600">
                              <RefreshCw className="size-3" />
                              Next: {formatFutureTime(query.nextRunAt)}
                            </span>
                          )}
                          {query.lastRunAt && (
                            <span className="flex items-center gap-1">
                              <History className="size-3" />
                              Last: {formatRelativeTime(query.lastRunAt)}
                            </span>
                          )}
                          {query.lastError && (
                            <span className="flex items-center gap-1 text-red-500">
                              <AlertCircle className="size-3" />
                              {query.lastError.slice(0, 50)}
                              {query.lastError.length > 50 && '...'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                onClick={() => handleRunNow(query.id)}
                                disabled={runningNow === query.id}
                              >
                                {runningNow === query.id ? (
                                  <RefreshCw className="size-3.5 animate-spin" />
                                ) : (
                                  <Play className="size-3.5" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Run now</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                onClick={() => handleTogglePause(query)}
                              >
                                {query.status === 'active' ? (
                                  <Pause className="size-3.5" />
                                ) : (
                                  <Play className="size-3.5" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {query.status === 'active' ? 'Pause' : 'Resume'}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                onClick={() => handleViewRuns(query)}
                              >
                                <History className="size-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>View run history</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                onClick={() => handleEdit(query)}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                onClick={() => handleDelete(query.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <ScheduledQueryFormDialog
        open={formOpen}
        onOpenChange={handleFormClose}
        editingQuery={editingQuery}
      />

      <ScheduledQueryRunsDialog
        open={runsDialogOpen}
        onOpenChange={setRunsDialogOpen}
        query={selectedQueryForRuns}
      />
    </>
  )
}
