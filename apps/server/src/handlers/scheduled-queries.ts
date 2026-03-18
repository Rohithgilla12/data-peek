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
} from '../desktop-imports.js'

type RegisterFn = (channel: string, handler: (args: any) => Promise<any>) => void

function wrap(fn: () => any) {
  try {
    const result = fn()
    return { success: true, data: result }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
}

export function registerScheduledQueriesHandlers(register: RegisterFn): void {
  register('scheduled-queries:list', async () => wrap(() => listScheduledQueries()))

  register('scheduled-queries:get', async (id: string) => {
    const query = getScheduledQuery(id)
    if (!query) return { success: false, error: 'Scheduled query not found' }
    return { success: true, data: query }
  })

  register('scheduled-queries:create', async (input: CreateScheduledQueryInput) =>
    wrap(() => createScheduledQuery(input)))

  register('scheduled-queries:update', async ({ id, updates }: { id: string; updates: UpdateScheduledQueryInput }) => {
    const query = updateScheduledQuery(id, updates)
    if (!query) return { success: false, error: 'Scheduled query not found' }
    return { success: true, data: query }
  })

  register('scheduled-queries:delete', async (id: string) => {
    const deleted = deleteScheduledQuery(id)
    if (!deleted) return { success: false, error: 'Scheduled query not found' }
    return { success: true }
  })

  register('scheduled-queries:pause', async (id: string) => {
    const query = pauseScheduledQuery(id)
    if (!query) return { success: false, error: 'Scheduled query not found' }
    return { success: true, data: query }
  })

  register('scheduled-queries:resume', async (id: string) => {
    const query = resumeScheduledQuery(id)
    if (!query) return { success: false, error: 'Scheduled query not found' }
    return { success: true, data: query }
  })

  register('scheduled-queries:run-now', async (id: string) => {
    try {
      const run = await runScheduledQueryNow(id)
      if (!run) return { success: false, error: 'Scheduled query not found' }
      return { success: true, data: run }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  register('scheduled-queries:get-runs', async ({ queryId, limit }: { queryId: string; limit?: number }) =>
    wrap(() => getScheduledQueryRuns(queryId, limit)))

  register('scheduled-queries:get-all-runs', async (limit?: number) =>
    wrap(() => getAllRecentRuns(limit)))

  register('scheduled-queries:clear-runs', async (queryId: string) => {
    try {
      clearScheduledQueryRuns(queryId)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  register('scheduled-queries:validate-cron', async (expression: string) =>
    wrap(() => validateCronExpression(expression)))

  register('scheduled-queries:get-next-runs', async ({ expression, count, timezone }: { expression: string; count?: number; timezone?: string }) =>
    wrap(() => getNextRunTimes(expression, count, timezone)))
}
