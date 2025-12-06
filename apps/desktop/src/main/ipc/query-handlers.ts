import { ipcMain } from 'electron'
import type { ConnectionConfig, EditBatch, EditResult } from '@shared/index'
import { getAdapter } from '../db-adapter'
import { cancelQuery } from '../query-tracker'
import { buildQuery, validateOperation, buildPreviewSql } from '../sql-builder'
import {
  getCachedSchema,
  isCacheValid,
  setCachedSchema,
  invalidateSchemaCache,
  type CachedSchema
} from '../schema-cache'

/**
 * Register database query and schema handlers
 */
export function registerQueryHandlers(): void {
  // Connect to database (test connection)
  ipcMain.handle('db:connect', async (_, config: ConnectionConfig) => {
    try {
      const adapter = getAdapter(config)
      await adapter.connect(config)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Execute a query
  ipcMain.handle(
    'db:query',
    async (
      _,
      {
        config,
        query,
        executionId
      }: { config: ConnectionConfig; query: string; executionId?: string }
    ) => {
      console.log('[query-handlers] Received query request')
      console.log('[query-handlers] Config:', { ...config, password: '***' })
      console.log('[query-handlers] Query:', query)
      console.log('[query-handlers] Execution ID:', executionId)

      try {
        const adapter = getAdapter(config)
        console.log('[query-handlers] Connecting...')

        // Use queryMultiple to support multiple statements
        // Pass executionId for cancellation support
        const multiResult = await adapter.queryMultiple(config, query, { executionId })

        console.log('[query-handlers] Query completed in', multiResult.totalDurationMs, 'ms')
        console.log('[query-handlers] Statement count:', multiResult.results.length)

        return {
          success: true,
          data: {
            // Return multi-statement results
            results: multiResult.results,
            totalDurationMs: multiResult.totalDurationMs,
            statementCount: multiResult.results.length,
            // Also include legacy single-result format for backward compatibility
            // (uses first data-returning result or first result if none)
            rows:
              multiResult.results.find((r) => r.isDataReturning)?.rows ||
              multiResult.results[0]?.rows ||
              [],
            fields:
              multiResult.results.find((r) => r.isDataReturning)?.fields ||
              multiResult.results[0]?.fields ||
              [],
            rowCount:
              multiResult.results.find((r) => r.isDataReturning)?.rowCount ??
              multiResult.results[0]?.rowCount ??
              0,
            durationMs: multiResult.totalDurationMs
          }
        }
      } catch (error: unknown) {
        console.error('[query-handlers] Error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Cancel a running query by execution ID
  ipcMain.handle('db:cancel-query', async (_, executionId: string) => {
    console.log('[query-handlers] Cancelling query:', executionId)

    try {
      const result = await cancelQuery(executionId)
      if (result.cancelled) {
        console.log('[query-handlers] Query cancelled successfully')
        return { success: true, data: { cancelled: true } }
      } else {
        console.log('[query-handlers] Query not found:', result.error)
        return { success: false, error: result.error }
      }
    } catch (error: unknown) {
      console.error('[query-handlers] Error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Invalidate schema cache for a connection
  ipcMain.handle('db:invalidate-schema-cache', (_, config: ConnectionConfig) => {
    invalidateSchemaCache(config)
    return { success: true }
  })

  // Fetch database schemas, tables, and columns (with caching)
  ipcMain.handle(
    'db:schemas',
    async (_, args: ConnectionConfig | { config: ConnectionConfig; forceRefresh?: boolean }) => {
      // Support both old (config only) and new (with forceRefresh) API
      const config = 'config' in args ? args.config : args
      const forceRefresh = 'forceRefresh' in args ? args.forceRefresh : false

      try {
        // Check memory cache first (unless force refresh)
        if (!forceRefresh) {
          const cached = getCachedSchema(config)
          if (cached && isCacheValid(cached)) {
            console.log(`[query-handlers] Cache hit`)
            return {
              success: true,
              data: {
                schemas: cached.schemas,
                customTypes: cached.customTypes,
                fetchedAt: cached.timestamp,
                fromCache: true
              }
            }
          }
        }

        // Fetch fresh data
        if (forceRefresh) {
          console.log(`[query-handlers] Force refresh, fetching from database...`)
        } else {
          console.log(`[query-handlers] Cache miss, fetching from database...`)
        }
        const adapter = getAdapter(config)
        const schemas = await adapter.getSchemas(config)

        // Also fetch custom types
        let customTypes: CachedSchema['customTypes'] = []
        try {
          customTypes = await adapter.getTypes(config)
        } catch {
          // Types are optional, ignore errors
        }

        const timestamp = Date.now()

        // Update both memory and disk cache
        const cacheEntry: CachedSchema = { schemas, customTypes, timestamp }
        setCachedSchema(config, cacheEntry)

        return {
          success: true,
          data: {
            schemas,
            customTypes,
            fetchedAt: timestamp,
            fromCache: false
          }
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)

        // On error, try to return stale cache if available
        const staleCache = getCachedSchema(config)
        if (staleCache) {
          console.log(`[query-handlers] Returning stale cache due to error`)
          return {
            success: true,
            data: {
              schemas: staleCache.schemas,
              customTypes: staleCache.customTypes,
              fetchedAt: staleCache.timestamp,
              fromCache: true,
              stale: true,
              refreshError: errorMessage
            }
          }
        }

        return { success: false, error: errorMessage }
      }
    }
  )

  // Execute edit operations (INSERT, UPDATE, DELETE)
  ipcMain.handle(
    'db:execute',
    async (_, { config, batch }: { config: ConnectionConfig; batch: EditBatch }) => {
      console.log('[query-handlers] Received edit batch')
      console.log('[query-handlers] Context:', batch.context)
      console.log('[query-handlers] Operations count:', batch.operations.length)

      const adapter = getAdapter(config)
      const dbType = config.dbType || 'postgresql'
      const result: EditResult = {
        success: true,
        rowsAffected: 0,
        executedSql: [],
        errors: []
      }

      // Validate operations first
      const validOperations: Array<{
        sql: string
        params: unknown[]
        preview: string
        opId: string
      }> = []
      for (const operation of batch.operations) {
        const validation = validateOperation(operation)
        if (!validation.valid) {
          result.errors!.push({
            operationId: operation.id,
            message: validation.error!
          })
          continue
        }

        const query = buildQuery(operation, batch.context, dbType)
        const previewSql = buildPreviewSql(operation, batch.context, dbType)
        validOperations.push({
          sql: query.sql,
          params: query.params,
          preview: previewSql,
          opId: operation.id
        })
      }

      // If all operations have validation errors, return early
      if (validOperations.length === 0 && result.errors!.length > 0) {
        result.success = false
        return { success: true, data: result }
      }

      try {
        const statements = validOperations.map((op) => ({ sql: op.sql, params: op.params }))
        const txResult = await adapter.executeTransaction(config, statements)

        result.rowsAffected = txResult.rowsAffected
        result.executedSql = validOperations.map((op) => op.preview)

        return { success: true, data: result }
      } catch (error: unknown) {
        console.error('[query-handlers] Error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        // Mark all valid operations as failed
        for (const op of validOperations) {
          result.errors!.push({
            operationId: op.opId,
            message: errorMessage
          })
        }
        result.success = false
        return { success: true, data: result }
      }
    }
  )

  // Preview SQL for edit operations (without executing)
  ipcMain.handle(
    'db:preview-sql',
    (_, { batch, dbType }: { batch: EditBatch; dbType?: string }) => {
      try {
        const targetDbType = (dbType || 'postgresql') as 'postgresql' | 'mysql' | 'sqlite' | 'mssql'
        const previews = batch.operations.map((op) => ({
          operationId: op.id,
          sql: buildPreviewSql(op, batch.context, targetDbType)
        }))
        return { success: true, data: previews }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Execute EXPLAIN ANALYZE for query plan analysis
  ipcMain.handle(
    'db:explain',
    async (
      _,
      { config, query, analyze }: { config: ConnectionConfig; query: string; analyze: boolean }
    ) => {
      console.log('[query-handlers] Received explain request')
      console.log('[query-handlers] Query:', query)
      console.log('[query-handlers] Analyze:', analyze)

      try {
        const adapter = getAdapter(config)
        const result = await adapter.explain(config, query, analyze)

        return {
          success: true,
          data: result
        }
      } catch (error: unknown) {
        console.error('[query-handlers] Error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )
}
