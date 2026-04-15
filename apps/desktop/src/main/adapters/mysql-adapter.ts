import mysql from 'mysql2/promise'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'
import type {
  ConnectionConfig,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  QueryField,
  ForeignKeyInfo,
  TableDefinition,
  ColumnDefinition,
  ConstraintDefinition,
  IndexDefinition,
  SequenceInfo,
  CustomTypeInfo,
  StatementResult,
  RoutineInfo,
  RoutineParameterInfo,
  ColumnStats,
  ColumnStatsType,
  CommonValue,
  ActiveQuery,
  TableSizeInfo,
  CacheStats,
  LockInfo,
  DatabaseSizeInfo,
  SchemaIntelCheckId,
  SchemaIntelReport
} from '@shared/index'
import { runMysqlSchemaIntel } from '../schema-intel/mysql'
import type {
  DatabaseAdapter,
  AdapterQueryResult,
  AdapterMultiQueryResult,
  ExplainResult,
  QueryOptions
} from '../db-adapter'
import { registerQuery, unregisterQuery } from '../query-tracker'
import { closeTunnel, createTunnel, TunnelSession } from '../ssh-tunnel-service'
import { splitStatements } from '../lib/sql-parser'
import { telemetryCollector, TELEMETRY_PHASES } from '../telemetry-collector'

/** Split SQL into statements for MySQL */
const splitMySqlStatements = (sql: string) => splitStatements(sql, 'mysql')

/**
 * MySQL type codes to type name mapping
 * Based on mysql2 field type constants
 */
const MYSQL_TYPE_MAP: Record<number, string> = {
  0: 'decimal',
  1: 'tinyint',
  2: 'smallint',
  3: 'int',
  4: 'float',
  5: 'double',
  6: 'null',
  7: 'timestamp',
  8: 'bigint',
  9: 'mediumint',
  10: 'date',
  11: 'time',
  12: 'datetime',
  13: 'year',
  14: 'newdate',
  15: 'varchar',
  16: 'bit',
  245: 'json',
  246: 'newdecimal',
  247: 'enum',
  248: 'set',
  249: 'tiny_blob',
  250: 'medium_blob',
  251: 'long_blob',
  252: 'blob',
  253: 'var_string',
  254: 'string',
  255: 'geometry'
}

/**
 * Resolve MySQL type code to human-readable type name
 */
function resolveMySQLType(typeCode: number): string {
  return MYSQL_TYPE_MAP[typeCode] ?? `unknown(${typeCode})`
}

/**
 * Create MySQL connection config from our ConnectionConfig
 * Properly handles SSL options for cloud databases like AWS RDS
 */
function toMySQLConfig(
  config: ConnectionConfig,
  overrides?: { host: string; port: number }
): mysql.ConnectionOptions {
  const mysqlConfig: mysql.ConnectionOptions = {
    host: overrides?.host ?? config.host,
    port: overrides?.port ?? config.port,
    user: config.user,
    password: config.password,
    database: config.database
  }

  if (config.ssl) {
    const sslOptions = config.sslOptions || {}

    if (sslOptions.rejectUnauthorized === false) {
      mysqlConfig.ssl = {
        rejectUnauthorized: false
      }
    } else if (sslOptions.ca) {
      try {
        mysqlConfig.ssl = {
          rejectUnauthorized: true,
          ca: readFileSync(sslOptions.ca, 'utf-8')
        }
      } catch (err) {
        console.error(`Failed to read CA certificate from ${sslOptions.ca}:`, err)
        throw new Error(
          `Failed to read CA certificate file: ${sslOptions.ca}. Please verify the file exists and is readable.`
        )
      }
    } else {
      mysqlConfig.ssl = {
        rejectUnauthorized: true
      }
    }
  }

  return mysqlConfig
}

/**
 * Normalize row from MySQL query to lowercase keys
 * MySQL can return column names in different cases depending on configuration
 */
function normalizeRow<T extends Record<string, unknown>>(row: Record<string, unknown>): T {
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    normalized[key.toLowerCase()] = value
  }
  return normalized as T
}

/**
 * Check if a SQL statement is data-returning (SELECT, SHOW, etc.)
 */
function isDataReturningStatement(sql: string): boolean {
  const normalized = sql.trim().toUpperCase()
  if (normalized.startsWith('SELECT')) return true
  if (normalized.startsWith('SHOW')) return true
  if (normalized.startsWith('DESCRIBE')) return true
  if (normalized.startsWith('DESC')) return true
  if (normalized.startsWith('EXPLAIN')) return true
  // MySQL supports RETURNING clause in recent versions
  if (normalized.includes('RETURNING')) return true
  return false
}

/**
 * MySQL database adapter
 */
export class MySQLAdapter implements DatabaseAdapter {
  readonly dbType = 'mysql' as const

  async connect(config: ConnectionConfig): Promise<void> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    const connection = await mysql.createConnection(toMySQLConfig(config, tunnelOverrides))
    try {
      await connection.end()
    } catch {
      // ignore end errors during test connection
    } finally {
      closeTunnel(tunnelSession)
    }
  }

  async query(config: ConnectionConfig, sql: string): Promise<AdapterQueryResult> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    let connection: mysql.Connection | null = null

    try {
      connection = await mysql.createConnection(toMySQLConfig(config, tunnelOverrides))
      const [rows, fields] = await connection.query(sql)

      const queryFields: QueryField[] = (fields as mysql.FieldPacket[]).map((f) => ({
        name: f.name,
        dataType: resolveMySQLType(f.type ?? 253), // 253 = var_string as fallback
        dataTypeID: f.type ?? 253
      }))

      const resultRows = Array.isArray(rows) ? rows : [rows]

      return {
        rows: resultRows as Record<string, unknown>[],
        fields: queryFields,
        rowCount: resultRows.length
      }
    } finally {
      if (connection) await connection.end().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  async queryMultiple(
    config: ConnectionConfig,
    sql: string,
    options?: QueryOptions
  ): Promise<AdapterMultiQueryResult> {
    const collectTelemetry = options?.collectTelemetry ?? false
    const executionId = options?.executionId ?? randomUUID()

    // Start telemetry collection if requested
    if (collectTelemetry) {
      telemetryCollector.startQuery(executionId, false)
      telemetryCollector.startPhase(executionId, TELEMETRY_PHASES.TCP_HANDSHAKE)
    }

    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }

    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined

    let connection: mysql.Connection | null = null
    const totalStart = Date.now()
    const results: StatementResult[] = []
    let totalRowCount = 0

    try {
      if (collectTelemetry) {
        telemetryCollector.endPhase(executionId, TELEMETRY_PHASES.TCP_HANDSHAKE)
        telemetryCollector.startPhase(executionId, TELEMETRY_PHASES.DB_HANDSHAKE)
      }

      connection = await mysql.createConnection(toMySQLConfig(config, tunnelOverrides))

      if (collectTelemetry) {
        telemetryCollector.endPhase(executionId, TELEMETRY_PHASES.DB_HANDSHAKE)
      }

      // Set query timeout if specified (0 = no timeout)
      // Note: max_execution_time only affects SELECT statements in MySQL 5.7.8+
      const queryTimeoutMs = options?.queryTimeoutMs
      if (
        typeof queryTimeoutMs === 'number' &&
        Number.isFinite(queryTimeoutMs) &&
        queryTimeoutMs > 0
      ) {
        const safeTimeout = Math.floor(queryTimeoutMs)
        await connection.query(`SET SESSION max_execution_time = ${safeTimeout}`)
      }

      // Register for cancellation support
      if (options?.executionId) {
        registerQuery(options.executionId, { type: 'mysql', connection })
      }
      const statements = splitMySqlStatements(sql)

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i]
        const stmtStart = Date.now()

        try {
          // Start execution phase timing
          if (collectTelemetry) {
            telemetryCollector.startPhase(executionId, TELEMETRY_PHASES.EXECUTION)
          }

          const [rows, fields] = await connection.query(statement)

          if (collectTelemetry) {
            telemetryCollector.endPhase(executionId, TELEMETRY_PHASES.EXECUTION)
            telemetryCollector.startPhase(executionId, TELEMETRY_PHASES.PARSE)
          }

          const stmtDuration = Date.now() - stmtStart

          const queryFields: QueryField[] =
            (fields as mysql.FieldPacket[] | undefined)?.map((f) => ({
              name: f.name,
              dataType: resolveMySQLType(f.type ?? 253),
              dataTypeID: f.type ?? 253
            })) || []

          const resultRows = Array.isArray(rows) ? rows : []
          const isDataReturning = isDataReturningStatement(statement)

          // For non-SELECT statements, rowCount is the affected rows
          let rowCount: number
          if (isDataReturning) {
            rowCount = resultRows.length
          } else {
            const header = rows as mysql.ResultSetHeader
            rowCount = header.affectedRows ?? 0
          }
          totalRowCount += rowCount

          results.push({
            statement,
            statementIndex: i,
            rows: resultRows as Record<string, unknown>[],
            fields: queryFields,
            rowCount,
            durationMs: stmtDuration,
            isDataReturning
          })

          if (collectTelemetry) {
            telemetryCollector.endPhase(executionId, TELEMETRY_PHASES.PARSE)
          }
        } catch (error) {
          const stmtDuration = Date.now() - stmtStart
          const errorMessage = error instanceof Error ? error.message : String(error)

          results.push({
            statement,
            statementIndex: i,
            rows: [],
            fields: [{ name: 'error', dataType: 'text' }],
            rowCount: 0,
            durationMs: stmtDuration,
            isDataReturning: false
          })

          // Cancel telemetry on error
          if (collectTelemetry) {
            telemetryCollector.cancel(executionId)
          }

          throw new Error(
            `Error in statement ${i + 1}: ${errorMessage}\n\nStatement:\n${statement}`
          )
        }
      }

      const result: AdapterMultiQueryResult = {
        results,
        totalDurationMs: Date.now() - totalStart
      }

      // Finalize telemetry
      if (collectTelemetry) {
        result.telemetry = telemetryCollector.finalize(executionId, totalRowCount)
      }

      return result
    } finally {
      // Unregister from tracker
      if (options?.executionId) {
        unregisterQuery(options.executionId)
      }
      if (connection) await connection.end().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  async execute(
    config: ConnectionConfig,
    sql: string,
    params: unknown[]
  ): Promise<{ rowCount: number | null }> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    let connection: mysql.Connection | null = null

    try {
      connection = await mysql.createConnection(toMySQLConfig(config, tunnelOverrides))
      const [result] = await connection.execute(sql, params)
      const affectedRows = (result as mysql.ResultSetHeader).affectedRows ?? null
      return { rowCount: affectedRows }
    } finally {
      if (connection) await connection.end().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  async executeTransaction(
    config: ConnectionConfig,
    statements: Array<{ sql: string; params: unknown[] }>
  ): Promise<{ rowsAffected: number; results: Array<{ rowCount: number | null }> }> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    let connection: mysql.Connection | null = null

    try {
      connection = await mysql.createConnection(toMySQLConfig(config, tunnelOverrides))
      await connection.beginTransaction()

      const results: Array<{ rowCount: number | null }> = []
      let rowsAffected = 0

      for (const stmt of statements) {
        const [result] = await connection.execute(stmt.sql, stmt.params)
        const affectedRows = (result as mysql.ResultSetHeader).affectedRows ?? 0
        results.push({ rowCount: affectedRows })
        rowsAffected += affectedRows
      }

      await connection.commit()
      return { rowsAffected, results }
    } catch (error) {
      if (connection) await connection.rollback().catch(() => {})
      throw error
    } finally {
      if (connection) await connection.end().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  async getSchemas(config: ConnectionConfig): Promise<SchemaInfo[]> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    let connection: mysql.Connection | null = null

    try {
      connection = await mysql.createConnection(toMySQLConfig(config, tunnelOverrides))
      // In MySQL, "schema" = "database"
      // We'll show all databases as schemas, excluding system databases
      const [schemasRows] = await connection.query(`
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name NOT IN ('mysql', 'performance_schema', 'information_schema', 'sys')
        ORDER BY schema_name
      `)

      const schemasRaw = schemasRows as Array<Record<string, unknown>>
      const schemas = schemasRaw.map((row) => normalizeRow<{ schema_name: string }>(row))

      // Get all tables and views
      const [tablesRows] = await connection.query(`
        SELECT
          table_schema,
          table_name,
          table_type
        FROM information_schema.tables
        WHERE table_schema NOT IN ('mysql', 'performance_schema', 'information_schema', 'sys')
        ORDER BY table_schema, table_name
      `)

      const tablesRaw = tablesRows as Array<Record<string, unknown>>
      const tables = tablesRaw.map((row) =>
        normalizeRow<{
          table_schema: string
          table_name: string
          table_type: string
        }>(row)
      )

      // Get all columns with primary key info
      const [columnsRows] = await connection.query(`
        SELECT
          c.table_schema,
          c.table_name,
          c.column_name,
          c.data_type,
          c.column_type,
          c.is_nullable,
          c.column_default,
          c.ordinal_position,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale,
          c.extra,
          CASE WHEN kcu.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
        FROM information_schema.columns c
        LEFT JOIN information_schema.key_column_usage kcu
          ON c.table_schema = kcu.table_schema
          AND c.table_name = kcu.table_name
          AND c.column_name = kcu.column_name
          AND kcu.constraint_name = 'PRIMARY'
        WHERE c.table_schema NOT IN ('mysql', 'performance_schema', 'information_schema', 'sys')
        ORDER BY c.table_schema, c.table_name, c.ordinal_position
      `)

      const columnsRaw = columnsRows as Array<Record<string, unknown>>
      const columns = columnsRaw.map((row) =>
        normalizeRow<{
          table_schema: string
          table_name: string
          column_name: string
          data_type: string
          column_type: string
          is_nullable: string
          column_default: string | null
          ordinal_position: number
          character_maximum_length: number | null
          numeric_precision: number | null
          numeric_scale: number | null
          extra: string
          is_primary_key: number
        }>(row)
      )

      // Get all foreign key relationships
      const [fkRows] = await connection.query(`
        SELECT
          kcu.table_schema,
          kcu.table_name,
          kcu.column_name,
          kcu.constraint_name,
          kcu.referenced_table_schema AS referenced_schema,
          kcu.referenced_table_name AS referenced_table,
          kcu.referenced_column_name AS referenced_column
        FROM information_schema.key_column_usage kcu
        WHERE kcu.referenced_table_name IS NOT NULL
          AND kcu.table_schema NOT IN ('mysql', 'performance_schema', 'information_schema', 'sys')
        ORDER BY kcu.table_schema, kcu.table_name, kcu.column_name
      `)

      const fkRaw = fkRows as Array<Record<string, unknown>>
      const foreignKeys = fkRaw.map((row) =>
        normalizeRow<{
          table_schema: string
          table_name: string
          column_name: string
          constraint_name: string
          referenced_schema: string
          referenced_table: string
          referenced_column: string
        }>(row)
      )

      // Build foreign key lookup map
      const fkMap = new Map<string, ForeignKeyInfo>()
      for (const row of foreignKeys) {
        const key = `${row.table_schema}.${row.table_name}.${row.column_name}`
        fkMap.set(key, {
          constraintName: row.constraint_name,
          referencedSchema: row.referenced_schema,
          referencedTable: row.referenced_table,
          referencedColumn: row.referenced_column
        })
      }

      // Get all routines (stored procedures and functions)
      const [routinesRows] = await connection.query(`
        SELECT
          routine_schema,
          routine_name,
          routine_type,
          data_type as return_type,
          routine_comment as comment,
          specific_name
        FROM information_schema.routines
        WHERE routine_schema NOT IN ('mysql', 'performance_schema', 'information_schema', 'sys')
        ORDER BY routine_schema, routine_name
      `)

      const routinesRaw = routinesRows as Array<Record<string, unknown>>
      const routines = routinesRaw.map((row) =>
        normalizeRow<{
          routine_schema: string
          routine_name: string
          routine_type: string
          return_type: string | null
          comment: string | null
          specific_name: string
        }>(row)
      )

      // Get routine parameters
      const [paramsRows] = await connection.query(`
        SELECT
          specific_schema,
          specific_name,
          parameter_name,
          data_type,
          parameter_mode,
          ordinal_position
        FROM information_schema.parameters
        WHERE specific_schema NOT IN ('mysql', 'performance_schema', 'information_schema', 'sys')
          AND parameter_name IS NOT NULL
        ORDER BY specific_schema, specific_name, ordinal_position
      `)

      const paramsRaw = paramsRows as Array<Record<string, unknown>>
      const params = paramsRaw.map((row) =>
        normalizeRow<{
          specific_schema: string
          specific_name: string
          parameter_name: string | null
          data_type: string
          parameter_mode: string | null
          ordinal_position: number
        }>(row)
      )

      // Build parameters lookup map
      const paramsMap = new Map<string, RoutineParameterInfo[]>()
      for (const row of params) {
        const key = `${row.specific_schema}.${row.specific_name}`
        if (!paramsMap.has(key)) {
          paramsMap.set(key, [])
        }
        paramsMap.get(key)!.push({
          name: row.parameter_name || '',
          dataType: row.data_type,
          mode: (row.parameter_mode?.toUpperCase() || 'IN') as 'IN' | 'OUT' | 'INOUT',
          ordinalPosition: row.ordinal_position
        })
      }

      // Build routines lookup map
      const routinesMap = new Map<string, RoutineInfo[]>()
      for (const row of routines) {
        if (!routinesMap.has(row.routine_schema)) {
          routinesMap.set(row.routine_schema, [])
        }
        const paramsKey = `${row.routine_schema}.${row.specific_name}`
        const routineParams = paramsMap.get(paramsKey) || []

        routinesMap.get(row.routine_schema)!.push({
          name: row.routine_name,
          type: row.routine_type === 'PROCEDURE' ? 'procedure' : 'function',
          returnType: row.return_type || undefined,
          parameters: routineParams,
          comment: row.comment || undefined
        })
      }

      // Build schema structure
      const schemaMap = new Map<string, SchemaInfo>()

      for (const row of schemas) {
        schemaMap.set(row.schema_name, {
          name: row.schema_name,
          tables: [],
          routines: routinesMap.get(row.schema_name) || []
        })
      }

      // Build tables map
      const tableMap = new Map<string, TableInfo>()
      for (const row of tables) {
        const tableKey = `${row.table_schema}.${row.table_name}`
        const table: TableInfo = {
          name: row.table_name,
          type: row.table_type === 'VIEW' ? 'view' : 'table',
          columns: []
        }
        tableMap.set(tableKey, table)

        const schema = schemaMap.get(row.table_schema)
        if (schema) {
          schema.tables.push(table)
        }
      }

      // Assign columns to tables
      for (const row of columns) {
        const tableKey = `${row.table_schema}.${row.table_name}`
        const table = tableMap.get(tableKey)
        if (table) {
          // Format data type with length/precision
          const dataType = row.column_type || row.data_type
          // MySQL column_type already includes size info like varchar(255)

          const fkKey = `${row.table_schema}.${row.table_name}.${row.column_name}`
          const foreignKey = fkMap.get(fkKey)

          // Handle auto_increment
          let defaultValue = row.column_default || undefined
          if (row.extra?.includes('auto_increment')) {
            defaultValue = 'auto_increment'
          }

          const column: ColumnInfo = {
            name: row.column_name,
            dataType,
            isNullable: row.is_nullable === 'YES',
            isPrimaryKey: Boolean(row.is_primary_key),
            defaultValue,
            ordinalPosition: row.ordinal_position,
            foreignKey
          }
          table.columns.push(column)
        }
      }

      return Array.from(schemaMap.values())
    } finally {
      if (connection) await connection.end().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  async explain(config: ConnectionConfig, sql: string, analyze: boolean): Promise<ExplainResult> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    let connection: mysql.Connection | null = null

    try {
      connection = await mysql.createConnection(toMySQLConfig(config, tunnelOverrides))
      // MySQL uses EXPLAIN ANALYZE (8.0.18+) or just EXPLAIN
      const explainQuery = analyze ? `EXPLAIN ANALYZE ${sql}` : `EXPLAIN FORMAT=JSON ${sql}`

      const start = Date.now()
      const [rows] = await connection.query(explainQuery)
      const duration = Date.now() - start

      // For JSON format, the result is in the first row
      let plan: unknown
      if (analyze) {
        // EXPLAIN ANALYZE returns text output
        plan = rows
      } else {
        // EXPLAIN FORMAT=JSON returns JSON in EXPLAIN column
        const resultRows = rows as Array<{ EXPLAIN: string }>
        if (resultRows.length > 0 && resultRows[0].EXPLAIN) {
          plan = JSON.parse(resultRows[0].EXPLAIN)
        } else {
          plan = rows
        }
      }

      return {
        plan,
        durationMs: duration
      }
    } finally {
      if (connection) await connection.end().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  async getTableDDL(
    config: ConnectionConfig,
    schema: string,
    table: string
  ): Promise<TableDefinition> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    let connection: mysql.Connection | null = null

    try {
      connection = await mysql.createConnection(toMySQLConfig(config, tunnelOverrides))
      // Get columns with full metadata
      const [columnsRows] = await connection.query(
        `
        SELECT
          c.column_name,
          c.data_type,
          c.column_type,
          c.is_nullable,
          c.column_default,
          c.ordinal_position,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale,
          c.collation_name,
          c.column_comment,
          c.extra,
          CASE WHEN kcu.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
        FROM information_schema.columns c
        LEFT JOIN information_schema.key_column_usage kcu
          ON c.table_schema = kcu.table_schema
          AND c.table_name = kcu.table_name
          AND c.column_name = kcu.column_name
          AND kcu.constraint_name = 'PRIMARY'
        WHERE c.table_schema = ? AND c.table_name = ?
        ORDER BY c.ordinal_position
      `,
        [schema, table]
      )

      const columnResults = columnsRows as Array<{
        column_name: string
        data_type: string
        column_type: string
        is_nullable: string
        column_default: string | null
        ordinal_position: number
        character_maximum_length: number | null
        numeric_precision: number | null
        numeric_scale: number | null
        collation_name: string | null
        column_comment: string | null
        extra: string
        is_primary_key: number
      }>

      // Get constraints
      const [constraintsRows] = await connection.query(
        `
        SELECT
          tc.constraint_name,
          tc.constraint_type,
          kcu.column_name,
          kcu.referenced_table_schema AS ref_schema,
          kcu.referenced_table_name AS ref_table,
          kcu.referenced_column_name AS ref_column,
          rc.update_rule,
          rc.delete_rule
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
          AND tc.table_name = kcu.table_name
        LEFT JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
          AND tc.table_schema = rc.constraint_schema
        WHERE tc.table_schema = ? AND tc.table_name = ?
        ORDER BY tc.constraint_name, kcu.ordinal_position
      `,
        [schema, table]
      )

      const constraintResults = constraintsRows as Array<{
        constraint_name: string
        constraint_type: string
        column_name: string | null
        ref_schema: string | null
        ref_table: string | null
        ref_column: string | null
        update_rule: string | null
        delete_rule: string | null
      }>

      // Get indexes
      const [indexesRows] = await connection.query(
        `
        SELECT
          index_name,
          non_unique,
          column_name,
          seq_in_index,
          index_type
        FROM information_schema.statistics
        WHERE table_schema = ? AND table_name = ?
          AND index_name != 'PRIMARY'
        ORDER BY index_name, seq_in_index
      `,
        [schema, table]
      )

      const indexResults = indexesRows as Array<{
        index_name: string
        non_unique: number
        column_name: string
        seq_in_index: number
        index_type: string
      }>

      // Get table comment
      const [tableCommentRows] = await connection.query(
        `
        SELECT table_comment
        FROM information_schema.tables
        WHERE table_schema = ? AND table_name = ?
      `,
        [schema, table]
      )

      const tableCommentResult = tableCommentRows as Array<{ table_comment: string | null }>

      // Build columns
      const columns: ColumnDefinition[] = columnResults.map((row, idx) => {
        let defaultValue = row.column_default || undefined
        if (row.extra?.includes('auto_increment')) {
          defaultValue = undefined // Will be handled as auto_increment
        }

        return {
          id: `col-${idx}`,
          name: row.column_name,
          dataType: row.data_type,
          length: row.character_maximum_length || undefined,
          precision: row.numeric_precision || undefined,
          scale: row.numeric_scale || undefined,
          isNullable: row.is_nullable === 'YES',
          isPrimaryKey: Boolean(row.is_primary_key),
          isUnique: false, // Will be set from constraints
          defaultValue,
          comment: row.column_comment || undefined,
          collation: row.collation_name || undefined
        }
      })

      // Build constraints
      const constraintMap = new Map<
        string,
        {
          type: string
          columns: string[]
          refSchema?: string
          refTable?: string
          refColumns?: string[]
          onUpdate?: string
          onDelete?: string
        }
      >()

      for (const row of constraintResults) {
        const key = row.constraint_name
        if (!constraintMap.has(key)) {
          constraintMap.set(key, {
            type: row.constraint_type,
            columns: [],
            refSchema: row.ref_schema || undefined,
            refTable: row.ref_table || undefined,
            refColumns: [],
            onUpdate: row.update_rule || undefined,
            onDelete: row.delete_rule || undefined
          })
        }
        const constraint = constraintMap.get(key)!
        if (row.column_name && !constraint.columns.includes(row.column_name)) {
          constraint.columns.push(row.column_name)
        }
        if (row.ref_column && !constraint.refColumns!.includes(row.ref_column)) {
          constraint.refColumns!.push(row.ref_column)
        }
      }

      const constraints: ConstraintDefinition[] = []
      let constraintIdx = 0
      for (const [name, data] of constraintMap) {
        if (data.type === 'PRIMARY KEY') continue

        const constraintDef: ConstraintDefinition = {
          id: `constraint-${constraintIdx++}`,
          name,
          type: data.type === 'FOREIGN KEY' ? 'foreign_key' : 'unique',
          columns: data.columns
        }

        if (data.type === 'FOREIGN KEY') {
          constraintDef.referencedSchema = data.refSchema
          constraintDef.referencedTable = data.refTable
          constraintDef.referencedColumns = data.refColumns
          constraintDef.onUpdate = data.onUpdate as ConstraintDefinition['onUpdate']
          constraintDef.onDelete = data.onDelete as ConstraintDefinition['onDelete']
        }

        if (data.type === 'UNIQUE' && data.columns.length === 1) {
          const col = columns.find((c) => c.name === data.columns[0])
          if (col) col.isUnique = true
        }

        constraints.push(constraintDef)
      }

      // Build indexes
      const indexMap = new Map<string, { isUnique: boolean; method: string; columns: string[] }>()
      for (const row of indexResults) {
        if (!indexMap.has(row.index_name)) {
          indexMap.set(row.index_name, {
            isUnique: !row.non_unique,
            method: row.index_type.toLowerCase(),
            columns: []
          })
        }
        indexMap.get(row.index_name)!.columns.push(row.column_name)
      }

      const indexes: IndexDefinition[] = []
      let indexIdx = 0
      for (const [name, data] of indexMap) {
        indexes.push({
          id: `index-${indexIdx++}`,
          name,
          columns: data.columns.map((c) => ({ name: c })),
          isUnique: data.isUnique,
          method: data.method as IndexDefinition['method']
        })
      }

      return {
        schema,
        name: table,
        columns,
        constraints,
        indexes,
        comment: tableCommentResult[0]?.table_comment || undefined
      }
    } finally {
      if (connection) await connection.end().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getSequences(_config: ConnectionConfig): Promise<SequenceInfo[]> {
    // MySQL doesn't have sequences - it uses AUTO_INCREMENT
    // Return empty array as sequences are a PostgreSQL concept
    return []
  }

  async getTypes(config: ConnectionConfig): Promise<CustomTypeInfo[]> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    let connection: mysql.Connection | null = null

    try {
      // Get MySQL ENUM types from columns
      connection = await mysql.createConnection(toMySQLConfig(config, tunnelOverrides))
      // MySQL doesn't have standalone enum types, they're defined per column
      // We'll extract unique enum definitions from columns
      const [enumRows] = await connection.query(`
        SELECT DISTINCT
          table_schema as schema_name,
          column_type
        FROM information_schema.columns
        WHERE data_type = 'enum'
          AND table_schema NOT IN ('mysql', 'performance_schema', 'information_schema', 'sys')
        ORDER BY table_schema, column_type
      `)

      const enums = enumRows as Array<{ schema_name: string; column_type: string }>

      const types: CustomTypeInfo[] = []
      let idx = 0

      for (const row of enums) {
        // Parse enum values from column_type like "enum('a','b','c')"
        const match = row.column_type.match(/^enum\((.*)\)$/i)
        if (match) {
          const valuesStr = match[1]
          const values = valuesStr.split(',').map((v) => v.replace(/^'|'$/g, ''))

          types.push({
            schema: row.schema_name,
            name: `enum_${idx++}`,
            type: 'enum',
            values
          })
        }
      }

      return types
    } finally {
      if (connection) await connection.end().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  private classifyColumnType(dataType: string): ColumnStatsType {
    const lower = dataType.toLowerCase()
    if (
      lower.includes('int') ||
      lower.includes('decimal') ||
      lower.includes('numeric') ||
      lower.includes('float') ||
      lower.includes('double') ||
      lower.includes('real') ||
      lower.includes('bit')
    ) {
      return 'numeric'
    }
    if (lower.includes('date') || lower.includes('time') || lower.includes('year')) {
      return 'datetime'
    }
    if (lower === 'boolean' || lower === 'tinyint(1)') {
      return 'boolean'
    }
    if (
      lower.includes('char') ||
      lower.includes('text') ||
      lower.includes('varchar') ||
      lower.includes('enum') ||
      lower.includes('set')
    ) {
      return 'text'
    }
    return 'other'
  }

  async getColumnStats(
    config: ConnectionConfig,
    schema: string,
    table: string,
    column: string,
    dataType: string
  ): Promise<ColumnStats> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    let connection: mysql.Connection | null = null

    try {
      connection = await mysql.createConnection(toMySQLConfig(config, tunnelOverrides))

      const statsType = this.classifyColumnType(dataType)
      const quoteIdent = (name: string) => '`' + name.replace(/`/g, '``') + '`'
      const quotedTable = `${quoteIdent(schema)}.${quoteIdent(table)}`
      const quotedCol = quoteIdent(column)

      const [baseRows] = await connection.query(`
        SELECT
          COUNT(*) AS total_rows,
          COUNT(*) - COUNT(${quotedCol}) AS null_count,
          COUNT(DISTINCT ${quotedCol}) AS distinct_count
        FROM ${quotedTable}
      `)

      const baseRow = (baseRows as Array<Record<string, unknown>>)[0]
      const totalRows = Number(baseRow.total_rows)
      const nullCount = Number(baseRow.null_count)
      const distinctCount = Number(baseRow.distinct_count)
      const nullPercentage = totalRows > 0 ? (nullCount / totalRows) * 100 : 0
      const distinctPercentage = totalRows > 0 ? (distinctCount / totalRows) * 100 : 0

      const stats: ColumnStats = {
        column,
        dataType,
        statsType,
        totalRows,
        nullCount,
        nullPercentage,
        distinctCount,
        distinctPercentage
      }

      if (statsType === 'numeric') {
        const [numRows] = await connection.query(`
          SELECT
            MIN(${quotedCol}) AS min_val,
            MAX(${quotedCol}) AS max_val,
            AVG(${quotedCol}) AS avg_val,
            STDDEV(${quotedCol}) AS stddev_val
          FROM ${quotedTable}
          WHERE ${quotedCol} IS NOT NULL
        `)

        const numRow = (numRows as Array<Record<string, unknown>>)[0]
        stats.min = numRow?.min_val != null ? String(numRow.min_val) : null
        stats.max = numRow?.max_val != null ? String(numRow.max_val) : null
        stats.avg = numRow?.avg_val != null ? Number(numRow.avg_val) : null
        stats.stdDev = numRow?.stddev_val != null ? Number(numRow.stddev_val) : null

        if (totalRows > 0) {
          const [minMaxRows] = await connection.query(`
            SELECT MIN(${quotedCol}) AS min_val, MAX(${quotedCol}) AS max_val
            FROM ${quotedTable}
            WHERE ${quotedCol} IS NOT NULL
          `)
          const mmRow = (minMaxRows as Array<Record<string, unknown>>)[0]
          const minVal = Number(mmRow?.min_val)
          const maxVal = Number(mmRow?.max_val)

          if (!isNaN(minVal) && !isNaN(maxVal) && minVal < maxVal) {
            const bucketSize = (maxVal - minVal) / 10
            const cases = Array.from({ length: 10 }, (_, i) => {
              const lo = minVal + i * bucketSize
              const hi = minVal + (i + 1) * bucketSize
              const label = i + 1
              if (i === 9) {
                return `WHEN ${quotedCol} >= ${lo} THEN ${label}`
              }
              return `WHEN ${quotedCol} >= ${lo} AND ${quotedCol} < ${hi} THEN ${label}`
            }).join('\n              ')

            const [histRows] = await connection.query(`
              SELECT
                bucket,
                COUNT(*) AS cnt
              FROM (
                SELECT CASE
                  ${cases}
                  ELSE 1
                END AS bucket
                FROM ${quotedTable}
                WHERE ${quotedCol} IS NOT NULL
              ) t
              GROUP BY bucket
              ORDER BY bucket
            `)

            const histResult = histRows as Array<Record<string, unknown>>
            if (histResult.length > 0) {
              stats.histogram = histResult.map((row) => {
                const b = Number(row.bucket) - 1
                return {
                  min: minVal + b * bucketSize,
                  max: minVal + (b + 1) * bucketSize,
                  count: Number(row.cnt)
                }
              })
            }
          }
        }
      } else if (statsType === 'text') {
        const [textRows] = await connection.query(`
          SELECT
            MIN(CHAR_LENGTH(${quotedCol})) AS min_length,
            MAX(CHAR_LENGTH(${quotedCol})) AS max_length,
            AVG(CHAR_LENGTH(${quotedCol})) AS avg_length
          FROM ${quotedTable}
          WHERE ${quotedCol} IS NOT NULL
        `)

        const textRow = (textRows as Array<Record<string, unknown>>)[0]
        stats.minLength = textRow?.min_length != null ? Number(textRow.min_length) : null
        stats.maxLength = textRow?.max_length != null ? Number(textRow.max_length) : null
        stats.avgLength = textRow?.avg_length != null ? Number(textRow.avg_length) : null

        const [commonRows] = await connection.query(`
          SELECT
            ${quotedCol} AS val,
            COUNT(*) AS cnt,
            ROUND(COUNT(*) * 100.0 / ${totalRows}, 2) AS pct
          FROM ${quotedTable}
          WHERE ${quotedCol} IS NOT NULL
          GROUP BY ${quotedCol}
          ORDER BY cnt DESC
          LIMIT 5
        `)

        const commonResult = commonRows as Array<Record<string, unknown>>
        const commonValues: CommonValue[] = commonResult.map((row) => ({
          value: row.val != null ? String(row.val) : null,
          count: Number(row.cnt),
          percentage: Number(row.pct)
        }))
        stats.commonValues = commonValues
      } else if (statsType === 'datetime') {
        const [dtRows] = await connection.query(`
          SELECT
            MIN(${quotedCol}) AS min_val,
            MAX(${quotedCol}) AS max_val
          FROM ${quotedTable}
          WHERE ${quotedCol} IS NOT NULL
        `)

        const dtRow = (dtRows as Array<Record<string, unknown>>)[0]
        stats.min = dtRow?.min_val != null ? String(dtRow.min_val) : null
        stats.max = dtRow?.max_val != null ? String(dtRow.max_val) : null
      } else if (statsType === 'boolean') {
        const [boolRows] = await connection.query(`
          SELECT
            SUM(CASE WHEN ${quotedCol} = 1 THEN 1 ELSE 0 END) AS true_count,
            SUM(CASE WHEN ${quotedCol} = 0 THEN 1 ELSE 0 END) AS false_count
          FROM ${quotedTable}
        `)

        const boolRow = (boolRows as Array<Record<string, unknown>>)[0]
        stats.trueCount = Number(boolRow?.true_count ?? 0)
        stats.falseCount = Number(boolRow?.false_count ?? 0)
      }

      return stats
    } finally {
      if (connection) await connection.end().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  async getActiveQueries(config: ConnectionConfig): Promise<ActiveQuery[]> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    let connection: mysql.Connection | null = null

    try {
      connection = await mysql.createConnection(toMySQLConfig(config, tunnelOverrides))

      const [rows] = await connection.query(`
        SELECT
          ID AS pid,
          USER AS user,
          DB AS db,
          STATE AS state,
          TIME AS time_sec,
          INFO AS query,
          COMMAND AS command
        FROM information_schema.processlist
        WHERE COMMAND != 'Sleep'
          AND ID != CONNECTION_ID()
          AND INFO IS NOT NULL
        ORDER BY TIME DESC
      `)

      return (rows as Array<Record<string, unknown>>).map((row) => ({
        pid: Number(row.pid),
        user: String(row.user ?? ''),
        database: String(row.db ?? ''),
        state: String(row.state ?? row.command ?? ''),
        duration: `${Number(row.time_sec ?? 0)}s`,
        durationMs: Number(row.time_sec ?? 0) * 1000,
        query: String(row.query ?? '')
      }))
    } finally {
      if (connection) await connection.end().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  async getTableSizes(
    config: ConnectionConfig,
    schema?: string
  ): Promise<{ dbSize: DatabaseSizeInfo; tables: TableSizeInfo[] }> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    let connection: mysql.Connection | null = null

    try {
      connection = await mysql.createConnection(toMySQLConfig(config, tunnelOverrides))

      const dbName = schema || config.database || ''

      const [dbSizeRows] = await connection.query(
        `
        SELECT
          SUM(data_length + index_length) AS total_size_bytes
        FROM information_schema.tables
        WHERE table_schema = ?
        `,
        [dbName]
      )
      const dbRow = (dbSizeRows as Array<Record<string, unknown>>)[0]
      const totalSizeBytes = Number(dbRow?.total_size_bytes ?? 0)

      const dbSize: DatabaseSizeInfo = {
        totalSize: this.formatBytes(totalSizeBytes),
        totalSizeBytes
      }

      const [tableRows] = await connection.query(
        `
        SELECT
          table_schema AS table_schema,
          table_name AS table_name,
          table_rows AS row_count_estimate,
          data_length AS data_size_bytes,
          index_length AS index_size_bytes,
          data_length + index_length AS total_size_bytes
        FROM information_schema.tables
        WHERE table_schema = ?
          AND table_type = 'BASE TABLE'
        ORDER BY data_length + index_length DESC
        `,
        [dbName]
      )

      const tables: TableSizeInfo[] = (tableRows as Array<Record<string, unknown>>).map((row) => {
        const dataSizeBytes = Number(row.data_size_bytes ?? 0)
        const indexSizeBytes = Number(row.index_size_bytes ?? 0)
        const tSizeBytes = Number(row.total_size_bytes ?? 0)
        return {
          schema: String(row.table_schema ?? ''),
          table: String(row.table_name ?? ''),
          rowCountEstimate: Number(row.row_count_estimate ?? 0),
          dataSize: this.formatBytes(dataSizeBytes),
          dataSizeBytes,
          indexSize: this.formatBytes(indexSizeBytes),
          indexSizeBytes,
          totalSize: this.formatBytes(tSizeBytes),
          totalSizeBytes: tSizeBytes
        }
      })

      return { dbSize, tables }
    } finally {
      if (connection) await connection.end().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  async getCacheStats(config: ConnectionConfig): Promise<CacheStats> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    let connection: mysql.Connection | null = null

    try {
      connection = await mysql.createConnection(toMySQLConfig(config, tunnelOverrides))

      const [rows] = await connection.query(`
        SHOW STATUS LIKE 'Innodb_buffer_pool_read%'
      `)

      const statusMap = new Map<string, number>()
      for (const row of rows as Array<Record<string, unknown>>) {
        statusMap.set(String(row.Variable_name), Number(row.Value ?? 0))
      }

      const readRequests = statusMap.get('Innodb_buffer_pool_read_requests') ?? 0
      const reads = statusMap.get('Innodb_buffer_pool_reads') ?? 0
      const bufferCacheHitRatio =
        readRequests > 0 ? Math.round(((readRequests - reads) / readRequests) * 10000) / 100 : 0

      return {
        bufferCacheHitRatio,
        indexHitRatio: bufferCacheHitRatio
      }
    } finally {
      if (connection) await connection.end().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  async getLocks(config: ConnectionConfig): Promise<LockInfo[]> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    let connection: mysql.Connection | null = null

    try {
      connection = await mysql.createConnection(toMySQLConfig(config, tunnelOverrides))

      try {
        const [rows] = await connection.query(`
          SELECT
            r.REQUESTING_ENGINE_TRANSACTION_ID AS blocked_trx,
            r.BLOCKING_ENGINE_TRANSACTION_ID AS blocking_trx,
            w.PROCESSLIST_ID AS blocked_pid,
            w.PROCESSLIST_USER AS blocked_user,
            w.PROCESSLIST_INFO AS blocked_query,
            b.PROCESSLIST_ID AS blocking_pid,
            b.PROCESSLIST_USER AS blocking_user,
            b.PROCESSLIST_INFO AS blocking_query,
            r.LOCK_TYPE AS lock_type,
            CONCAT(r.OBJECT_SCHEMA, '.', r.OBJECT_NAME) AS relation,
            TIMESTAMPDIFF(SECOND, w.PROCESSLIST_TIME, 0) AS wait_sec
          FROM performance_schema.data_lock_waits r
          JOIN performance_schema.threads w_t ON w_t.THREAD_ID = r.REQUESTING_THREAD_ID
          JOIN performance_schema.processlist w ON w.ID = w_t.PROCESSLIST_ID
          JOIN performance_schema.threads b_t ON b_t.THREAD_ID = r.BLOCKING_THREAD_ID
          JOIN performance_schema.processlist b ON b.ID = b_t.PROCESSLIST_ID
        `)

        return (rows as Array<Record<string, unknown>>).map((row) => {
          const waitSec = Math.abs(Number(row.wait_sec ?? 0))
          return {
            blockedPid: Number(row.blocked_pid ?? 0),
            blockedUser: String(row.blocked_user ?? ''),
            blockedQuery: String(row.blocked_query ?? ''),
            blockingPid: Number(row.blocking_pid ?? 0),
            blockingUser: String(row.blocking_user ?? ''),
            blockingQuery: String(row.blocking_query ?? ''),
            lockType: String(row.lock_type ?? ''),
            relation: row.relation ? String(row.relation) : undefined,
            waitDuration: `${waitSec}s`,
            waitDurationMs: waitSec * 1000
          }
        })
      } catch {
        return []
      }
    } finally {
      if (connection) await connection.end().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  async killQuery(
    config: ConnectionConfig,
    pid: number
  ): Promise<{ success: boolean; error?: string }> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    let connection: mysql.Connection | null = null

    try {
      connection = await mysql.createConnection(toMySQLConfig(config, tunnelOverrides))
      await connection.query(`KILL QUERY ${Number(pid)}`)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    } finally {
      if (connection) await connection.end().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  async runSchemaIntel(
    config: ConnectionConfig,
    checks?: SchemaIntelCheckId[]
  ): Promise<SchemaIntelReport> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    let connection: mysql.Connection | null = null

    try {
      connection = await mysql.createConnection(toMySQLConfig(config, tunnelOverrides))
      return await runMysqlSchemaIntel(connection, config.database, checks)
    } finally {
      if (connection) await connection.end().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 bytes'
    const units = ['bytes', 'kB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
  }
}
