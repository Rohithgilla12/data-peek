/**
 * Query Tracker — reimplementation for the server.
 * Tracks active queries and provides cancellation support.
 * Same interface as desktop's query-tracker.ts but without electron-log.
 */
import { createLogger } from '../lib/logger.js'

const log = createLogger('query-tracker')

export type CancellableHandle =
  | { type: 'postgresql'; client: { end(): Promise<void> } }
  | { type: 'mysql'; connection: { destroy(): void } }
  | { type: 'mssql'; request: { cancel(): void } }
  | { type: 'sqlite' }

interface ActiveQuery {
  executionId: string
  handle: CancellableHandle
  startedAt: number
}

const activeQueries = new Map<string, ActiveQuery>()

export function registerQuery(executionId: string, handle: CancellableHandle): void {
  activeQueries.set(executionId, { executionId, handle, startedAt: Date.now() })
  log.debug(`Registered query ${executionId}`)
}

export function unregisterQuery(executionId: string): void {
  if (activeQueries.delete(executionId)) {
    log.debug(`Unregistered query ${executionId}`)
  }
}

export async function cancelQuery(
  executionId: string
): Promise<{ cancelled: boolean; error?: string }> {
  const query = activeQueries.get(executionId)
  if (!query) {
    return { cancelled: false, error: 'Query not found or already completed' }
  }

  log.debug(`Cancelling query ${executionId}`)

  try {
    switch (query.handle.type) {
      case 'postgresql':
        await query.handle.client.end()
        break
      case 'mysql':
        query.handle.connection.destroy()
        break
      case 'mssql':
        query.handle.request.cancel()
        break
      case 'sqlite':
        log.debug(`SQLite query ${executionId} cannot be cancelled (synchronous API)`)
        break
    }

    activeQueries.delete(executionId)
    return { cancelled: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log.error(`Error cancelling query ${executionId}:`, errorMessage)
    activeQueries.delete(executionId)
    return { cancelled: false, error: errorMessage }
  }
}

export function isQueryActive(executionId: string): boolean {
  return activeQueries.has(executionId)
}

export function getActiveQueryCount(): number {
  return activeQueries.size
}
