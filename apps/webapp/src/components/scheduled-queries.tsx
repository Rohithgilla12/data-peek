import { useState, useEffect } from 'react'
import {
  Clock,
  ChevronRight,
  MoreHorizontal,
  Play,
  Pause,
  Trash2,
  Pencil,
  History,
  CheckCircle,
  AlertCircle,
  Plus
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useScheduledQueryStore, useConnectionStore } from '@/stores'
import { ScheduledQueriesDialog } from './scheduled-queries-dialog'
import { ScheduledQueryFormDialog } from './scheduled-query-form-dialog'
import { ScheduledQueryRunsDialog } from './scheduled-query-runs-dialog'
import type { ScheduledQuery } from '@shared/index'
import { SCHEDULE_PRESETS } from '@shared/index'

/**
 * Format a future timestamp into a concise, human-readable hint.
 *
 * @param timestamp - Future time as milliseconds since the UNIX epoch
 * @returns `'now'` if less than 1 minute from now, `'<Xm>'` for minutes when less than 60 minutes, `'<Xh>'` for hours when less than 24 hours, otherwise a locale-formatted date string
 */
function formatFutureTime(timestamp: number): string {
  const now = Date.now()
  const diffMs = timestamp - now

  if (diffMs < 0) return 'overdue'

  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  return new Date(timestamp).toLocaleDateString()
}

/**
 * Produce a human-friendly label for a scheduled query schedule.
 *
 * @param schedule - The schedule object containing at least a `preset` and optionally `cronExpression`
 * @returns For `preset === 'custom'`, the cron expression if present or `"Custom"`; otherwise a human-friendly label for the preset if available, or the preset key
 */
function getScheduleLabel(schedule: ScheduledQuery['schedule']): string {
  if (schedule.preset === 'custom') {
    return schedule.cronExpression || 'Custom'
  }
  return (
    SCHEDULE_PRESETS[schedule.preset as keyof typeof SCHEDULE_PRESETS]?.label || schedule.preset
  )
}

/**
 * Get the icon representing a scheduled query's status.
 *
 * @param status - The scheduled query status (e.g., "active", "paused", "error")
 * @returns A React element for the matching status icon, or `null` if no icon is defined
 */
function getStatusIcon(status: ScheduledQuery['status']) {
  switch (status) {
    case 'active':
      return <CheckCircle className="size-3 text-green-500" />
    case 'paused':
      return <Pause className="size-3 text-yellow-500" />
    case 'error':
      return <AlertCircle className="size-3 text-red-500" />
    default:
      return null
  }
}

/**
 * Render a collapsible sidebar section that lists and manages scheduled queries.
 *
 * Renders a summary badge, up to five scheduled queries with status, schedule label,
 * next-run hint, and per-item actions (run now, pause/resume, view runs, edit, delete).
 * Provides controls to open dialogs for viewing all schedules, creating a new schedule,
 * editing a schedule, and viewing runs. Initializes the scheduled-query store on mount.
 *
 * @returns A React element containing the scheduled queries sidebar UI
 */
export function ScheduledQueries() {
  const { isMobile } = useSidebar()
  const scheduledQueries = useScheduledQueryStore((s) => s.scheduledQueries)
  const isInitialized = useScheduledQueryStore((s) => s.isInitialized)
  const initialize = useScheduledQueryStore((s) => s.initialize)
  const deleteScheduledQuery = useScheduledQueryStore((s) => s.deleteScheduledQuery)
  const pauseScheduledQuery = useScheduledQueryStore((s) => s.pauseScheduledQuery)
  const resumeScheduledQuery = useScheduledQueryStore((s) => s.resumeScheduledQuery)
  const runNow = useScheduledQueryStore((s) => s.runNow)

  const connections = useConnectionStore((s) => s.connections)

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingQuery, setEditingQuery] = useState<ScheduledQuery | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isRunsDialogOpen, setIsRunsDialogOpen] = useState(false)
  const [selectedQueryForRuns, setSelectedQueryForRuns] = useState<ScheduledQuery | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [runningNow, setRunningNow] = useState<string | null>(null)
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false)

  // Initialize on mount
  useEffect(() => {
    if (!isInitialized) {
      initialize()
    }
  }, [isInitialized, initialize])

  // Sort active queries first, then by next run time
  const sortedQueries = [...scheduledQueries].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1
    if (a.status !== 'active' && b.status === 'active') return 1
    if (a.nextRunAt && b.nextRunAt) return a.nextRunAt - b.nextRunAt
    return a.name.localeCompare(b.name)
  })

  const getConnectionName = (connectionId: string) => {
    const conn = connections.find((c) => c.id === connectionId)
    return conn?.name || 'Unknown'
  }

  const handleRunNow = async (query: ScheduledQuery) => {
    setRunningNow(query.id)
    try {
      await runNow(query.id)
    } finally {
      setRunningNow(null)
    }
  }

  const handleTogglePause = async (query: ScheduledQuery) => {
    if (query.status === 'paused' || query.status === 'error') {
      await resumeScheduledQuery(query.id)
    } else {
      await pauseScheduledQuery(query.id)
    }
  }

  const handleEditQuery = (query: ScheduledQuery) => {
    setEditingQuery(query)
    setIsEditDialogOpen(true)
  }

  const handleViewRuns = (query: ScheduledQuery) => {
    setSelectedQueryForRuns(query)
    setIsRunsDialogOpen(true)
  }

  const handleDeleteQuery = async (id: string) => {
    if (confirm('Are you sure you want to delete this scheduled query?')) {
      await deleteScheduledQuery(id)
    }
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="flex items-center">
          <CollapsibleTrigger className="flex items-center gap-1 flex-1">
            <ChevronRight
              className={`size-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
            <span>Scheduled Queries</span>
            {sortedQueries.length > 0 && (
              <Badge variant="outline" className="ml-1 text-[11px] px-1.5 py-0">
                {sortedQueries.length}
              </Badge>
            )}
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {sortedQueries.length === 0 ? (
                <div className="px-2 py-4 text-center">
                  <p className="text-xs text-muted-foreground mb-2">No scheduled queries yet</p>
                  <SidebarMenuButton
                    onClick={() => setIsFormDialogOpen(true)}
                    className="mx-auto w-auto"
                  >
                    <Plus className="size-4" />
                    <span>New Schedule</span>
                  </SidebarMenuButton>
                </div>
              ) : (
                sortedQueries.slice(0, 5).map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            onClick={() => setIsDialogOpen(true)}
                            className="h-auto py-1.5"
                          >
                            <div className="flex flex-col items-start gap-0.5 w-full min-w-0">
                              <div className="flex items-center gap-1.5 w-full">
                                {getStatusIcon(item.status)}
                                <span className="text-xs truncate font-medium">{item.name}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <Clock className="size-3" />
                                <span>{getScheduleLabel(item.schedule)}</span>
                                {item.status === 'active' && item.nextRunAt && (
                                  <span className="text-green-600">
                                    ({formatFutureTime(item.nextRunAt)})
                                  </span>
                                )}
                              </div>
                            </div>
                          </SidebarMenuButton>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-sm">
                          <div className="space-y-1">
                            <p className="font-medium">{item.name}</p>
                            {item.description && (
                              <p className="text-xs text-muted-foreground">{item.description}</p>
                            )}
                            <p className="text-xs">
                              Connection: {getConnectionName(item.connectionId)}
                            </p>
                            <pre className="text-xs font-mono whitespace-pre-wrap">
                              {item.query}
                            </pre>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction showOnHover>
                          <MoreHorizontal />
                          <span className="sr-only">More</span>
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        className="w-48 rounded-lg"
                        side={isMobile ? 'bottom' : 'right'}
                        align={isMobile ? 'end' : 'start'}
                      >
                        <DropdownMenuItem
                          onClick={() => handleRunNow(item)}
                          disabled={runningNow === item.id}
                        >
                          <Play className="text-muted-foreground" />
                          <span>{runningNow === item.id ? 'Running...' : 'Run now'}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleTogglePause(item)}>
                          {item.status === 'active' ? (
                            <>
                              <Pause className="text-muted-foreground" />
                              <span>Pause</span>
                            </>
                          ) : (
                            <>
                              <Play className="text-muted-foreground" />
                              <span>Resume</span>
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleViewRuns(item)}>
                          <History className="text-muted-foreground" />
                          <span>View runs</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEditQuery(item)}>
                          <Pencil className="text-muted-foreground" />
                          <span>Edit</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-400"
                          onClick={() => handleDeleteQuery(item.id)}
                        >
                          <Trash2 className="text-red-400" />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                ))
              )}
              {sortedQueries.length > 5 && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="text-sidebar-foreground/70"
                    onClick={() => setIsDialogOpen(true)}
                  >
                    <Clock className="size-4" />
                    <span>View all ({sortedQueries.length})</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {sortedQueries.length > 0 && sortedQueries.length <= 5 && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="text-sidebar-foreground/70"
                    onClick={() => setIsDialogOpen(true)}
                  >
                    <MoreHorizontal className="size-4" />
                    <span>Manage schedules</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>

        <ScheduledQueriesDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />

        <ScheduledQueryFormDialog
          open={isEditDialogOpen}
          onOpenChange={(open) => {
            setIsEditDialogOpen(open)
            if (!open) setEditingQuery(null)
          }}
          editingQuery={editingQuery}
        />

        <ScheduledQueryFormDialog
          open={isFormDialogOpen}
          onOpenChange={setIsFormDialogOpen}
          editingQuery={null}
        />

        <ScheduledQueryRunsDialog
          open={isRunsDialogOpen}
          onOpenChange={setIsRunsDialogOpen}
          query={selectedQueryForRuns}
        />
      </SidebarGroup>
    </Collapsible>
  )
}
