import { randomUUID } from 'crypto'
import { ClickHouseError, type ClickHouseClient } from '@clickhouse/client'
import {
  SCHEMA_INTEL_CHECKS,
  type ActiveQuery,
  type CacheStats,
  type ColumnDefinition,
  type ColumnStats,
  type ConnectionConfig,
  type CustomTypeInfo,
  type DatabaseSizeInfo,
  type LockInfo,
  type SchemaInfo,
  type SchemaIntelCheckId,
  type SchemaIntelReport,
  type SequenceInfo,
  type StatementResult,
  type TableDefinition,
  type TableSizeInfo
} from '@shared/index'
import type {
  AdapterMultiQueryResult,
  AdapterQueryResult,
  DatabaseAdapter,
  ExplainResult,
  QueryOptions
} from '../db-adapter'
import { unsupported } from '../lib/capability-guard'
import { splitStatements } from '../lib/sql-parser'
import { registerQuery, unregisterQuery } from '../query-tracker'
import { telemetryCollector, TELEMETRY_PHASES } from '../telemetry-collector'
import {
  classifyStatement,
  FORMAT_CLAUSE_MESSAGE,
  formatBytes,
  hasTrailingFormatClause,
  HIDDEN_DATABASES,
  mapPartsRows,
  mapSystemRows,
  rowCountFromSummary,
  timeoutSettings,
  toColumnInfo,
  toStatementResult,
  toTextPlan,
  type SystemColumnRow,
  type SystemPartsRow,
  type SystemTableRow
} from './clickhouse-mapping'
import {
  closeClickHousePool,
  closeAllClickHousePools,
  withClickHouseClient
} from './clickhouse-pool-manager'

export { closeClickHousePool, closeAllClickHousePools }

/** Grace after the server deadline before the client gives up on the socket itself. */
const ABORT_BACKSTOP_MS = 5000

/**
 * Without this the server starts streaming a 200 as soon as the first block is ready and
 * an error that happens later (a timeout, a bad row) is embedded in the body, which the
 * client reports as a normal result. Buffering makes every error an HTTP error.
 */
const WAIT_END = { wait_end_of_query: 1 } as const

/** The server's error name (READONLY, TIMEOUT_EXCEEDED) belongs in the message the user sees. */
function describeError(error: unknown): string {
  if (error instanceof ClickHouseError && error.type) return `${error.message} (${error.type})`
  return error instanceof Error ? error.message : String(error)
}

const COLUMNS_SQL = `
  SELECT database, table, name, type, position, default_kind, default_expression,
         is_in_primary_key, comment
  FROM system.columns
  WHERE database NOT IN {hidden:Array(String)}`

export class ClickHouseAdapter implements DatabaseAdapter {
  readonly dbType = 'clickhouse' as const

  /** `SELECT version()` authenticates; `/ping` does not. */
  async connect(config: ConnectionConfig): Promise<void> {
    try {
      await withClickHouseClient(config, async (client) => {
        const rs = await client.query({ query: 'SELECT version()', format: 'JSON' })
        await rs.json()
      })
    } catch (error) {
      await closeClickHousePool(config).catch(() => undefined)
      throw new Error(describeError(error))
    }
  }

  async query(config: ConnectionConfig, sql: string): Promise<AdapterQueryResult> {
    const { results } = await this.queryMultiple(config, sql)
    const last =
      [...results].reverse().find((r) => r.isDataReturning) ?? results[results.length - 1]
    if (!last) return { rows: [], fields: [], rowCount: 0 }
    return { rows: last.rows, fields: last.fields, rowCount: last.rowCount }
  }

  async queryMultiple(
    config: ConnectionConfig,
    sql: string,
    options?: QueryOptions
  ): Promise<AdapterMultiQueryResult> {
    if (options?.sessionId) throw unsupported('clickhouse', 'transactions')

    const collectTelemetry = options?.collectTelemetry ?? false
    const executionId = options?.executionId ?? randomUUID()
    if (collectTelemetry) {
      telemetryCollector.startQuery(executionId, false)
      telemetryCollector.startPhase(executionId, TELEMETRY_PHASES.TCP_HANDSHAKE)
    }

    const totalStart = Date.now()
    const results: StatementResult[] = []
    let totalRowCount = 0

    return withClickHouseClient(config, async (client) => {
      if (collectTelemetry) {
        telemetryCollector.endPhase(executionId, TELEMETRY_PHASES.TCP_HANDSHAKE)
      }

      const statements = splitStatements(sql, 'clickhouse')
      const settings = timeoutSettings(options?.queryTimeoutMs)
      // One session per call so SET / USE carry across the statements of a script.
      const sessionId = executionId
      const abort = new AbortController()
      let cancelled = false
      let currentQueryId = ''

      if (options?.executionId) {
        registerQuery(options.executionId, {
          type: 'clickhouse',
          cancel: async () => {
            cancelled = true
            abort.abort()
            if (!currentQueryId) return
            // Separate request, no session: the session is busy with the query being killed.
            await client.command({
              query: 'KILL QUERY WHERE query_id = {id:String} ASYNC',
              query_params: { id: currentQueryId }
            })
          }
        })
      }

      try {
        for (let i = 0; i < statements.length; i++) {
          if (abort.signal.aborted) throw new Error('Query cancelled')
          const statement = statements[i]
          const stmtStart = Date.now()
          currentQueryId = `${executionId}:${i}`

          const backstop =
            'max_execution_time' in settings
              ? setTimeout(
                  () => abort.abort(),
                  settings.max_execution_time * 1000 + ABORT_BACKSTOP_MS
                )
              : undefined
          try {
            if (collectTelemetry) {
              telemetryCollector.startPhase(executionId, TELEMETRY_PHASES.EXECUTION)
            }
            const kind = classifyStatement(statement)
            if (kind === 'query') {
              if (hasTrailingFormatClause(statement)) throw new Error(FORMAT_CLAUSE_MESSAGE)
              const rs = await client.query({
                query: statement,
                format: 'JSON',
                query_id: currentQueryId,
                session_id: sessionId,
                abort_signal: abort.signal,
                clickhouse_settings: { ...settings, ...WAIT_END }
              })
              if (collectTelemetry) {
                telemetryCollector.endPhase(executionId, TELEMETRY_PHASES.EXECUTION)
                telemetryCollector.startPhase(executionId, TELEMETRY_PHASES.PARSE)
              }
              const json = await rs.json<Record<string, unknown>>()
              const result = toStatementResult(statement, i, json, Date.now() - stmtStart)
              totalRowCount += result.rowCount
              results.push(result)
              if (collectTelemetry) {
                telemetryCollector.endPhase(executionId, TELEMETRY_PHASES.PARSE)
              }
            } else {
              const res = await client.command({
                query: statement,
                query_id: currentQueryId,
                session_id: sessionId,
                abort_signal: abort.signal,
                clickhouse_settings: { ...settings, ...WAIT_END }
              })
              if (collectTelemetry) {
                telemetryCollector.endPhase(executionId, TELEMETRY_PHASES.EXECUTION)
              }
              const rowCount = rowCountFromSummary(res.summary)
              totalRowCount += rowCount
              results.push({
                statement,
                statementIndex: i,
                rows: [],
                fields: [],
                rowCount,
                durationMs: Date.now() - stmtStart,
                isDataReturning: false
              })
            }
          } catch (error) {
            if (collectTelemetry) telemetryCollector.cancel(executionId)
            if (cancelled) throw new Error('Query cancelled')
            throw new Error(
              `Error in statement ${i + 1}: ${describeError(error)}\n\nStatement:\n${statement}`
            )
          } finally {
            if (backstop) clearTimeout(backstop)
          }
        }

        const result: AdapterMultiQueryResult = {
          results,
          totalDurationMs: Date.now() - totalStart
        }
        if (collectTelemetry) {
          result.telemetry = telemetryCollector.finalize(executionId, totalRowCount)
        }
        return result
      } finally {
        if (options?.executionId) unregisterQuery(options.executionId)
      }
    })
  }

  /** Server-enforced read-only execution for the MCP read guard: `readonly = 1`. */
  async queryReadOnly(
    config: ConnectionConfig,
    sql: string,
    options: { timeoutMs: number }
  ): Promise<AdapterQueryResult> {
    if (hasTrailingFormatClause(sql)) throw new Error(FORMAT_CLAUSE_MESSAGE)
    return withClickHouseClient(config, async (client) => {
      try {
        const rs = await client.query({
          query: sql,
          format: 'JSON',
          clickhouse_settings: { readonly: '1', ...timeoutSettings(options.timeoutMs), ...WAIT_END }
        })
        const json = await rs.json<Record<string, unknown>>()
        const result = toStatementResult(sql, 0, json, 0)
        return { rows: result.rows, fields: result.fields, rowCount: result.rowCount }
      } catch (error) {
        throw new Error(describeError(error))
      }
    })
  }

  /** No positional parameters in ClickHouse; every params-passing caller is gated. */
  async execute(
    config: ConnectionConfig,
    sql: string,
    params: unknown[]
  ): Promise<{ rowCount: number | null }> {
    if (params.length > 0) throw unsupported('clickhouse', 'inlineEdit')
    return withClickHouseClient(config, async (client) => {
      try {
        const res = await client.command({ query: sql, clickhouse_settings: WAIT_END })
        return { rowCount: rowCountFromSummary(res.summary) }
      } catch (error) {
        throw new Error(describeError(error))
      }
    })
  }

  async executeTransaction(): Promise<never> {
    throw unsupported('clickhouse', 'transactions')
  }

  async getSchemas(config: ConnectionConfig): Promise<SchemaInfo[]> {
    return withClickHouseClient(config, async (client) => {
      const [tables, columns] = await Promise.all([
        this.rows<SystemTableRow>(client, {
          query: `SELECT database, name, engine, total_rows FROM system.tables
                  WHERE database NOT IN {hidden:Array(String)}`,
          query_params: { hidden: HIDDEN_DATABASES }
        }),
        this.rows<SystemColumnRow>(client, {
          query: COLUMNS_SQL,
          query_params: { hidden: HIDDEN_DATABASES }
        })
      ])
      return mapSystemRows(tables, columns, config.database)
    })
  }

  /** `EXPLAIN indexes = 1`. There is no ANALYZE, so `analyze` is ignored (SQLite precedent). */
  async explain(config: ConnectionConfig, sql: string, _analyze: boolean): Promise<ExplainResult> {
    const statements = splitStatements(sql, 'clickhouse')
    if (statements.length !== 1) {
      throw new Error('EXPLAIN accepts a single statement')
    }
    const start = Date.now()
    const rows = await withClickHouseClient(config, (client) =>
      this.rows<{ explain: string }>(client, { query: `EXPLAIN indexes = 1 ${statements[0]}` })
    )
    return { plan: toTextPlan(rows), durationMs: Date.now() - start }
  }

  async getTableDDL(
    config: ConnectionConfig,
    schema: string,
    table: string
  ): Promise<TableDefinition> {
    const rows = await withClickHouseClient(config, (client) =>
      this.rows<SystemColumnRow>(client, {
        query: `SELECT database, table, name, type, position, default_kind, default_expression,
                       is_in_primary_key, comment
                FROM system.columns
                WHERE database = {db:String} AND table = {table:String}
                ORDER BY position`,
        query_params: { db: schema, table }
      })
    )
    const columns: ColumnDefinition[] = rows.map((row, idx) => {
      const info = toColumnInfo(row)
      return {
        id: `col-${idx}`,
        name: info.name,
        dataType: info.dataType,
        isNullable: info.isNullable,
        isPrimaryKey: info.isPrimaryKey,
        isUnique: false,
        defaultValue: info.defaultValue,
        comment: row.comment || undefined
      }
    })
    return { schema, name: table, columns, constraints: [], indexes: [] }
  }

  async getSequences(): Promise<SequenceInfo[]> {
    return []
  }

  /** Must resolve: mcp/tools.ts awaits it inside Promise.all without a catch. */
  async getTypes(): Promise<CustomTypeInfo[]> {
    return []
  }

  async getColumnStats(): Promise<ColumnStats> {
    throw unsupported('clickhouse', 'columnStats')
  }

  async getActiveQueries(): Promise<ActiveQuery[]> {
    throw unsupported('clickhouse', 'healthActiveQueries')
  }

  /** Active parts from system.parts, per table; `schema` narrows to one database. */
  async getTableSizes(
    config: ConnectionConfig,
    schema?: string
  ): Promise<{ dbSize: DatabaseSizeInfo; tables: TableSizeInfo[] }> {
    const rows = await withClickHouseClient(config, (client) =>
      this.rows<SystemPartsRow>(client, {
        query: `SELECT database, table, sum(rows) AS rows, sum(bytes_on_disk) AS bytes_on_disk,
                       sum(marks_bytes) + sum(primary_key_bytes_in_memory) AS index_bytes
                FROM system.parts
                WHERE active AND database NOT IN {hidden:Array(String)}
                  AND ({db:String} = '' OR database = {db:String})
                GROUP BY database, table
                ORDER BY bytes_on_disk DESC`,
        query_params: { hidden: HIDDEN_DATABASES, db: schema ?? '' }
      })
    )
    const tables = mapPartsRows(rows)
    const totalSizeBytes = tables.reduce((sum, t) => sum + t.totalSizeBytes, 0)
    return { dbSize: { totalSize: formatBytes(totalSizeBytes), totalSizeBytes }, tables }
  }

  async getCacheStats(): Promise<CacheStats> {
    throw unsupported('clickhouse', 'healthCacheStats')
  }

  async getLocks(): Promise<LockInfo[]> {
    throw unsupported('clickhouse', 'healthLocks')
  }

  async killQuery(): Promise<{ success: boolean; error?: string }> {
    throw unsupported('clickhouse', 'killQuery')
  }

  /** No check supports ClickHouse: every requested check is reported as skipped. */
  async runSchemaIntel(
    _config: ConnectionConfig,
    checks?: SchemaIntelCheckId[]
  ): Promise<SchemaIntelReport> {
    const requested = checks && checks.length > 0 ? checks : SCHEMA_INTEL_CHECKS.map((c) => c.id)
    const now = Date.now()
    return {
      findings: [],
      skipped: requested.map((checkId) => ({
        checkId,
        reason: 'Schema Intel is not available for ClickHouse connections.'
      })),
      durationMs: 0,
      ranAt: now
    }
  }

  private async rows<T>(
    client: ClickHouseClient,
    params: { query: string; query_params?: Record<string, unknown> }
  ): Promise<T[]> {
    const rs = await client.query({ ...params, format: 'JSON' })
    const json = await rs.json<T>()
    return json.data
  }
}
