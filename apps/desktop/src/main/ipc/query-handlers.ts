import { ipcMain } from 'electron'
import type {
  ConnectionConfig,
  EditBatch,
  EditResult,
  QueryTelemetry,
  BenchmarkResult
} from '@shared/index'
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
import { createLogger } from '../lib/logger'
import { telemetryCollector } from '../telemetry-collector'

const log = createLogger('query-handlers')

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
      log.debug('Received query request', { ...config, password: '***' })
      log.debug('Query:', query)
      log.debug('Execution ID:', executionId)

      try {
        const adapter = getAdapter(config)
        log.debug('Connecting...')

        // Use queryMultiple to support multiple statements
        // Pass executionId for cancellation support
        const multiResult = await adapter.queryMultiple(config, query, { executionId })

        log.debug('Query completed in', multiResult.totalDurationMs, 'ms')
        log.debug('Statement count:', multiResult.results.length)

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
        log.error('Query error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Cancel a running query by execution ID
  ipcMain.handle('db:cancel-query', async (_, executionId: string) => {
    log.debug('Cancelling query:', executionId)

    try {
      const result = await cancelQuery(executionId)
      if (result.cancelled) {
        log.debug('Query cancelled successfully')
        return { success: true, data: { cancelled: true } }
      } else {
        log.debug('Query not found:', result.error)
        return { success: false, error: result.error }
      }
    } catch (error: unknown) {
      log.error('Cancel query error:', error)
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
            log.debug('Cache hit')
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
          log.debug('Force refresh, fetching from database...')
        } else {
          log.debug('Cache miss, fetching from database...')
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
          log.warn('Returning stale cache due to error')
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
      log.debug('Received edit batch', batch.context)
      log.debug('Operations count:', batch.operations.length)

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
        log.error('Execute batch error:', error)
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
      log.debug('Received explain request, analyze:', analyze)
      log.debug('Query:', query)

      try {
        const adapter = getAdapter(config)
        const result = await adapter.explain(config, query, analyze)

        return {
          success: true,
          data: result
        }
      } catch (error: unknown) {
        log.error('Explain error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Execute a query with telemetry collection
  ipcMain.handle(
    'db:query-with-telemetry',
    async (
      _,
      {
        config,
        query,
        executionId
      }: { config: ConnectionConfig; query: string; executionId?: string }
    ) => {
      log.debug('Received query with telemetry request', { ...config, password: '***' })
      log.debug('Query:', query)
      log.debug('Execution ID:', executionId)

      try {
        const adapter = getAdapter(config)
        log.debug('Connecting with telemetry...')

        // Use queryMultiple with telemetry enabled
        const multiResult = await adapter.queryMultiple(config, query, {
          executionId,
          collectTelemetry: true
        })

        log.debug('Query completed in', multiResult.totalDurationMs, 'ms')
        log.debug('Statement count:', multiResult.results.length)
        log.debug('Telemetry collected:', !!multiResult.telemetry)

        return {
          success: true,
          data: {
            results: multiResult.results,
            totalDurationMs: multiResult.totalDurationMs,
            statementCount: multiResult.results.length,
            telemetry: multiResult.telemetry,
            // Legacy format for backward compatibility
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
        log.error('Query with telemetry error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Run a query multiple times and collect benchmark statistics
  ipcMain.handle(
    'db:benchmark',
    async (
      _,
      { config, query, runCount }: { config: ConnectionConfig; query: string; runCount: number }
    ) => {
      log.debug('Received benchmark request', { ...config, password: '***' })
      log.debug('Query:', query)
      log.debug('Run count:', runCount)

      // Validate run count
      if (runCount < 1 || runCount > 1000) {
        return { success: false, error: 'Run count must be between 1 and 1000' }
      }

      try {
        const adapter = getAdapter(config)
        const telemetryRuns: QueryTelemetry[] = []

        log.debug('Starting benchmark runs...')

        for (let i = 0; i < runCount; i++) {
          const executionId = `benchmark-${Date.now()}-${i}`

          try {
            const result = await adapter.queryMultiple(config, query, {
              executionId,
              collectTelemetry: true
            })

            if (result.telemetry) {
              telemetryRuns.push(result.telemetry)
            }

            // Small delay between runs to avoid overwhelming the database
            if (i < runCount - 1) {
              await new Promise((resolve) => setTimeout(resolve, 10))
            }
          } catch (runError) {
            // If a run fails, log it but continue
            log.warn(`Benchmark run ${i + 1} failed:`, runError)
          }
        }

        log.debug('Benchmark completed, successful runs:', telemetryRuns.length)

        if (telemetryRuns.length === 0) {
          return { success: false, error: 'All benchmark runs failed' }
        }

        // Aggregate the results
        const benchmarkResult: BenchmarkResult =
          telemetryCollector.aggregateBenchmark(telemetryRuns)

        return {
          success: true,
          data: benchmarkResult
        }
      } catch (error: unknown) {
        log.error('Benchmark error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )
}
