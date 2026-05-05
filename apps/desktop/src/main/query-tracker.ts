/**
 * Query Tracker - tracks active queries and provides cancellation support
 */

import type { Client, PoolClient } from 'pg'
import type { Connection } from 'mysql2/promise'
import type { Request as MSSQLRequest } from 'mssql'
import { createLogger } from './lib/logger'

const log = createLogger('query-tracker')

/** Supported cancellable handle types */
export type CancellableHandle =
  | { type: 'postgresql'; client: Client | PoolClient }
  | { type: 'mysql'; connection: Connection }
  | { type: 'mssql'; request: MSSQLRequest }
  | { type: 'sqlite' } // SQLite is synchronous and cannot be cancelled mid-query

interface ActiveQuery {
  executionId: string
  handle: CancellableHandle
  startedAt: number
}

/** Map of execution ID to active query handles */
const activeQueries = new Map<string, ActiveQuery>()

/**
 * Register an active query for potential cancellation
 */
export function registerQuery(executionId: string, handle: CancellableHandle): void {
  activeQueries.set(executionId, {
    executionId,
    handle,
    startedAt: Date.now()
  })
  log.debug(`Registered query ${executionId}`)
}

/**
 * Unregister a query (called when query completes)
 */
export function unregisterQuery(executionId: string): void {
  if (activeQueries.delete(executionId)) {
    log.debug(`Unregistered query ${executionId}`)
  }
}

/**
 * Cancel an active query by execution ID
 * Returns true if cancelled, false if query not found
 */
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
      case 'postgresql': {
        // PoolClient: release(true) destroys the underlying connection and removes it
        // from the pool, which aborts the in-flight query. Bare Client: end() closes
        // the socket. Both effects abort the running statement.
        const c = query.handle.client as PoolClient & Partial<Client>
        if (typeof c.release === 'function') {
          c.release(true)
        } else if (typeof c.end === 'function') {
          await c.end()
        }
        break
      }
      case 'mysql': {
        // MySQL: destroy the connection to abort the query
        query.handle.connection.destroy()
        break
      }
      case 'mssql': {
        // MSSQL: cancel the specific request without closing the pool
        query.handle.request.cancel()
        break
      }
      case 'sqlite': {
        // SQLite with better-sqlite3 is synchronous - cannot cancel mid-query
        // Just remove from tracking, the query will complete
        log.debug(`SQLite query ${executionId} cannot be cancelled (synchronous API)`)
        break
      }
    }

    activeQueries.delete(executionId)
    return { cancelled: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log.error(`Error cancelling query ${executionId}:`, errorMessage)
    // Still remove from active queries even if cancellation had an error
    activeQueries.delete(executionId)
    return { cancelled: false, error: errorMessage }
  }
}

/**
 * Check if a query is currently active
 */
export function isQueryActive(executionId: string): boolean {
  return activeQueries.has(executionId)
}

/**
 * Get count of active queries (for debugging)
 */
export function getActiveQueryCount(): number {
  return activeQueries.size
}
