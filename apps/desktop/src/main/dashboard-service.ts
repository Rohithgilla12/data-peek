import { v4 as uuid } from 'uuid'
import { CronExpressionParser } from 'cron-parser'
import cron, { ScheduledTask } from 'node-cron'
import { BrowserWindow } from 'electron'
import type {
  Dashboard,
  Widget,
  WidgetRunResult,
  CreateDashboardInput,
  UpdateDashboardInput,
  CreateWidgetInput,
  UpdateWidgetInput,
  ConnectionConfig,
  SavedQuery,
  WidgetLayout,
  SchedulePreset
} from '@shared/index'
import { SCHEDULE_PRESETS } from '@shared/index'
import { DpStorage } from './storage'
import { getAdapter } from './db-adapter'
import { createLogger } from './lib/logger'

const log = createLogger('dashboard')

const activeRefreshJobs = new Map<string, ScheduledTask>()

let dashboardsStore: DpStorage<{ dashboards: Dashboard[] }>
let connectionsStore: DpStorage<{ connections: ConnectionConfig[] }>
let savedQueriesStore: DpStorage<{ savedQueries: SavedQuery[] }>

/**
 * Initialize the dashboard service and persistent dashboards storage.
 *
 * Sets the module-scoped connections and saved-queries stores and creates the dashboards storage
 * container (initialized with an empty dashboards list). Logs service initialization.
 *
 * @param connStore - Storage handle that provides connection configurations
 * @param queriesStore - Storage handle that provides saved queries
 */
export async function initDashboardService(
  connStore: DpStorage<{ connections: ConnectionConfig[] }>,
  queriesStore: DpStorage<{ savedQueries: SavedQuery[] }>
): Promise<void> {
  connectionsStore = connStore
  savedQueriesStore = queriesStore

  dashboardsStore = await DpStorage.create<{ dashboards: Dashboard[] }>({
    name: 'data-peek-dashboards',
    defaults: { dashboards: [] }
  })

  log.debug('Dashboard service initialized')
}

/**
 * Retrieve all dashboards managed by the service.
 *
 * @returns The array of dashboards; an empty array if none exist.
 */
export function listDashboards(): Dashboard[] {
  return dashboardsStore.get('dashboards', [])
}

/**
 * Retrieve a dashboard by its id.
 *
 * @param id - The dashboard's id
 * @returns The dashboard with the given id, or `undefined` if no match is found
 */
export function getDashboard(id: string): Dashboard | undefined {
  return dashboardsStore.get('dashboards', []).find((d) => d.id === id)
}

/**
 * Create and persist a new dashboard with initialized identifiers, timestamps, defaults, and widgets.
 *
 * The function assigns a new UUID to the dashboard and to any widgets missing an id, sets creation and update timestamps, applies sensible defaults (e.g., `tags`, `layoutCols`, `version`), and saves the dashboard to persistent storage.
 *
 * @param input - Partial dashboard data provided by the caller; may include widgets, tags, layoutCols, and other dashboard fields
 * @returns The newly created and persisted `Dashboard` object
 */
export function createDashboard(input: CreateDashboardInput): Dashboard {
  const now = Date.now()
  const dashboard: Dashboard = {
    ...input,
    id: uuid(),
    widgets: (input.widgets || []).map((w) => ({
      ...w,
      id: w.id || uuid(),
      createdAt: w.createdAt || now,
      updatedAt: w.updatedAt || now
    })),
    tags: input.tags || [],
    layoutCols: input.layoutCols || 12,
    createdAt: now,
    updatedAt: now,
    version: 1
  }

  const dashboards = dashboardsStore.get('dashboards', [])
  dashboards.push(dashboard)
  dashboardsStore.set('dashboards', dashboards)

  log.debug('Created dashboard:', dashboard.name)
  return dashboard
}

/**
 * Apply partial updates to a dashboard identified by its id and persist the change.
 *
 * @param id - The id of the dashboard to update
 * @param updates - Fields to merge into the existing dashboard
 * @returns The updated dashboard, or `null` if no dashboard with the given id exists
 */
export function updateDashboard(id: string, updates: UpdateDashboardInput): Dashboard | null {
  const dashboards = dashboardsStore.get('dashboards', [])
  const index = dashboards.findIndex((d) => d.id === id)

  if (index === -1) {
    return null
  }

  dashboards[index] = {
    ...dashboards[index],
    ...updates,
    updatedAt: Date.now(),
    version: dashboards[index].version + 1
  }

  dashboardsStore.set('dashboards', dashboards)
  log.debug('Updated dashboard:', dashboards[index].name)
  return dashboards[index]
}

/**
 * Remove a dashboard identified by its id from persistent storage.
 *
 * @param id - The id of the dashboard to remove
 * @returns `true` if a dashboard was removed, `false` if no matching dashboard was found
 */
export function deleteDashboard(id: string): boolean {
  const dashboards = dashboardsStore.get('dashboards', [])
  const filtered = dashboards.filter((d) => d.id !== id)

  if (filtered.length === dashboards.length) {
    return false
  }

  // Stop any active refresh job before removing the dashboard
  const job = activeRefreshJobs.get(id)
  if (job) {
    job.stop()
    activeRefreshJobs.delete(id)
    log.debug('Stopped refresh schedule for deleted dashboard:', id)
  }

  dashboardsStore.set('dashboards', filtered)
  log.debug('Deleted dashboard:', id)
  return true
}

/**
 * Create a duplicate of an existing dashboard.
 *
 * The duplicate receives a new `id`, the name appended with " (Copy)", all widgets are copied with new `id`s
 * and their `createdAt`/`updatedAt` set to the duplication time, `createdAt`/`updatedAt` on the dashboard are set
 * to now, `version` is reset to 1, and `syncId` is cleared.
 *
 * @param id - The id of the dashboard to duplicate
 * @returns The newly created `Dashboard` copy if the source exists, `null` otherwise
 */
export function duplicateDashboard(id: string): Dashboard | null {
  const dashboard = getDashboard(id)
  if (!dashboard) {
    return null
  }

  const now = Date.now()
  const newDashboard: Dashboard = {
    ...dashboard,
    id: uuid(),
    name: `${dashboard.name} (Copy)`,
    widgets: dashboard.widgets.map((w) => ({
      ...w,
      id: uuid(),
      createdAt: now,
      updatedAt: now
    })),
    createdAt: now,
    updatedAt: now,
    version: 1,
    syncId: undefined
  }

  const dashboards = dashboardsStore.get('dashboards', [])
  dashboards.push(newDashboard)
  dashboardsStore.set('dashboards', dashboards)

  log.debug('Duplicated dashboard:', dashboard.name, '->', newDashboard.name)
  return newDashboard
}

/**
 * Adds a new widget to the specified dashboard.
 *
 * The created widget is assigned a new `id`, `createdAt`, and `updatedAt` timestamps,
 * the dashboard's `updatedAt` is updated and its `version` is incremented, and changes are persisted.
 *
 * @param dashboardId - The id of the dashboard to add the widget to
 * @param input - Widget properties to create; `id` and timestamps will be generated
 * @returns The created `Widget`, or `null` if no dashboard with `dashboardId` exists
 */
export function addWidget(dashboardId: string, input: CreateWidgetInput): Widget | null {
  const dashboards = dashboardsStore.get('dashboards', [])
  const index = dashboards.findIndex((d) => d.id === dashboardId)

  if (index === -1) {
    return null
  }

  const now = Date.now()
  const widget: Widget = {
    ...input,
    id: uuid(),
    createdAt: now,
    updatedAt: now
  }

  dashboards[index].widgets.push(widget)
  dashboards[index].updatedAt = now
  dashboards[index].version += 1

  dashboardsStore.set('dashboards', dashboards)
  log.debug('Added widget to dashboard:', widget.name)
  return widget
}

/**
 * Update a widget within a dashboard and persist the modification.
 *
 * @param dashboardId - The ID of the dashboard containing the widget
 * @param widgetId - The ID of the widget to update
 * @param updates - Partial widget fields to apply
 * @returns The updated `Widget` if the dashboard and widget were found and updated, `null` otherwise
 */
export function updateWidget(
  dashboardId: string,
  widgetId: string,
  updates: UpdateWidgetInput
): Widget | null {
  const dashboards = dashboardsStore.get('dashboards', [])
  const dashboardIndex = dashboards.findIndex((d) => d.id === dashboardId)

  if (dashboardIndex === -1) {
    return null
  }

  const widgetIndex = dashboards[dashboardIndex].widgets.findIndex((w) => w.id === widgetId)

  if (widgetIndex === -1) {
    return null
  }

  const now = Date.now()
  dashboards[dashboardIndex].widgets[widgetIndex] = {
    ...dashboards[dashboardIndex].widgets[widgetIndex],
    ...updates,
    updatedAt: now
  }
  dashboards[dashboardIndex].updatedAt = now
  dashboards[dashboardIndex].version += 1

  dashboardsStore.set('dashboards', dashboards)
  log.debug('Updated widget:', dashboards[dashboardIndex].widgets[widgetIndex].name)
  return dashboards[dashboardIndex].widgets[widgetIndex]
}

/**
 * Remove a widget from a specific dashboard by id.
 *
 * @param dashboardId - The id of the dashboard containing the widget
 * @param widgetId - The id of the widget to remove
 * @returns `true` if the widget was removed, `false` otherwise
 */
export function deleteWidget(dashboardId: string, widgetId: string): boolean {
  const dashboards = dashboardsStore.get('dashboards', [])
  const dashboardIndex = dashboards.findIndex((d) => d.id === dashboardId)

  if (dashboardIndex === -1) {
    return false
  }

  const widgetCount = dashboards[dashboardIndex].widgets.length
  dashboards[dashboardIndex].widgets = dashboards[dashboardIndex].widgets.filter(
    (w) => w.id !== widgetId
  )

  if (dashboards[dashboardIndex].widgets.length === widgetCount) {
    return false
  }

  dashboards[dashboardIndex].updatedAt = Date.now()
  dashboards[dashboardIndex].version += 1

  dashboardsStore.set('dashboards', dashboards)
  log.debug('Deleted widget:', widgetId)
  return true
}

/**
 * Apply multiple widget layout updates to a dashboard.
 *
 * Updates each widget whose id appears in `layouts` with the provided layout,
 * sets the widget `updatedAt`, updates the dashboard `updatedAt` and increments
 * its `version`, then persists the dashboards store.
 *
 * @param dashboardId - The id of the dashboard to update
 * @param layouts - A map from widget id to the new `WidgetLayout` to apply
 * @returns The updated `Dashboard` with layouts applied, or `null` if no dashboard with the given id exists
 */
export function updateWidgetLayouts(
  dashboardId: string,
  layouts: Record<string, WidgetLayout>
): Dashboard | null {
  const dashboards = dashboardsStore.get('dashboards', [])
  const index = dashboards.findIndex((d) => d.id === dashboardId)

  if (index === -1) {
    return null
  }

  const now = Date.now()
  for (const widget of dashboards[index].widgets) {
    if (layouts[widget.id]) {
      widget.layout = layouts[widget.id]
      widget.updatedAt = now
    }
  }

  dashboards[index].updatedAt = now
  dashboards[index].version += 1

  dashboardsStore.set('dashboards', dashboards)
  log.debug('Updated widget layouts for dashboard:', dashboards[index].name)
  return dashboards[index]
}

/**
 * Resolve and return the SQL text and connection ID for a widget.
 *
 * @returns `{ sql: string; connectionId: string }` if the widget's data source yields SQL and a connection ID, `null` otherwise.
 */
function getWidgetSql(widget: Widget): { sql: string; connectionId: string } | null {
  if (widget.dataSource.type === 'inline') {
    if (!widget.dataSource.sql) {
      return null
    }
    return {
      sql: widget.dataSource.sql,
      connectionId: widget.dataSource.connectionId
    }
  }

  if (widget.dataSource.type === 'saved-query') {
    if (!widget.dataSource.savedQueryId) {
      return null
    }

    const savedQueries = savedQueriesStore.get('savedQueries', [])
    const savedQuery = savedQueries.find((q) => q.id === widget.dataSource.savedQueryId)

    if (!savedQuery) {
      return null
    }

    return {
      sql: savedQuery.query,
      connectionId: widget.dataSource.connectionId
    }
  }

  return null
}

/**
 * Execute the SQL defined by a widget and produce a structured run result.
 *
 * Resolves the widget's SQL (inline or from a saved query), executes it against the widget's configured connection, and returns execution metadata and results.
 *
 * @param widget - The widget whose query will be resolved and executed
 * @returns A `WidgetRunResult` containing execution timing, success flag, returned rows/fields/rowCount when successful, or an `error` message when execution failed or configuration is missing
 */
export async function executeWidget(widget: Widget): Promise<WidgetRunResult> {
  const startTime = Date.now()
  const result: WidgetRunResult = {
    widgetId: widget.id,
    success: false,
    durationMs: 0,
    rowCount: 0,
    executedAt: startTime
  }

  try {
    const sqlInfo = getWidgetSql(widget)
    if (!sqlInfo) {
      result.error = 'No SQL query configured for widget'
      result.durationMs = Date.now() - startTime
      return result
    }

    const connections = connectionsStore.get('connections', [])
    const connection = connections.find((c) => c.id === sqlInfo.connectionId)

    if (!connection) {
      result.error = `Connection not found: ${sqlInfo.connectionId}`
      result.durationMs = Date.now() - startTime
      return result
    }

    const adapter = getAdapter(connection)
    const queryResult = await adapter.queryMultiple(connection, sqlInfo.sql, {
      executionId: `widget-${widget.id}-${startTime}`
    })

    const dataResult = queryResult.results.find((r) => r.isDataReturning) || queryResult.results[0]

    result.success = true
    result.data = dataResult?.rows || []
    result.fields = dataResult?.fields
    result.rowCount = dataResult?.rowCount || 0
    result.durationMs = Date.now() - startTime

    log.debug(`Widget "${widget.name}" executed in ${result.durationMs}ms`)
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    result.durationMs = Date.now() - startTime
    log.error(`Widget "${widget.name}" failed:`, result.error)
  }

  return result
}

/**
 * Executes every widget in the specified dashboard.
 *
 * @param dashboardId - The dashboard identifier whose widgets will be executed
 * @returns An array of `WidgetRunResult` objects corresponding to each widget's execution; returns an empty array if the dashboard is not found
 */
export async function executeAllWidgets(dashboardId: string): Promise<WidgetRunResult[]> {
  const dashboard = getDashboard(dashboardId)
  if (!dashboard) {
    return []
  }

  const results = await Promise.all(dashboard.widgets.map((widget) => executeWidget(widget)))

  return results
}

/**
 * Finds dashboards that include the specified tag.
 *
 * @param tag - The tag to match against dashboard tags
 * @returns An array of dashboards that include `tag`
 */
export function getDashboardsByTag(tag: string): Dashboard[] {
  return dashboardsStore.get('dashboards', []).filter((d) => d.tags.includes(tag))
}

/**
 * Collects all unique tags used by dashboards and returns them in alphabetical order.
 *
 * @returns An alphabetically sorted array of unique dashboard tags
 */
export function getAllDashboardTags(): string[] {
  const dashboards = dashboardsStore.get('dashboards', [])
  const tags = new Set<string>()

  for (const dashboard of dashboards) {
    for (const tag of dashboard.tags) {
      tags.add(tag)
    }
  }

  return Array.from(tags).sort()
}

/**
 * Resolve the cron expression to use for a dashboard refresh schedule.
 *
 * @param schedule - The dashboard refresh schedule (may specify a preset or a custom cron expression)
 * @returns The cron expression defined by the schedule or `'0 * * * *'` when the schedule has no expression or references an unknown preset
 */
function getCronExpression(schedule: NonNullable<Dashboard['refreshSchedule']>): string {
  if (schedule.preset === 'custom') {
    return schedule.cronExpression || '0 * * * *'
  }

  const preset = SCHEDULE_PRESETS[schedule.preset as Exclude<SchedulePreset, 'custom'>]
  return preset?.cron || '0 * * * *'
}

/**
 * Computes the next scheduled refresh timestamp for a dashboard refresh schedule.
 *
 * Uses the schedule's cron expression and the schedule timezone (or the system timezone if none) to determine the next occurrence.
 *
 * @returns The next refresh time as a Unix millisecond timestamp, or `null` if the schedule is disabled or the cron expression cannot be parsed.
 */
export function getNextRefreshTime(
  schedule: NonNullable<Dashboard['refreshSchedule']>
): number | null {
  if (!schedule.enabled) return null

  const cronExpression = getCronExpression(schedule)

  try {
    const interval = CronExpressionParser.parse(cronExpression, {
      tz: schedule.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
    })
    return interval.next().getTime()
  } catch (error) {
    log.error('Failed to parse cron expression:', cronExpression, error)
    return null
  }
}

/**
 * Schedule automatic widget refreshes for the specified dashboard based on its refreshSchedule.
 *
 * Stops any existing refresh job for the dashboard, validates the computed cron expression,
 * and schedules a new cron job that executes all widgets at each trigger. When a refresh
 * completes the service sends an IPC message 'dashboard:refresh-complete' to the focused
 * BrowserWindow with the dashboardId and the execution results.
 *
 * @param dashboardId - The dashboard's unique identifier
 */
export function scheduleDashboardRefresh(dashboardId: string): void {
  const existingJob = activeRefreshJobs.get(dashboardId)
  if (existingJob) {
    existingJob.stop()
    activeRefreshJobs.delete(dashboardId)
  }

  const dashboard = getDashboard(dashboardId)
  if (!dashboard?.refreshSchedule?.enabled) {
    return
  }

  const cronExpression = getCronExpression(dashboard.refreshSchedule)
  const timezone =
    dashboard.refreshSchedule.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone

  if (!cron.validate(cronExpression)) {
    log.error(`Invalid cron expression for dashboard "${dashboard.name}":`, cronExpression)
    return
  }

  log.debug(`Scheduling refresh for "${dashboard.name}" with cron: ${cronExpression} (${timezone})`)

  const job = cron.schedule(
    cronExpression,
    async () => {
      const currentDashboard = getDashboard(dashboardId)
      log.debug(`Auto-refreshing dashboard: ${currentDashboard?.name || dashboardId}`)

      try {
        const results = await executeAllWidgets(dashboardId)

        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send('dashboard:refresh-complete', {
            dashboardId,
            results
          })
        }
      } catch (error) {
        log.error(`Failed to refresh dashboard ${dashboardId}:`, error)
      }
    },
    {
      timezone,
      scheduled: true
    }
  )

  activeRefreshJobs.set(dashboardId, job)
}

/**
 * Stop auto-refresh for a dashboard
 */
export function stopDashboardRefresh(dashboardId: string): void {
  const job = activeRefreshJobs.get(dashboardId)
  if (job) {
    job.stop()
    activeRefreshJobs.delete(dashboardId)
    log.debug('Stopped refresh schedule for dashboard:', dashboardId)
  }
}

/**
 * Set a dashboard's refresh schedule and start or stop its scheduled refresh job accordingly.
 *
 * @param dashboardId - The id of the dashboard to update
 * @param schedule - The new refresh schedule to assign (may be `undefined` to clear)
 * @returns The updated dashboard, or `null` if no dashboard with the given id exists
 */
export function updateDashboardRefreshSchedule(
  dashboardId: string,
  schedule: Dashboard['refreshSchedule']
): Dashboard | null {
  const updated = updateDashboard(dashboardId, { refreshSchedule: schedule })
  if (!updated) {
    return null
  }

  if (schedule?.enabled) {
    scheduleDashboardRefresh(dashboardId)
  } else {
    stopDashboardRefresh(dashboardId)
  }

  return updated
}

/**
 * Start refresh schedules for all dashboards that have an enabled refreshSchedule.
 *
 * Iterates stored dashboards and schedules a refresh job for each dashboard whose
 * refreshSchedule.enabled is true.
 */
export function startAllRefreshSchedules(): void {
  const dashboards = dashboardsStore.get('dashboards', [])

  for (const dashboard of dashboards) {
    if (dashboard.refreshSchedule?.enabled) {
      scheduleDashboardRefresh(dashboard.id)
    }
  }

  log.debug(
    'Started refresh schedules for',
    dashboards.filter((d) => d.refreshSchedule?.enabled).length,
    'dashboards'
  )
}

/**
 * Stops and removes all active dashboard refresh cron jobs.
 *
 * Called on application shutdown to halt scheduled auto-refreshes and clear internal tracking.
 */
export function stopAllRefreshSchedules(): void {
  for (const [id, job] of activeRefreshJobs) {
    job.stop()
    log.debug('Stopped refresh schedule:', id)
  }
  activeRefreshJobs.clear()
}

/**
 * Checks whether a cron expression is syntactically valid.
 *
 * @param expression - The cron expression to validate
 * @returns `{ valid: true }` if the expression parses successfully, otherwise `{ valid: false, error: string }` with the parser error message
 */
export function validateCronExpression(expression: string): { valid: boolean; error?: string } {
  try {
    CronExpressionParser.parse(expression)
    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid cron expression'
    }
  }
}

/**
 * Compute the next scheduled run timestamps for a cron expression.
 *
 * @param expression - The cron expression to evaluate
 * @param count - Number of upcoming occurrences to return (default: 5)
 * @param timezone - Optional IANA time zone identifier to evaluate the expression in; uses the system timezone if omitted
 * @returns An array of Unix timestamps (milliseconds) for the next `count` occurrences; returns an empty array if the expression cannot be parsed
 */
export function getNextRefreshTimes(
  expression: string,
  count: number = 5,
  timezone?: string
): number[] {
  try {
    const interval = CronExpressionParser.parse(expression, {
      tz: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
    })

    const times: number[] = []
    for (let i = 0; i < count; i++) {
      times.push(interval.next().getTime())
    }

    return times
  } catch {
    return []
  }
}
