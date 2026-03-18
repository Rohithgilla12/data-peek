import type {
  ConnectionConfig,
  EditBatch,
  EditResult,
  QueryTelemetry,
  BenchmarkResult,
  PerformanceAnalysisConfig,
  QueryHistoryItemForAnalysis
} from '@shared/index'
import { getAdapter } from '../desktop-imports.js'
import { cancelQuery } from '../desktop-imports.js'
import { buildQuery, validateOperation, buildPreviewSql } from '../desktop-imports.js'
import { telemetryCollector } from '../desktop-imports.js'
import { analyzeQueryPerformance } from '../desktop-imports.js'
import {
  getCachedSchema,
  isCacheValid,
  setCachedSchema,
  invalidateSchemaCache,
  type CachedSchema
} from '../services/schema-cache.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('query-handlers')

type RegisterFn = (channel: string, handler: (args: any) => Promise<any>) => void

export function registerQueryHandlers(register: RegisterFn): void {
  // Test connection
  register('db:connect', async (config: ConnectionConfig) => {
    try {
      const adapter = getAdapter(config)
      await adapter.connect(config)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Execute query
  register('db:query', async ({
    config,
    query,
    executionId,
    queryTimeoutMs
  }: {
    config: ConnectionConfig
    query: string
    executionId?: string
    queryTimeoutMs?: number
  }) => {
    log.debug('Query request', { executionId })

    try {
      const adapter = getAdapter(config)
      const multiResult = await adapter.queryMultiple(config, query, {
        executionId,
        queryTimeoutMs
      })

      return {
        success: true,
        data: {
          results: multiResult.results,
          totalDurationMs: multiResult.totalDurationMs,
          statementCount: multiResult.results.length,
          // Legacy single-result format
          rows:
            multiResult.results.find((r: any) => r.isDataReturning)?.rows ||
            multiResult.results[0]?.rows ||
            [],
          fields:
            multiResult.results.find((r: any) => r.isDataReturning)?.fields ||
            multiResult.results[0]?.fields ||
            [],
          rowCount:
            multiResult.results.find((r: any) => r.isDataReturning)?.rowCount ??
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
  })

  // Cancel query
  register('db:cancel-query', async (executionId: string) => {
    try {
      const result = await cancelQuery(executionId)
      if (result.cancelled) {
        return { success: true, data: { cancelled: true } }
      }
      return { success: false, error: result.error }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Invalidate schema cache
  register('db:invalidate-schema-cache', async (config: ConnectionConfig) => {
    invalidateSchemaCache(config)
    return { success: true }
  })

  // Fetch schemas with caching
  register('db:schemas', async (args: ConnectionConfig | { config: ConnectionConfig; forceRefresh?: boolean }) => {
    const config = 'config' in args ? args.config : args
    const forceRefresh = 'forceRefresh' in args ? args.forceRefresh : false

    try {
      if (!forceRefresh) {
        const cached = getCachedSchema(config)
        if (cached && isCacheValid(cached)) {
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

      const adapter = getAdapter(config)
      const schemas = await adapter.getSchemas(config)

      let customTypes: CachedSchema['customTypes'] = []
      try {
        customTypes = await adapter.getTypes(config)
      } catch {
        // Types are optional
      }

      const timestamp = Date.now()
      setCachedSchema(config, { schemas, customTypes, timestamp })

      return {
        success: true,
        data: { schemas, customTypes, fetchedAt: timestamp, fromCache: false }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Return stale cache on error
      const staleCache = getCachedSchema(config)
      if (staleCache) {
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
  })

  // Execute edit batch
  register('db:execute', async ({ config, batch }: { config: ConnectionConfig; batch: EditBatch }) => {
    const adapter = getAdapter(config)
    const dbType = config.dbType || 'postgresql'
    const result: EditResult = {
      success: true,
      rowsAffected: 0,
      executedSql: [],
      errors: []
    }

    const validOperations: Array<{
      sql: string
      params: unknown[]
      preview: string
      opId: string
    }> = []

    for (const operation of batch.operations) {
      const validation = validateOperation(operation)
      if (!validation.valid) {
        result.errors!.push({ operationId: operation.id, message: validation.error! })
        continue
      }
      const query = buildQuery(operation, batch.context, dbType)
      const previewSql = buildPreviewSql(operation, batch.context, dbType)
      validOperations.push({ sql: query.sql, params: query.params, preview: previewSql, opId: operation.id })
    }

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
      const errorMessage = error instanceof Error ? error.message : String(error)
      for (const op of validOperations) {
        result.errors!.push({ operationId: op.opId, message: errorMessage })
      }
      result.success = false
      return { success: true, data: result }
    }
  })

  // Preview SQL
  register('db:preview-sql', async ({ batch, dbType }: { batch: EditBatch; dbType?: string }) => {
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
  })

  // Explain
  register('db:explain', async ({
    config,
    query,
    analyze
  }: {
    config: ConnectionConfig
    query: string
    analyze: boolean
  }) => {
    try {
      const adapter = getAdapter(config)
      const result = await adapter.explain(config, query, analyze)
      return { success: true, data: result }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Query with telemetry
  register('db:query-with-telemetry', async ({
    config,
    query,
    executionId,
    queryTimeoutMs
  }: {
    config: ConnectionConfig
    query: string
    executionId?: string
    queryTimeoutMs?: number
  }) => {
    try {
      const adapter = getAdapter(config)
      const multiResult = await adapter.queryMultiple(config, query, {
        executionId,
        collectTelemetry: true,
        queryTimeoutMs
      })

      return {
        success: true,
        data: {
          results: multiResult.results,
          totalDurationMs: multiResult.totalDurationMs,
          statementCount: multiResult.results.length,
          telemetry: multiResult.telemetry,
          rows:
            multiResult.results.find((r: any) => r.isDataReturning)?.rows ||
            multiResult.results[0]?.rows ||
            [],
          fields:
            multiResult.results.find((r: any) => r.isDataReturning)?.fields ||
            multiResult.results[0]?.fields ||
            [],
          rowCount:
            multiResult.results.find((r: any) => r.isDataReturning)?.rowCount ??
            multiResult.results[0]?.rowCount ??
            0,
          durationMs: multiResult.totalDurationMs
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Benchmark
  register('db:benchmark', async ({
    config,
    query,
    runCount
  }: {
    config: ConnectionConfig
    query: string
    runCount: number
  }) => {
    if (runCount < 1 || runCount > 1000) {
      return { success: false, error: 'Run count must be between 1 and 1000' }
    }

    try {
      const adapter = getAdapter(config)
      const telemetryRuns: QueryTelemetry[] = []

      for (let i = 0; i < runCount; i++) {
        try {
          const result = await adapter.queryMultiple(config, query, {
            executionId: `benchmark-${Date.now()}-${i}`,
            collectTelemetry: true
          })
          if (result.telemetry) telemetryRuns.push(result.telemetry)
          if (i < runCount - 1) await new Promise((r) => setTimeout(r, 10))
        } catch {
          // Continue on individual run failure
        }
      }

      if (telemetryRuns.length === 0) {
        return { success: false, error: 'All benchmark runs failed' }
      }

      const benchmarkResult: BenchmarkResult = telemetryCollector.aggregateBenchmark(telemetryRuns)
      return { success: true, data: benchmarkResult }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Analyze performance
  register('db:analyze-performance', async ({
    config,
    query,
    queryHistory,
    analysisConfig
  }: {
    config: ConnectionConfig
    query: string
    queryHistory: QueryHistoryItemForAnalysis[]
    analysisConfig?: Partial<PerformanceAnalysisConfig>
  }) => {
    if (config.dbType && config.dbType !== 'postgresql') {
      return { success: false, error: 'Performance analysis is currently only supported for PostgreSQL' }
    }

    try {
      const result = await analyzeQueryPerformance(config, query, queryHistory, analysisConfig)
      return { success: true, data: result }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })
}
