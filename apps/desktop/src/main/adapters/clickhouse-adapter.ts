import { randomUUID } from 'crypto'
import { ClickHouseError, type ClickHouseClient } from '@clickhouse/client'
import {
  CapabilityError,
  SCHEMA_INTEL_CHECKS,
  type ActiveQuery,
  type CacheStats,
  type ColumnDefinition,
  type ColumnStats,
  type CommonValue,
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
import { splitStatements } from '../lib/sql-parser'
import { registerQuery, unregisterQuery } from '../query-tracker'
import { telemetryCollector, TELEMETRY_PHASES } from '../telemetry-collector'
import {
  classifyColumnType,
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

const ABORT_BACKSTOP_MS = 5000
const CONNECT_TIMEOUT_MS = 15_000
/**
 * The e2e suite runs with DP_E2E=1 and may shorten the connect probe with
 * DP_E2E_CONNECT_TIMEOUT_MS so stale connect attempts settle in seconds. Outside
 * e2e this is always CONNECT_TIMEOUT_MS.
 */
const CONNECT_PROBE_TIMEOUT_MS =
  process.env.DP_E2E === '1' && Number(process.env.DP_E2E_CONNECT_TIMEOUT_MS) > 0
    ? Number(process.env.DP_E2E_CONNECT_TIMEOUT_MS)
    : CONNECT_TIMEOUT_MS

/**
 * Without this the server starts streaming a 200 as soon as the first block is ready and
 * an error that happens later (a timeout, a bad row) is embedded in the body, which the
 * client reports as a normal result. Buffering makes every error an HTTP error.
 */
const WAIT_END = { wait_end_of_query: 1 } as const

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

  /**
   * `SELECT version()` authenticates; `/ping` does not. The probe gets its own deadline
   * because the pooled client's request_timeout is sized for long analytical queries.
   */
  async connect(config: ConnectionConfig): Promise<void> {
    const deadline = new AbortController()
    const timer = setTimeout(() => deadline.abort(), CONNECT_PROBE_TIMEOUT_MS)
    try {
      await withClickHouseClient(config, async (client) => {
        const rs = await client.query({
          query: 'SELECT version()',
          format: 'JSON',
          abort_signal: deadline.signal
        })
        await rs.json()
      })
    } catch (error) {
      await closeClickHousePool(config).catch(() => undefined)
      if (deadline.signal.aborted) {
        throw new Error(`Connection timed out after ${CONNECT_TIMEOUT_MS / 1000} s`)
      }
      throw new Error(describeError(error))
    } finally {
      clearTimeout(timer)
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
    if (options?.sessionId) throw new CapabilityError('clickhouse', 'transactions')

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

  async queryReadOnly(
    config: ConnectionConfig,
    sql: string,
    options: { timeoutMs: number; maxRows?: number }
  ): Promise<AdapterQueryResult> {
    if (hasTrailingFormatClause(sql)) throw new Error(FORMAT_CLAUSE_MESSAGE)
    // 'break' stops at a block boundary, so the server may still send more than maxRows.
    const rowLimit =
      options.maxRows === undefined
        ? {}
        : { max_result_rows: String(options.maxRows), result_overflow_mode: 'break' as const }
    return withClickHouseClient(config, async (client) => {
      const abort = new AbortController()
      const timeoutMessage = `Query timed out after ${options.timeoutMs / 1000} s`
      let timer: ReturnType<typeof setTimeout> | undefined
      // The client may stop watching abort_signal once headers arrive, so a stalled body
      // would outlive the abort; the race settles the call regardless.
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          abort.abort()
          reject(new Error(timeoutMessage))
        }, options.timeoutMs + ABORT_BACKSTOP_MS)
      })
      const run = async (): Promise<AdapterQueryResult> => {
        const rs = await client.query({
          query: sql,
          format: 'JSON',
          abort_signal: abort.signal,
          clickhouse_settings: {
            readonly: '1',
            ...timeoutSettings(options.timeoutMs),
            ...rowLimit,
            ...WAIT_END
          }
        })
        const json = await rs.json<Record<string, unknown>>()
        const result = toStatementResult(sql, 0, json, 0)
        return { rows: result.rows, fields: result.fields, rowCount: result.rowCount }
      }
      try {
        return await Promise.race([run(), deadline])
      } catch (error) {
        if (abort.signal.aborted) throw new Error(timeoutMessage)
        throw new Error(describeError(error))
      } finally {
        clearTimeout(timer)
      }
    })
  }

  async execute(
    config: ConnectionConfig,
    sql: string,
    params: unknown[]
  ): Promise<{ rowCount: number | null }> {
    if (params.length > 0) throw new CapabilityError('clickhouse', 'inlineEdit')
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
    throw new CapabilityError('clickhouse', 'transactions')
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

  async getTypes(): Promise<CustomTypeInfo[]> {
    return []
  }

  async getColumnStats(
    config: ConnectionConfig,
    schema: string,
    table: string,
    column: string,
    dataType: string
  ): Promise<ColumnStats> {
    const statsType = classifyColumnType(dataType)
    const query_params = { db: schema, tbl: table, col: column }
    const source = 'FROM {db:Identifier}.{tbl:Identifier}'

    return withClickHouseClient(config, async (client) => {
      const [base] = await this.rows<{
        total_rows: string
        null_count: string
        distinct_count: string
      }>(client, {
        query: `SELECT count() AS total_rows,
                       countIf(isNull({col:Identifier})) AS null_count,
                       uniq({col:Identifier}) AS distinct_count
                ${source}`,
        query_params
      })

      const totalRows = Number(base.total_rows)
      const nullCount = Number(base.null_count)
      const distinctCount = Number(base.distinct_count)

      const stats: ColumnStats = {
        column,
        dataType,
        statsType,
        totalRows,
        nullCount,
        nullPercentage: totalRows > 0 ? (nullCount / totalRows) * 100 : 0,
        distinctCount,
        distinctPercentage: totalRows > 0 ? (distinctCount / totalRows) * 100 : 0
      }

      if (statsType === 'numeric') {
        const [num] = await this.rows<{
          min_val: string | null
          max_val: string | null
          avg_val: number | null
          stddev_val: number | null
        }>(client, {
          query: `SELECT toString(min({col:Identifier})) AS min_val,
                         toString(max({col:Identifier})) AS max_val,
                         avg({col:Identifier}) AS avg_val,
                         stddevPop({col:Identifier}) AS stddev_val
                  ${source}
                  WHERE {col:Identifier} IS NOT NULL`,
          query_params
        })
        const hasValues = totalRows > nullCount
        stats.min = hasValues ? (num?.min_val ?? null) : null
        stats.max = hasValues ? (num?.max_val ?? null) : null
        stats.avg = hasValues && num?.avg_val != null ? Number(num.avg_val) : null
        stats.stdDev = hasValues && num?.stddev_val != null ? Number(num.stddev_val) : null
      } else if (statsType === 'datetime') {
        const [range] = await this.rows<{ min_val: string | null; max_val: string | null }>(
          client,
          {
            query: `SELECT toString(min({col:Identifier})) AS min_val,
                         toString(max({col:Identifier})) AS max_val
                  ${source}
                  WHERE {col:Identifier} IS NOT NULL`,
            query_params
          }
        )
        const hasValues = totalRows > nullCount
        stats.min = hasValues ? (range?.min_val ?? null) : null
        stats.max = hasValues ? (range?.max_val ?? null) : null
      } else if (statsType === 'text') {
        const [len] = await this.rows<{
          min_length: string | null
          max_length: string | null
          avg_length: number | null
        }>(client, {
          query: `SELECT min(lengthUTF8(toString({col:Identifier}))) AS min_length,
                         max(lengthUTF8(toString({col:Identifier}))) AS max_length,
                         avg(lengthUTF8(toString({col:Identifier}))) AS avg_length
                  ${source}
                  WHERE {col:Identifier} IS NOT NULL`,
          query_params
        })
        const hasValues = totalRows > nullCount
        stats.minLength = hasValues && len?.min_length != null ? Number(len.min_length) : null
        stats.maxLength = hasValues && len?.max_length != null ? Number(len.max_length) : null
        stats.avgLength = hasValues && len?.avg_length != null ? Number(len.avg_length) : null
      } else if (statsType === 'boolean') {
        const [flags] = await this.rows<{ true_count: string; false_count: string }>(client, {
          query: `SELECT countIf({col:Identifier} = true) AS true_count,
                         countIf({col:Identifier} = false) AS false_count
                  ${source}`,
          query_params
        })
        stats.trueCount = Number(flags.true_count)
        stats.falseCount = Number(flags.false_count)
      }

      if (statsType === 'text' || statsType === 'boolean' || statsType === 'other') {
        // topK picks the candidates in bounded memory (an exact GROUP BY keeps one entry per
        // distinct value), then only those few values are counted so percentages stay exact.
        const common = await this.rows<{ val: string; cnt: string }>(client, {
          query: `WITH (SELECT topK(5)(toString({col:Identifier})) ${source}) AS top
                  SELECT toString({col:Identifier}) AS val, count() AS cnt
                  ${source}
                  WHERE {col:Identifier} IS NOT NULL AND has(top, toString({col:Identifier}))
                  GROUP BY val
                  ORDER BY cnt DESC, val ASC
                  LIMIT 5`,
          query_params
        })
        if (common.length > 0) {
          stats.commonValues = common.map((row): CommonValue => ({
            value: row.val,
            count: Number(row.cnt),
            percentage: totalRows > 0 ? (Number(row.cnt) / totalRows) * 100 : 0
          }))
        }
      }

      return stats
    })
  }

  async getActiveQueries(): Promise<ActiveQuery[]> {
    throw new CapabilityError('clickhouse', 'healthActiveQueries')
  }

  async getTableSizes(
    config: ConnectionConfig,
    schema?: string
  ): Promise<{ dbSize: DatabaseSizeInfo; tables: TableSizeInfo[] }> {
    const rows = await withClickHouseClient(config, (client) =>
      this.rows<SystemPartsRow>(client, {
        // bytes_on_disk already contains every index file, so index_bytes is a slice of it.
        query: `SELECT database, table, sum(rows) AS rows, sum(bytes_on_disk) AS bytes_on_disk,
                       sum(marks_bytes) + sum(primary_key_size)
                         + sum(secondary_indices_compressed_bytes)
                         + sum(secondary_indices_marks_bytes) AS index_bytes
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
    throw new CapabilityError('clickhouse', 'healthCacheStats')
  }

  async getLocks(): Promise<LockInfo[]> {
    throw new CapabilityError('clickhouse', 'healthLocks')
  }

  async killQuery(): Promise<{ success: boolean; error?: string }> {
    throw new CapabilityError('clickhouse', 'killQuery')
  }

  async runSchemaIntel(
    _config: ConnectionConfig,
    checks?: SchemaIntelCheckId[]
  ): Promise<SchemaIntelReport> {
    const requested = checks && checks.length > 0 ? checks : SCHEMA_INTEL_CHECKS.map((c) => c.id)
    return {
      findings: [],
      skipped: requested.map((checkId) => ({
        checkId,
        reason: 'Schema Intel is not available for ClickHouse connections.'
      })),
      durationMs: 0,
      ranAt: Date.now()
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
