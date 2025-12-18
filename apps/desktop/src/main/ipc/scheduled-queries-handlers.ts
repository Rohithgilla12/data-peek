import { ipcMain } from 'electron'
import type { CreateScheduledQueryInput, UpdateScheduledQueryInput } from '@shared/index'
import {
  listScheduledQueries,
  getScheduledQuery,
  createScheduledQuery,
  updateScheduledQuery,
  deleteScheduledQuery,
  pauseScheduledQuery,
  resumeScheduledQuery,
  runScheduledQueryNow,
  getScheduledQueryRuns,
  getAllRecentRuns,
  clearScheduledQueryRuns,
  validateCronExpression,
  getNextRunTimes
} from '../scheduler-service'

/**
 * Register IPC handlers on `ipcMain` for scheduled-queries operations.
 *
 * Registers handlers for listing, retrieving, creating, updating, deleting, pausing,
 * resuming, running now, querying run history, clearing runs, validating cron expressions,
 * and computing next run times. Each handler returns either `{ success: true, data }`
 * or `{ success: false, error }` and normalizes not-found conditions into a standard error message.
 */
export function registerScheduledQueriesHandlers(): void {
  // List all scheduled queries
  ipcMain.handle('scheduled-queries:list', () => {
    try {
      const queries = listScheduledQueries()
      return { success: true, data: queries }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Get a single scheduled query
  ipcMain.handle('scheduled-queries:get', (_, id: string) => {
    try {
      const query = getScheduledQuery(id)
      if (!query) {
        return { success: false, error: 'Scheduled query not found' }
      }
      return { success: true, data: query }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Create a new scheduled query
  ipcMain.handle('scheduled-queries:create', (_, input: CreateScheduledQueryInput) => {
    try {
      const query = createScheduledQuery(input)
      return { success: true, data: query }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Update a scheduled query
  ipcMain.handle(
    'scheduled-queries:update',
    (_, { id, updates }: { id: string; updates: UpdateScheduledQueryInput }) => {
      try {
        const query = updateScheduledQuery(id, updates)
        if (!query) {
          return { success: false, error: 'Scheduled query not found' }
        }
        return { success: true, data: query }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Delete a scheduled query
  ipcMain.handle('scheduled-queries:delete', (_, id: string) => {
    try {
      const deleted = deleteScheduledQuery(id)
      if (!deleted) {
        return { success: false, error: 'Scheduled query not found' }
      }
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Pause a scheduled query
  ipcMain.handle('scheduled-queries:pause', (_, id: string) => {
    try {
      const query = pauseScheduledQuery(id)
      if (!query) {
        return { success: false, error: 'Scheduled query not found' }
      }
      return { success: true, data: query }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Resume a scheduled query
  ipcMain.handle('scheduled-queries:resume', (_, id: string) => {
    try {
      const query = resumeScheduledQuery(id)
      if (!query) {
        return { success: false, error: 'Scheduled query not found' }
      }
      return { success: true, data: query }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Run a scheduled query immediately
  ipcMain.handle('scheduled-queries:run-now', async (_, id: string) => {
    try {
      const run = await runScheduledQueryNow(id)
      if (!run) {
        return { success: false, error: 'Scheduled query not found' }
      }
      return { success: true, data: run }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Get run history for a scheduled query
  ipcMain.handle(
    'scheduled-queries:get-runs',
    (_, { queryId, limit }: { queryId: string; limit?: number }) => {
      try {
        const runs = getScheduledQueryRuns(queryId, limit)
        return { success: true, data: runs }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Get all recent runs
  ipcMain.handle('scheduled-queries:get-all-runs', (_, limit?: number) => {
    try {
      const runs = getAllRecentRuns(limit)
      return { success: true, data: runs }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Clear run history for a scheduled query
  ipcMain.handle('scheduled-queries:clear-runs', (_, queryId: string) => {
    try {
      clearScheduledQueryRuns(queryId)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Validate a cron expression
  ipcMain.handle('scheduled-queries:validate-cron', (_, expression: string) => {
    try {
      const result = validateCronExpression(expression)
      return { success: true, data: result }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Get next run times for a cron expression
  ipcMain.handle(
    'scheduled-queries:get-next-runs',
    (
      _,
      { expression, count, timezone }: { expression: string; count?: number; timezone?: string }
    ) => {
      try {
        const times = getNextRunTimes(expression, count, timezone)
        return { success: true, data: times }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )
}
