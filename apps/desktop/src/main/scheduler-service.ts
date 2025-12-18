import { Notification } from 'electron'
import { CronExpressionParser } from 'cron-parser'
import cron, { ScheduledTask } from 'node-cron'
import { v4 as uuid } from 'uuid'
import type {
  ScheduledQuery,
  ScheduledQueryRun,
  CreateScheduledQueryInput,
  UpdateScheduledQueryInput,
  ConnectionConfig
} from '@shared/index'
import { SCHEDULE_PRESETS } from '@shared/index'
import { DpStorage } from './storage'
import { getAdapter } from './db-adapter'
import { createLogger } from './lib/logger'

const log = createLogger('scheduler')

// Maximum preview rows to store in run history
const MAX_PREVIEW_ROWS = 5

// Store instances
let scheduledQueriesStore: DpStorage<{ scheduledQueries: ScheduledQuery[] }>
let scheduledQueryRunsStore: DpStorage<{ runs: ScheduledQueryRun[] }>
let connectionsStore: DpStorage<{ connections: ConnectionConfig[] }>

// Active cron jobs for scheduled queries
const activeJobs = new Map<string, ScheduledTask>()

// Mutex for atomic run storage operations
let saveRunLock: Promise<void> = Promise.resolve()

/**
 * Initialize scheduler storage and start any active scheduled queries.
 *
 * @param connStore - Storage instance containing connection configurations used by scheduled queries
 */
export async function initSchedulerService(
  connStore: DpStorage<{ connections: ConnectionConfig[] }>
): Promise<void> {
  connectionsStore = connStore

  scheduledQueriesStore = await DpStorage.create<{ scheduledQueries: ScheduledQuery[] }>({
    name: 'data-peek-scheduled-queries',
    defaults: { scheduledQueries: [] }
  })

  scheduledQueryRunsStore = await DpStorage.create<{ runs: ScheduledQueryRun[] }>({
    name: 'data-peek-scheduled-query-runs',
    defaults: { runs: [] }
  })

  // Start all active schedules
  const queries = scheduledQueriesStore.get('scheduledQueries', [])
  for (const query of queries) {
    if (query.status === 'active') {
      scheduleCronJob(query)
    }
  }

  log.debug('Scheduler service initialized with', queries.length, 'scheduled queries')
}

/**
 * Derives a cron expression from a schedule configuration.
 *
 * @returns The cron expression defined by the schedule, or `'0 * * * *'` (hourly) if the schedule has no expression or the preset is not found.
 */
function getCronExpression(schedule: ScheduledQuery['schedule']): string {
  if (schedule.preset === 'custom') {
    return schedule.cronExpression || '0 * * * *' // Default to hourly if custom but no expression
  }

  const preset = SCHEDULE_PRESETS[schedule.preset as keyof typeof SCHEDULE_PRESETS]
  return preset?.cron || '0 * * * *'
}

/**
 * Compute the next scheduled run timestamp for a schedule.
 *
 * @param schedule - Schedule configuration (preset or custom cron and optional timezone)
 * @returns The next run time as a Unix timestamp in milliseconds. If the cron expression cannot be parsed, returns a timestamp one hour from now.
 */
function getNextRunTime(schedule: ScheduledQuery['schedule']): number {
  const cronExpression = getCronExpression(schedule)

  try {
    const interval = CronExpressionParser.parse(cronExpression, {
      tz: schedule.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
    })
    return interval.next().getTime()
  } catch (error) {
    log.error('Failed to parse cron expression:', cronExpression, error)
    // Default to 1 hour from now if parsing fails
    return Date.now() + 60 * 60 * 1000
  }
}

/**
 * Schedules a cron job for the given scheduled query.
 *
 * Updates the query's nextRunAt, stops and replaces any existing job for the query,
 * persists an 'error' status with `lastError` when the cron expression is invalid,
 * and registers the new cron task in `activeJobs`.
 *
 * @param query - The scheduled query to schedule
 */
function scheduleCronJob(query: ScheduledQuery): void {
  // Stop any existing job
  const existingJob = activeJobs.get(query.id)
  if (existingJob) {
    existingJob.stop()
    activeJobs.delete(query.id)
  }

  // Don't schedule if not active
  if (query.status !== 'active') {
    return
  }

  const cronExpression = getCronExpression(query.schedule)
  const timezone = query.schedule.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone

  // Validate cron expression with node-cron
  if (!cron.validate(cronExpression)) {
    log.error(`Invalid cron expression for "${query.name}":`, cronExpression)
    updateScheduledQueryInternal(query.id, {
      status: 'error',
      lastError: `Invalid cron expression: ${cronExpression}`
    })
    return
  }

  log.debug(`Scheduling "${query.name}" with cron: ${cronExpression} (${timezone})`)

  // Calculate and store next run time
  const nextRunAt = getNextRunTime(query.schedule)
  updateScheduledQueryInternal(query.id, { nextRunAt })

  // Create the cron job
  const job = cron.schedule(
    cronExpression,
    async () => {
      await executeScheduledQuery(query.id)
    },
    {
      timezone,
      scheduled: true
    }
  )

  activeJobs.set(query.id, job)
}

/**
 * Execute a scheduled query by its ID and record the run.
 *
 * Finds the scheduled query and, if it is active, executes it against the configured connection,
 * records a run entry (timing, success, row count and result preview or error), updates the
 * scheduled query's last run metadata and status, persists the run to history, updates the next
 * scheduled run time for UI display, and optionally shows desktop notifications on completion or error.
 *
 * @param queryId - The ID of the scheduled query to execute
 */
async function executeScheduledQuery(queryId: string): Promise<void> {
  const queries = scheduledQueriesStore.get('scheduledQueries', [])
  const query = queries.find((q) => q.id === queryId)

  if (!query) {
    log.error('Scheduled query not found:', queryId)
    return
  }

  if (query.status !== 'active') {
    log.debug('Skipping inactive scheduled query:', query.name)
    return
  }

  log.debug('Executing scheduled query:', query.name)

  const run: ScheduledQueryRun = {
    id: uuid(),
    scheduledQueryId: queryId,
    startedAt: Date.now(),
    success: false
  }

  try {
    // Get the connection
    const connections = connectionsStore.get('connections', [])
    const connection = connections.find((c) => c.id === query.connectionId)

    if (!connection) {
      throw new Error(`Connection not found: ${query.connectionId}`)
    }

    // Execute the query
    const adapter = getAdapter(connection)
    const result = await adapter.queryMultiple(connection, query.query, {
      executionId: `scheduled-${queryId}-${run.id}`
    })

    run.completedAt = Date.now()
    run.durationMs = run.completedAt - run.startedAt
    run.success = true

    // Get row count from the results
    const dataResult = result.results.find((r) => r.isDataReturning) || result.results[0]
    run.rowCount = dataResult?.rowCount ?? 0

    // Store a preview of the results (first few rows)
    if (dataResult?.rows && dataResult.rows.length > 0) {
      run.resultPreview = dataResult.rows.slice(0, MAX_PREVIEW_ROWS)
    }

    log.debug(`Scheduled query "${query.name}" completed in ${run.durationMs}ms`)

    // Update query with last run time
    updateScheduledQueryInternal(query.id, {
      lastRunAt: run.completedAt,
      lastError: undefined,
      status: 'active'
    })

    // Show notification if enabled
    if (query.notifyOnComplete) {
      showNotification(
        `Scheduled Query Completed`,
        `"${query.name}" finished successfully (${run.rowCount} rows in ${run.durationMs}ms)`
      )
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    run.completedAt = Date.now()
    run.durationMs = run.completedAt - run.startedAt
    run.success = false
    run.error = errorMessage

    log.error(`Scheduled query "${query.name}" failed:`, errorMessage)

    // Update query with error status
    updateScheduledQueryInternal(query.id, {
      lastRunAt: run.completedAt,
      lastError: errorMessage,
      status: 'error'
    })

    // Show notification if enabled
    if (query.notifyOnError) {
      showNotification(`Scheduled Query Failed`, `"${query.name}" failed: ${errorMessage}`)
    }
  }

  // Store the run
  await saveRun(run)

  // Update nextRunAt for UI display (cron job continues running automatically)
  const updatedQuery = scheduledQueriesStore
    .get('scheduledQueries', [])
    .find((q) => q.id === queryId)
  if (updatedQuery && updatedQuery.status === 'active') {
    const nextRunAt = getNextRunTime(updatedQuery.schedule)
    updateScheduledQueryInternal(updatedQuery.id, { nextRunAt })
  }
}

/**
 * Persist a scheduled query run and trim that query's run history to its configured maximum.
 *
 * Appends `run` to the global runs store, then keeps only the most recent `maxHistoryRuns`
 * entries for the associated scheduled query (default 100), preserving runs for other queries.
 *
 * @param run - The scheduled query run to persist
 */
async function saveRun(run: ScheduledQueryRun): Promise<void> {
  const currentLock = saveRunLock
  let releaseLock: () => void

  saveRunLock = new Promise((resolve) => {
    releaseLock = resolve
  })

  try {
    await currentLock

    const runs = scheduledQueryRunsStore.get('runs', [])

    const queries = scheduledQueriesStore.get('scheduledQueries', [])
    const query = queries.find((q) => q.id === run.scheduledQueryId)
    const maxRuns = query?.maxHistoryRuns || 100

    runs.push(run)

    const queryRuns = runs.filter((r) => r.scheduledQueryId === run.scheduledQueryId)
    const otherRuns = runs.filter((r) => r.scheduledQueryId !== run.scheduledQueryId)

    queryRuns.sort((a, b) => b.startedAt - a.startedAt)
    const trimmedQueryRuns = queryRuns.slice(0, maxRuns)

    scheduledQueryRunsStore.set('runs', [...otherRuns, ...trimmedQueryRuns])
  } finally {
    releaseLock!()
  }
}

/**
 * Display a native desktop notification with the given title and body when the platform supports notifications.
 *
 * @param title - Notification title shown to the user
 * @param body - Notification body text shown to the user
 */
function showNotification(title: string, body: string): void {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body,
      silent: false
    })
    notification.show()
  }
}

/**
 * Update a stored scheduled query's fields and persist the change without altering its schedule.
 *
 * @param id - The ID of the scheduled query to update
 * @param updates - Partial fields to merge into the existing scheduled query
 * @returns The updated `ScheduledQuery`, or `null` if no query with the given `id` exists
 */
function updateScheduledQueryInternal(
  id: string,
  updates: Partial<ScheduledQuery>
): ScheduledQuery | null {
  const queries = scheduledQueriesStore.get('scheduledQueries', [])
  const index = queries.findIndex((q) => q.id === id)

  if (index === -1) {
    return null
  }

  queries[index] = {
    ...queries[index],
    ...updates,
    updatedAt: Date.now()
  }

  scheduledQueriesStore.set('scheduledQueries', queries)
  return queries[index]
}

/**
 * Retrieve all scheduled queries.
 *
 * @returns An array of ScheduledQuery objects from storage.
 */
export function listScheduledQueries(): ScheduledQuery[] {
  return scheduledQueriesStore.get('scheduledQueries', [])
}

/**
 * Retrieve a scheduled query by its identifier.
 *
 * @returns The scheduled query with the matching `id`, or `undefined` if not found.
 */
export function getScheduledQuery(id: string): ScheduledQuery | undefined {
  return scheduledQueriesStore.get('scheduledQueries', []).find((q) => q.id === id)
}

/**
 * Create, persist, and schedule a new scheduled query.
 *
 * This generates an ID, sets initial status and timestamps, computes the next run time, stores the query in persistent storage, and schedules its first cron job.
 *
 * @param input - Properties for the new scheduled query (schedule, connection, query text, notification options, etc.)
 * @returns The persisted ScheduledQuery including generated `id`, `status`, `nextRunAt`, `createdAt`, and `updatedAt`
 */
export function createScheduledQuery(input: CreateScheduledQueryInput): ScheduledQuery {
  const now = Date.now()
  const query: ScheduledQuery = {
    ...input,
    id: uuid(),
    status: 'active',
    nextRunAt: getNextRunTime(input.schedule),
    createdAt: now,
    updatedAt: now
  }

  const queries = scheduledQueriesStore.get('scheduledQueries', [])
  queries.push(query)
  scheduledQueriesStore.set('scheduledQueries', queries)

  // Schedule the first run
  scheduleCronJob(query)

  log.debug('Created scheduled query:', query.name)
  return query
}

/**
 * Merge the provided updates into an existing scheduled query and persist the changes.
 *
 * If the schedule is updated, the next run time is recalculated. If the schedule or status
 * changes, the cron job is reconfigured. The query's `updatedAt` timestamp is refreshed.
 *
 * @param id - The ID of the scheduled query to update
 * @param updates - Partial updates to apply to the scheduled query
 * @returns The updated `ScheduledQuery` if found and updated, or `null` if no query with the given `id` exists
 */
export function updateScheduledQuery(
  id: string,
  updates: UpdateScheduledQueryInput
): ScheduledQuery | null {
  const queries = scheduledQueriesStore.get('scheduledQueries', [])
  const index = queries.findIndex((q) => q.id === id)

  if (index === -1) {
    return null
  }

  const oldQuery = queries[index]
  queries[index] = {
    ...oldQuery,
    ...updates,
    updatedAt: Date.now()
  }

  // Recalculate nextRunAt if schedule changed
  if (updates.schedule) {
    queries[index].nextRunAt = getNextRunTime(queries[index].schedule)
  }

  scheduledQueriesStore.set('scheduledQueries', queries)

  // Reschedule if status or schedule changed
  if (updates.status !== undefined || updates.schedule !== undefined) {
    scheduleCronJob(queries[index])
  }

  log.debug('Updated scheduled query:', queries[index].name)
  return queries[index]
}

/**
 * Delete a scheduled query and its run history.
 *
 * Stops any active cron job for the query, removes the scheduled query from storage,
 * and deletes all run history associated with that query.
 *
 * @param id - The ID of the scheduled query to delete
 * @returns `true` if a scheduled query was removed, `false` if no matching query was found
 */
export function deleteScheduledQuery(id: string): boolean {
  // Stop any active cron job
  const job = activeJobs.get(id)
  if (job) {
    job.stop()
    activeJobs.delete(id)
  }

  const queries = scheduledQueriesStore.get('scheduledQueries', [])
  const filtered = queries.filter((q) => q.id !== id)

  if (filtered.length === queries.length) {
    return false
  }

  scheduledQueriesStore.set('scheduledQueries', filtered)

  // Also delete run history for this query
  const runs = scheduledQueryRunsStore.get('runs', [])
  const filteredRuns = runs.filter((r) => r.scheduledQueryId !== id)
  scheduledQueryRunsStore.set('runs', filteredRuns)

  log.debug('Deleted scheduled query:', id)
  return true
}

/**
 * Pause a scheduled query.
 *
 * @param id - The ID of the scheduled query to pause
 * @returns The updated `ScheduledQuery` with status `'paused'`, or `null` if no query with the given id exists
 */
export function pauseScheduledQuery(id: string): ScheduledQuery | null {
  return updateScheduledQuery(id, { status: 'paused' })
}

/**
 * Reactivates a scheduled query so it will be scheduled to run.
 *
 * @returns The updated `ScheduledQuery`, or `null` if no query with the given `id` exists.
 */
export function resumeScheduledQuery(id: string): ScheduledQuery | null {
  return updateScheduledQuery(id, { status: 'active', lastError: undefined })
}

/**
 * Trigger an immediate execution of the scheduled query identified by `id`.
 *
 * @param id - The scheduled query's unique identifier
 * @returns The latest run for the scheduled query after execution, or `null` if the query was not found
 */
export async function runScheduledQueryNow(id: string): Promise<ScheduledQueryRun | null> {
  const query = getScheduledQuery(id)
  if (!query) {
    return null
  }

  // Execute immediately
  await executeScheduledQuery(id)

  // Return the latest run (sort by startedAt descending to get most recent)
  const runs = scheduledQueryRunsStore.get('runs', [])
  const queryRuns = runs
    .filter((r) => r.scheduledQueryId === id)
    .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
  return queryRuns[0] || null
}

/**
 * Retrieve the run history for a scheduled query.
 *
 * Returns the runs for the given query ordered by `startedAt` from newest to oldest.
 *
 * @param queryId - The ID of the scheduled query to fetch runs for
 * @param limit - Optional maximum number of runs to return
 * @returns An array of `ScheduledQueryRun` objects sorted by `startedAt` descending; limited to `limit` items if provided
 */
export function getScheduledQueryRuns(queryId: string, limit?: number): ScheduledQueryRun[] {
  const runs = scheduledQueryRunsStore.get('runs', [])
  const queryRuns = runs
    .filter((r) => r.scheduledQueryId === queryId)
    .sort((a, b) => b.startedAt - a.startedAt)

  return limit ? queryRuns.slice(0, limit) : queryRuns
}

/**
 * Retrieve recent runs across all scheduled queries.
 *
 * @param limit - Maximum number of runs to return (defaults to 50)
 * @returns An array of scheduled query runs sorted by `startedAt` descending, limited to the most recent `limit` entries
 */
export function getAllRecentRuns(limit: number = 50): ScheduledQueryRun[] {
  const runs = scheduledQueryRunsStore.get('runs', [])
  return runs.sort((a, b) => b.startedAt - a.startedAt).slice(0, limit)
}

/**
 * Remove all run history entries associated with a scheduled query.
 *
 * @param queryId - The ID of the scheduled query whose runs should be removed
 */
export function clearScheduledQueryRuns(queryId: string): void {
  const runs = scheduledQueryRunsStore.get('runs', [])
  const filtered = runs.filter((r) => r.scheduledQueryId !== queryId)
  scheduledQueryRunsStore.set('runs', filtered)
}

/**
 * Stops all active scheduled cron jobs and clears the internal job registry.
 */
export function stopAllSchedules(): void {
  for (const [id, job] of activeJobs) {
    job.stop()
    log.debug('Stopped schedule:', id)
  }
  activeJobs.clear()
}

/**
 * Checks whether a cron expression is syntactically valid.
 *
 * @param expression - The cron expression to validate
 * @returns An object with `valid: true` when the expression parses successfully; when invalid, `valid: false` and `error` contains the parser message
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
 * @param expression - The cron expression to parse
 * @param count - Number of upcoming run times to return (default: 5)
 * @param timezone - IANA timezone name to evaluate the cron expression in (defaults to the system timezone)
 * @returns An array of timestamps (milliseconds since Unix epoch) for the next `count` runs; returns an empty array if the expression cannot be parsed
 */
export function getNextRunTimes(
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
