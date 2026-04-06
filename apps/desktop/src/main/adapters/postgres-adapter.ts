import { Client, type ClientConfig } from 'pg'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'
import {
  resolvePostgresType,
  type ConnectionConfig,
  type SchemaInfo,
  type TableInfo,
  type ColumnInfo,
  type QueryField,
  type ForeignKeyInfo,
  type TableDefinition,
  type ColumnDefinition,
  type ConstraintDefinition,
  type IndexDefinition,
  type SequenceInfo,
  type CustomTypeInfo,
  type StatementResult,
  type RoutineInfo,
  type RoutineParameterInfo,
  type ColumnStats,
  type ColumnStatsType,
  type HistogramBucket,
  type CommonValue,
  type ActiveQuery,
  type TableSizeInfo,
  type CacheStats,
  type LockInfo,
  type DatabaseSizeInfo
} from '@shared/index'
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

/** Split SQL into statements for PostgreSQL */
const splitPgStatements = (sql: string) => splitStatements(sql, 'postgresql')

/**
 * Parse a PostgreSQL array literal string like "{val1,val2}" into a JS array.
 * The pg driver sometimes returns array_agg results as raw strings instead of
 * parsed JS arrays (especially for name[] / _name type).
 */
function parsePostgresArray(value: unknown): string[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const inner = trimmed.slice(1, -1)
      if (inner === '') return []
      return inner.split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
    }
  }
  return []
}

/**
 * Build pg Client configuration from ConnectionConfig
 * Properly handles SSL options for cloud databases like AWS RDS
 *
 * @param overrides - Optional host/port overrides (e.g., from SSH tunnel)
 */
export function buildClientConfig(
  config: ConnectionConfig,
  overrides?: { host: string; port: number }
): ClientConfig {
  const clientConfig: ClientConfig = {
    host: overrides?.host ?? config.host,
    port: overrides?.port ?? config.port,
    database: config.database,
    user: config.user,
    password: config.password
  }

  if (config.ssl) {
    const sslOptions = config.sslOptions || {}

    if (sslOptions.rejectUnauthorized === false) {
      clientConfig.ssl = {
        rejectUnauthorized: false
      }
    } else if (sslOptions.ca) {
      try {
        clientConfig.ssl = {
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
      // Default to sslmode=require: encrypt the connection but don't verify
      // the server certificate. This matches psql's sslmode=require behavior
      // and works with cloud databases that use self-signed certificates.
      clientConfig.ssl = { rejectUnauthorized: false }
    }
  }

  return clientConfig
}

/**
 * Check if a SQL statement is data-returning (SELECT, RETURNING, etc.)
 */
function isDataReturningStatement(sql: string): boolean {
  const normalized = sql.trim().toUpperCase()
  // SELECT statements return data
  if (normalized.startsWith('SELECT')) return true
  // WITH ... SELECT (CTEs)
  if (normalized.startsWith('WITH') && normalized.includes('SELECT')) return true
  // TABLE statement
  if (normalized.startsWith('TABLE')) return true
  // VALUES statement
  if (normalized.startsWith('VALUES')) return true
  // RETURNING clause in INSERT/UPDATE/DELETE
  if (normalized.includes('RETURNING')) return true
  // SHOW commands
  if (normalized.startsWith('SHOW')) return true
  // EXPLAIN
  if (normalized.startsWith('EXPLAIN')) return true
  return false
}

/**
 * PostgreSQL database adapter
 */
export class PostgresAdapter implements DatabaseAdapter {
  readonly dbType = 'postgresql' as const

  async connect(config: ConnectionConfig): Promise<void> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }

    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    const client = new Client(buildClientConfig(config, tunnelOverrides))
    try {
      await client.connect()
      await client.end()
    } catch (error) {
      await client.end().catch(() => {})
      throw error
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
    const client = new Client(buildClientConfig(config, tunnelOverrides))

    try {
      await client.connect()
      const res = await client.query(sql)

      const fields: QueryField[] = res.fields.map((f) => ({
        name: f.name,
        dataType: resolvePostgresType(f.dataTypeID),
        dataTypeID: f.dataTypeID
      }))

      return {
        rows: res.rows,
        fields,
        rowCount: res.rowCount
      }
    } finally {
      await client.end().catch(() => {})
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
    const client = new Client(buildClientConfig(config, tunnelOverrides))

    try {
      if (collectTelemetry) {
        telemetryCollector.endPhase(executionId, TELEMETRY_PHASES.TCP_HANDSHAKE)
        telemetryCollector.startPhase(executionId, TELEMETRY_PHASES.DB_HANDSHAKE)
      }

      await client.connect()

      if (collectTelemetry) {
        telemetryCollector.endPhase(executionId, TELEMETRY_PHASES.DB_HANDSHAKE)
      }

      // Set query timeout if specified (0 = no timeout)
      const queryTimeoutMs = options?.queryTimeoutMs
      if (
        typeof queryTimeoutMs === 'number' &&
        Number.isFinite(queryTimeoutMs) &&
        queryTimeoutMs > 0
      ) {
        await client.query('SELECT set_config($1, $2, false)', [
          'statement_timeout',
          `${Math.floor(queryTimeoutMs)}ms`
        ])
      }

      // Register for cancellation support
      if (options?.executionId) {
        registerQuery(options.executionId, { type: 'postgresql', client })
      }

      const totalStart = Date.now()
      const results: StatementResult[] = []
      let totalRowCount = 0

      const statements = splitPgStatements(sql)

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i]
        const stmtStart = Date.now()

        try {
          // Start execution phase timing
          if (collectTelemetry) {
            telemetryCollector.startPhase(executionId, TELEMETRY_PHASES.EXECUTION)
          }

          const res = await client.query(statement)

          if (collectTelemetry) {
            telemetryCollector.endPhase(executionId, TELEMETRY_PHASES.EXECUTION)
            telemetryCollector.startPhase(executionId, TELEMETRY_PHASES.PARSE)
          }

          const stmtDuration = Date.now() - stmtStart

          const fields: QueryField[] = (res.fields || []).map((f) => ({
            name: f.name,
            dataType: resolvePostgresType(f.dataTypeID),
            dataTypeID: f.dataTypeID
          }))

          const isDataReturning = isDataReturningStatement(statement)
          const rowCount = res.rowCount ?? res.rows?.length ?? 0
          totalRowCount += rowCount

          results.push({
            statement,
            statementIndex: i,
            rows: res.rows || [],
            fields,
            rowCount,
            durationMs: stmtDuration,
            isDataReturning
          })

          if (collectTelemetry) {
            telemetryCollector.endPhase(executionId, TELEMETRY_PHASES.PARSE)
          }
        } catch (error) {
          // If a statement fails, add an error result and stop execution
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

          // Re-throw to stop execution of remaining statements
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
      await client.end().catch(() => {})
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
    const client = new Client(buildClientConfig(config, tunnelOverrides))
    try {
      await client.connect()
      const res = await client.query(sql, params)
      return { rowCount: res.rowCount }
    } finally {
      await client.end().catch(() => {})
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
    const client = new Client(buildClientConfig(config, tunnelOverrides))
    try {
      await client.connect()
      await client.query('BEGIN')

      const results: Array<{ rowCount: number | null }> = []
      let rowsAffected = 0

      for (const stmt of statements) {
        const res = await client.query(stmt.sql, stmt.params)
        results.push({ rowCount: res.rowCount })
        rowsAffected += res.rowCount ?? 0
      }

      await client.query('COMMIT')
      return { rowsAffected, results }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      await client.end().catch(() => {})
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
    const client = new Client(buildClientConfig(config, tunnelOverrides))
    try {
      await client.connect()
      // Query 1: Get all schemas (excluding system schemas)
      const schemasResult = await client.query(`
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND schema_name NOT LIKE 'pg_toast_temp_%'
          AND schema_name NOT LIKE 'pg_temp_%'
        ORDER BY schema_name
      `)

      // Query 2: Get all tables and views
      const tablesResult = await client.query(`
        SELECT
          table_schema,
          table_name,
          table_type
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND table_schema NOT LIKE 'pg_toast_temp_%'
          AND table_schema NOT LIKE 'pg_temp_%'
        ORDER BY table_schema, table_name
      `)

      // Query 2b: Get all materialized views (not included in information_schema.tables)
      const matViewsResult = await client.query(`
        SELECT
          schemaname as table_schema,
          matviewname as table_name,
          'MATERIALIZED VIEW' as table_type
        FROM pg_matviews
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND schemaname NOT LIKE 'pg_toast_temp_%'
          AND schemaname NOT LIKE 'pg_temp_%'
        ORDER BY schemaname, matviewname
      `)

      // Query 3: Get all columns with primary key info
      const columnsResult = await client.query(`
        SELECT
          c.table_schema,
          c.table_name,
          c.column_name,
          c.data_type,
          c.udt_name,
          c.is_nullable,
          c.column_default,
          c.ordinal_position,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale,
          CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT
            kcu.table_schema,
            kcu.table_name,
            kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
        ) pk ON c.table_schema = pk.table_schema
          AND c.table_name = pk.table_name
          AND c.column_name = pk.column_name
        WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND c.table_schema NOT LIKE 'pg_toast_temp_%'
          AND c.table_schema NOT LIKE 'pg_temp_%'
        ORDER BY c.table_schema, c.table_name, c.ordinal_position
      `)

      // Query 3b: Get columns for materialized views (from pg_attribute)
      const matViewColumnsResult = await client.query(`
        SELECT
          n.nspname as table_schema,
          c.relname as table_name,
          a.attname as column_name,
          pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
          t.typname as udt_name,
          NOT a.attnotnull as is_nullable,
          pg_get_expr(d.adbin, d.adrelid) as column_default,
          a.attnum as ordinal_position,
          false as is_primary_key
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
        JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
        JOIN pg_catalog.pg_type t ON a.atttypid = t.oid
        LEFT JOIN pg_catalog.pg_attrdef d ON (a.attrelid, a.attnum) = (d.adrelid, d.adnum)
        WHERE c.relkind = 'm'  -- 'm' = materialized view
          AND a.attnum > 0
          AND NOT a.attisdropped
          AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND n.nspname NOT LIKE 'pg_toast_temp_%'
          AND n.nspname NOT LIKE 'pg_temp_%'
        ORDER BY n.nspname, c.relname, a.attnum
      `)

      // Query 4: Get all foreign key relationships
      const foreignKeysResult = await client.query(`
        SELECT
          tc.table_schema,
          tc.table_name,
          kcu.column_name,
          tc.constraint_name,
          ccu.table_schema AS referenced_schema,
          ccu.table_name AS referenced_table,
          ccu.column_name AS referenced_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND tc.table_schema NOT LIKE 'pg_toast_temp_%'
          AND tc.table_schema NOT LIKE 'pg_temp_%'
        ORDER BY tc.table_schema, tc.table_name, kcu.column_name
      `)

      // Query 4b: Get enum types with their values
      const enumTypesResult = await client.query(`
        SELECT
          n.nspname as schema,
          t.typname as name,
          array_agg(e.enumlabel ORDER BY e.enumsortorder) as values
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        GROUP BY n.nspname, t.typname
      `)

      // Query 5: Get all routines (functions and procedures)
      const routinesResult = await client.query(`
        SELECT
          r.routine_schema,
          r.routine_name,
          r.routine_type,
          r.data_type as return_type,
          r.external_language as language,
          p.provolatile as volatility,
          d.description as comment,
          r.specific_name
        FROM information_schema.routines r
        LEFT JOIN pg_catalog.pg_proc p
          ON p.proname = r.routine_name
        LEFT JOIN pg_catalog.pg_namespace n
          ON n.nspname = r.routine_schema
          AND p.pronamespace = n.oid
        LEFT JOIN pg_catalog.pg_description d
          ON d.objoid = p.oid
        WHERE r.routine_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND r.routine_schema NOT LIKE 'pg_toast_temp_%'
          AND r.routine_schema NOT LIKE 'pg_temp_%'
        ORDER BY r.routine_schema, r.routine_name
      `)

      // Query 6: Get routine parameters
      const parametersResult = await client.query(`
        SELECT
          p.specific_schema,
          p.specific_name,
          p.parameter_name,
          p.data_type,
          p.parameter_mode,
          p.parameter_default,
          p.ordinal_position
        FROM information_schema.parameters p
        WHERE p.specific_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND p.specific_schema NOT LIKE 'pg_toast_temp_%'
          AND p.specific_schema NOT LIKE 'pg_temp_%'
          AND p.parameter_name IS NOT NULL
        ORDER BY p.specific_schema, p.specific_name, p.ordinal_position
      `)

      // Build foreign key lookup map: "schema.table.column" -> ForeignKeyInfo
      const fkMap = new Map<string, ForeignKeyInfo>()
      for (const row of foreignKeysResult.rows) {
        const key = `${row.table_schema}.${row.table_name}.${row.column_name}`
        fkMap.set(key, {
          constraintName: row.constraint_name,
          referencedSchema: row.referenced_schema,
          referencedTable: row.referenced_table,
          referencedColumn: row.referenced_column
        })
      }

      // Build enum lookup map: "typname" -> string[] (enum values)
      // Also map "schema.typname" -> string[] for schema-qualified lookups
      const enumMap = new Map<string, string[]>()
      for (const row of enumTypesResult.rows) {
        const values = parsePostgresArray(row.values)
        enumMap.set(row.name, values)
        enumMap.set(`${row.schema}.${row.name}`, values)
      }

      // Build parameters lookup map: "schema.specific_name" -> RoutineParameterInfo[]
      const paramsMap = new Map<string, RoutineParameterInfo[]>()
      for (const row of parametersResult.rows) {
        const key = `${row.specific_schema}.${row.specific_name}`
        if (!paramsMap.has(key)) {
          paramsMap.set(key, [])
        }
        paramsMap.get(key)!.push({
          name: row.parameter_name || '',
          dataType: row.data_type,
          mode: (row.parameter_mode?.toUpperCase() || 'IN') as 'IN' | 'OUT' | 'INOUT',
          defaultValue: row.parameter_default || undefined,
          ordinalPosition: row.ordinal_position
        })
      }

      // Build routines lookup map: "schema" -> RoutineInfo[]
      const routinesMap = new Map<string, RoutineInfo[]>()
      for (const row of routinesResult.rows) {
        if (!routinesMap.has(row.routine_schema)) {
          routinesMap.set(row.routine_schema, [])
        }
        const paramsKey = `${row.routine_schema}.${row.specific_name}`
        const params = paramsMap.get(paramsKey) || []

        // Map PostgreSQL volatility codes to readable values
        let volatility: 'IMMUTABLE' | 'STABLE' | 'VOLATILE' | undefined
        if (row.volatility === 'i') volatility = 'IMMUTABLE'
        else if (row.volatility === 's') volatility = 'STABLE'
        else if (row.volatility === 'v') volatility = 'VOLATILE'

        routinesMap.get(row.routine_schema)!.push({
          name: row.routine_name,
          type: row.routine_type === 'PROCEDURE' ? 'procedure' : 'function',
          returnType: row.return_type || undefined,
          parameters: params,
          language: row.language || undefined,
          volatility,
          comment: row.comment || undefined
        })
      }

      // Build schema structure
      const schemaMap = new Map<string, SchemaInfo>()

      // Initialize schemas
      for (const row of schemasResult.rows) {
        schemaMap.set(row.schema_name, {
          name: row.schema_name,
          tables: [],
          routines: routinesMap.get(row.schema_name) || []
        })
      }

      // Build tables map for easy column assignment
      const tableMap = new Map<string, TableInfo>()
      for (const row of tablesResult.rows) {
        const tableKey = `${row.table_schema}.${row.table_name}`
        const table: TableInfo = {
          name: row.table_name,
          type: row.table_type === 'VIEW' ? 'view' : 'table',
          columns: []
        }
        tableMap.set(tableKey, table)

        // Add table to its schema
        const schema = schemaMap.get(row.table_schema)
        if (schema) {
          schema.tables.push(table)
        }
      }

      // Add materialized views to the tables map
      for (const row of matViewsResult.rows) {
        const tableKey = `${row.table_schema}.${row.table_name}`
        const table: TableInfo = {
          name: row.table_name,
          type: 'materialized_view',
          columns: []
        }
        tableMap.set(tableKey, table)

        // Add to schema (create schema if it doesn't exist)
        let schema = schemaMap.get(row.table_schema)
        if (!schema) {
          schema = {
            name: row.table_schema,
            tables: [],
            routines: []
          }
          schemaMap.set(row.table_schema, schema)
        }
        schema.tables.push(table)
      }

      // Assign columns to tables
      for (const row of columnsResult.rows) {
        const tableKey = `${row.table_schema}.${row.table_name}`
        const table = tableMap.get(tableKey)
        if (table) {
          // Format data type nicely
          let dataType = row.udt_name
          if (row.character_maximum_length) {
            dataType = `${row.udt_name}(${row.character_maximum_length})`
          } else if (row.numeric_precision && row.numeric_scale) {
            dataType = `${row.udt_name}(${row.numeric_precision},${row.numeric_scale})`
          }

          // Check for foreign key relationship
          const fkKey = `${row.table_schema}.${row.table_name}.${row.column_name}`
          const foreignKey = fkMap.get(fkKey)

          // Check for enum type (USER-DEFINED data_type indicates enum/composite)
          // Look up enum values by the base udt_name
          const rawEnumValues = enumMap.get(row.udt_name)
          const enumValues = Array.isArray(rawEnumValues) ? rawEnumValues : undefined

          const column: ColumnInfo = {
            name: row.column_name,
            dataType,
            isNullable: row.is_nullable === 'YES',
            isPrimaryKey: row.is_primary_key,
            defaultValue: row.column_default || undefined,
            ordinalPosition: row.ordinal_position,
            foreignKey,
            enumValues
          }
          table.columns.push(column)
        }
      }

      // Assign columns to materialized views
      for (const row of matViewColumnsResult.rows) {
        const tableKey = `${row.table_schema}.${row.table_name}`
        const table = tableMap.get(tableKey)
        if (table) {
          const column: ColumnInfo = {
            name: row.column_name,
            dataType: row.data_type,
            isNullable: row.is_nullable === true,
            isPrimaryKey: false, // Materialized views don't have primary keys
            defaultValue: row.column_default || undefined,
            ordinalPosition: row.ordinal_position
          }
          table.columns.push(column)
        }
      }

      return Array.from(schemaMap.values())
    } finally {
      await client.end().catch(() => {})
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
    const client = new Client(buildClientConfig(config, tunnelOverrides))
    try {
      await client.connect()
      const explainOptions = analyze
        ? 'ANALYZE, COSTS, VERBOSE, BUFFERS, FORMAT JSON'
        : 'COSTS, VERBOSE, FORMAT JSON'
      const explainQuery = `EXPLAIN (${explainOptions}) ${sql}`

      const start = Date.now()
      const res = await client.query(explainQuery)
      const duration = Date.now() - start

      const planJson = res.rows[0]?.['QUERY PLAN']

      return {
        plan: planJson,
        durationMs: duration
      }
    } finally {
      await client.end().catch(() => {})
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
    const client = new Client(buildClientConfig(config, tunnelOverrides))
    try {
      await client.connect()
      // Query columns with full metadata
      const columnsResult = await client.query(
        `
        SELECT
          c.column_name,
          c.data_type,
          c.udt_name,
          c.is_nullable,
          c.column_default,
          c.ordinal_position,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale,
          c.collation_name,
          CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
          col_description(
            (quote_ident($1) || '.' || quote_ident($2))::regclass,
            c.ordinal_position
          ) as column_comment
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = $1
            AND tc.table_name = $2
        ) pk ON c.column_name = pk.column_name
        WHERE c.table_schema = $1 AND c.table_name = $2
        ORDER BY c.ordinal_position
      `,
        [schema, table]
      )

      // Query constraints
      const constraintsResult = await client.query(
        `
        SELECT
          tc.constraint_name,
          tc.constraint_type,
          kcu.column_name,
          ccu.table_schema AS ref_schema,
          ccu.table_name AS ref_table,
          ccu.column_name AS ref_column,
          rc.update_rule,
          rc.delete_rule,
          cc.check_clause
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        LEFT JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
          AND tc.constraint_type = 'FOREIGN KEY'
        LEFT JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
        LEFT JOIN information_schema.check_constraints cc
          ON tc.constraint_name = cc.constraint_name
        WHERE tc.table_schema = $1 AND tc.table_name = $2
        ORDER BY tc.constraint_name, kcu.ordinal_position
      `,
        [schema, table]
      )

      // Query indexes - including expression indexes
      const indexesResult = await client.query(
        `
        SELECT
          i.relname as index_name,
          ix.indisunique as is_unique,
          am.amname as index_method,
          array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) FILTER (WHERE a.attname IS NOT NULL) as columns,
          pg_get_expr(ix.indpred, ix.indrelid) as where_clause,
          pg_get_indexdef(i.oid) as index_definition,
          ix.indexprs IS NOT NULL as is_expression_index
        FROM pg_index ix
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_am am ON am.oid = i.relam
        LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey) AND a.attnum > 0
        WHERE n.nspname = $1 AND t.relname = $2
          AND NOT ix.indisprimary  -- Exclude primary key index
        GROUP BY i.relname, ix.indisunique, am.amname, ix.indpred, ix.indrelid, i.oid, ix.indexprs
      `,
        [schema, table]
      )

      // Query table comment
      const tableCommentResult = await client.query(
        `
        SELECT obj_description(
          (quote_ident($1) || '.' || quote_ident($2))::regclass
        ) as comment
      `,
        [schema, table]
      )

      // Build TableDefinition
      const columns: ColumnDefinition[] = columnsResult.rows.map((row, idx) => ({
        id: `col-${idx}`,
        name: row.column_name,
        dataType: row.udt_name,
        length: row.character_maximum_length || undefined,
        precision: row.numeric_precision || undefined,
        scale: row.numeric_scale || undefined,
        isNullable: row.is_nullable === 'YES',
        isPrimaryKey: row.is_primary_key,
        isUnique: false, // Will be set from constraints
        defaultValue: row.column_default || undefined,
        comment: row.column_comment || undefined,
        collation: row.collation_name || undefined
      }))

      // Build constraints from query results
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
          checkExpression?: string
        }
      >()

      for (const row of constraintsResult.rows) {
        const key = row.constraint_name
        if (!constraintMap.has(key)) {
          constraintMap.set(key, {
            type: row.constraint_type,
            columns: [],
            refSchema: row.ref_schema,
            refTable: row.ref_table,
            refColumns: [],
            onUpdate: row.update_rule,
            onDelete: row.delete_rule,
            checkExpression: row.check_clause
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
        // Skip primary key (handled at column level)
        if (data.type === 'PRIMARY KEY') continue

        const constraintDef: ConstraintDefinition = {
          id: `constraint-${constraintIdx++}`,
          name,
          type:
            data.type === 'FOREIGN KEY'
              ? 'foreign_key'
              : data.type === 'UNIQUE'
                ? 'unique'
                : data.type === 'CHECK'
                  ? 'check'
                  : 'unique',
          columns: data.columns
        }

        if (data.type === 'FOREIGN KEY') {
          constraintDef.referencedSchema = data.refSchema
          constraintDef.referencedTable = data.refTable
          constraintDef.referencedColumns = data.refColumns
          constraintDef.onUpdate = data.onUpdate as ConstraintDefinition['onUpdate']
          constraintDef.onDelete = data.onDelete as ConstraintDefinition['onDelete']
        }

        if (data.type === 'CHECK') {
          constraintDef.checkExpression = data.checkExpression
        }

        // Mark columns as unique for UNIQUE constraints
        if (data.type === 'UNIQUE' && data.columns.length === 1) {
          const col = columns.find((c) => c.name === data.columns[0])
          if (col) col.isUnique = true
        }

        constraints.push(constraintDef)
      }

      // Build indexes
      const indexes: IndexDefinition[] = indexesResult.rows.map((row, idx) => {
        // Handle columns array - could be null, undefined, or not an array in some cases
        let columnsArray = Array.isArray(row.columns)
          ? row.columns.filter((c: string | null) => c !== null)
          : []

        // For expression indexes, extract the expression from the index definition
        // Format: CREATE INDEX name ON table USING method (expression)
        if (columnsArray.length === 0 && row.is_expression_index && row.index_definition) {
          const match = row.index_definition.match(/USING\s+\w+\s+\((.+)\)(?:\s+WHERE|\s*$)/i)
          if (match) {
            // Use the expression as a single "column"
            columnsArray = [match[1].trim()]
          }
        }

        return {
          id: `index-${idx}`,
          name: row.index_name,
          columns: columnsArray.map((c: string) => ({ name: c })),
          isUnique: row.is_unique,
          method: row.index_method as IndexDefinition['method'],
          where: row.where_clause || undefined
        }
      })

      return {
        schema,
        name: table,
        columns,
        constraints,
        indexes,
        comment: tableCommentResult.rows[0]?.comment || undefined
      }
    } finally {
      await client.end().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  async getSequences(config: ConnectionConfig): Promise<SequenceInfo[]> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    const client = new Client(buildClientConfig(config, tunnelOverrides))
    try {
      await client.connect()
      const result = await client.query(`
        SELECT
          schemaname as schema,
          sequencename as name,
          data_type,
          start_value::text,
          increment_by::text as increment
        FROM pg_sequences
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY schemaname, sequencename
      `)

      return result.rows.map((row) => ({
        schema: row.schema,
        name: row.name,
        dataType: row.data_type,
        startValue: row.start_value,
        increment: row.increment
      }))
    } finally {
      await client.end().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  async getTypes(config: ConnectionConfig): Promise<CustomTypeInfo[]> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    const client = new Client(buildClientConfig(config, tunnelOverrides))
    try {
      await client.connect()
      // Get enum types with their values
      const enumsResult = await client.query(`
        SELECT
          n.nspname as schema,
          t.typname as name,
          'enum' as type_category,
          array_agg(e.enumlabel ORDER BY e.enumsortorder) as values
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        GROUP BY n.nspname, t.typname
        ORDER BY n.nspname, t.typname
      `)

      // Get domain types
      const domainsResult = await client.query(`
        SELECT
          n.nspname as schema,
          t.typname as name,
          'domain' as type_category
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typtype = 'd'
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY n.nspname, t.typname
      `)

      return [
        ...enumsResult.rows.map((row) => ({
          schema: row.schema,
          name: row.name,
          type: 'enum' as const,
          values: Array.isArray(row.values) ? row.values : parsePostgresArray(row.values)
        })),
        ...domainsResult.rows.map((row) => ({
          schema: row.schema,
          name: row.name,
          type: 'domain' as const
        }))
      ]
    } finally {
      await client.end().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  private classifyColumnType(dataType: string): ColumnStatsType {
    const lower = dataType.toLowerCase()
    if (
      lower.includes('int') ||
      lower.includes('numeric') ||
      lower.includes('decimal') ||
      lower.includes('float') ||
      lower.includes('double') ||
      lower.includes('real') ||
      lower.includes('money') ||
      lower === 'bigint' ||
      lower === 'smallint' ||
      lower === 'number'
    ) {
      return 'numeric'
    }
    if (
      lower.includes('timestamp') ||
      lower.includes('date') ||
      lower.includes('time') ||
      lower === 'interval'
    ) {
      return 'datetime'
    }
    if (lower === 'bool' || lower === 'boolean') {
      return 'boolean'
    }
    if (
      lower.includes('char') ||
      lower.includes('text') ||
      lower.includes('varchar') ||
      lower.includes('string') ||
      lower === 'name' ||
      lower === 'citext'
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
    const client = new Client(buildClientConfig(config, tunnelOverrides))

    try {
      await client.connect()

      const statsType = this.classifyColumnType(dataType)
      const quoteIdent = (name: string) => '"' + name.replace(/"/g, '""') + '"'
      const quotedTable = `${quoteIdent(schema)}.${quoteIdent(table)}`
      const quotedCol = quoteIdent(column)

      const baseResult = await client.query(`
        SELECT
          COUNT(*) AS total_rows,
          COUNT(*) - COUNT(${quotedCol}) AS null_count,
          COUNT(DISTINCT ${quotedCol}) AS distinct_count
        FROM ${quotedTable}
      `)

      const totalRows = Number(baseResult.rows[0].total_rows)
      const nullCount = Number(baseResult.rows[0].null_count)
      const distinctCount = Number(baseResult.rows[0].distinct_count)
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
        const numResult = await client.query(`
          SELECT
            MIN(${quotedCol})::text AS min_val,
            MAX(${quotedCol})::text AS max_val,
            AVG(${quotedCol}::numeric) AS avg_val,
            STDDEV(${quotedCol}::numeric) AS stddev_val
          FROM ${quotedTable}
          WHERE ${quotedCol} IS NOT NULL
        `)

        stats.min = numResult.rows[0]?.min_val ?? null
        stats.max = numResult.rows[0]?.max_val ?? null
        stats.avg = numResult.rows[0]?.avg_val != null ? Number(numResult.rows[0].avg_val) : null
        stats.stdDev =
          numResult.rows[0]?.stddev_val != null ? Number(numResult.rows[0].stddev_val) : null

        if (totalRows <= 1_000_000 && totalRows > 0) {
          const medianResult = await client.query(`
            SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ${quotedCol}::numeric) AS median_val
            FROM ${quotedTable}
            WHERE ${quotedCol} IS NOT NULL
          `)
          stats.median =
            medianResult.rows[0]?.median_val != null
              ? Number(medianResult.rows[0].median_val)
              : null

          const histResult = await client.query(`
            WITH bounds AS (
              SELECT MIN(${quotedCol}::numeric) AS min_val, MAX(${quotedCol}::numeric) AS max_val
              FROM ${quotedTable}
              WHERE ${quotedCol} IS NOT NULL
            ),
            bucketed AS (
              SELECT
                width_bucket(${quotedCol}::numeric, bounds.min_val, bounds.max_val + 1, 10) AS bucket,
                COUNT(*) AS cnt
              FROM ${quotedTable}, bounds
              WHERE ${quotedCol} IS NOT NULL
                AND bounds.min_val IS NOT NULL
                AND bounds.max_val IS NOT NULL
                AND bounds.min_val < bounds.max_val
              GROUP BY bucket
            )
            SELECT
              bucket,
              cnt,
              bounds.min_val + (bucket - 1) * (bounds.max_val - bounds.min_val) / 10.0 AS range_min,
              bounds.min_val + bucket * (bounds.max_val - bounds.min_val) / 10.0 AS range_max
            FROM bucketed, bounds
            ORDER BY bucket
          `)

          if (histResult.rows.length > 0) {
            const histogram: HistogramBucket[] = histResult.rows.map((row) => ({
              min: Number(row.range_min),
              max: Number(row.range_max),
              count: Number(row.cnt)
            }))
            stats.histogram = histogram
          }
        }
      } else if (statsType === 'text') {
        const textResult = await client.query(`
          SELECT
            MIN(LENGTH(${quotedCol}::text)) AS min_length,
            MAX(LENGTH(${quotedCol}::text)) AS max_length,
            AVG(LENGTH(${quotedCol}::text)) AS avg_length
          FROM ${quotedTable}
          WHERE ${quotedCol} IS NOT NULL
        `)

        stats.minLength =
          textResult.rows[0]?.min_length != null ? Number(textResult.rows[0].min_length) : null
        stats.maxLength =
          textResult.rows[0]?.max_length != null ? Number(textResult.rows[0].max_length) : null
        stats.avgLength =
          textResult.rows[0]?.avg_length != null ? Number(textResult.rows[0].avg_length) : null

        const commonResult = await client.query(`
          SELECT
            ${quotedCol}::text AS val,
            COUNT(*) AS cnt,
            ROUND(COUNT(*) * 100.0 / ${totalRows}, 2) AS pct
          FROM ${quotedTable}
          WHERE ${quotedCol} IS NOT NULL
          GROUP BY ${quotedCol}
          ORDER BY cnt DESC
          LIMIT 5
        `)

        const commonValues: CommonValue[] = commonResult.rows.map((row) => ({
          value: row.val,
          count: Number(row.cnt),
          percentage: Number(row.pct)
        }))
        stats.commonValues = commonValues
      } else if (statsType === 'datetime') {
        const dtResult = await client.query(`
          SELECT
            MIN(${quotedCol})::text AS min_val,
            MAX(${quotedCol})::text AS max_val
          FROM ${quotedTable}
          WHERE ${quotedCol} IS NOT NULL
        `)

        stats.min = dtResult.rows[0]?.min_val ?? null
        stats.max = dtResult.rows[0]?.max_val ?? null
      } else if (statsType === 'boolean') {
        const boolResult = await client.query(`
          SELECT
            COUNT(*) FILTER (WHERE ${quotedCol} = true) AS true_count,
            COUNT(*) FILTER (WHERE ${quotedCol} = false) AS false_count
          FROM ${quotedTable}
        `)

        stats.trueCount = Number(boolResult.rows[0]?.true_count ?? 0)
        stats.falseCount = Number(boolResult.rows[0]?.false_count ?? 0)
      }

      return stats
    } finally {
      await client.end().catch(() => {})
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
    const client = new Client(buildClientConfig(config, tunnelOverrides))

    try {
      await client.connect()

      const result = await client.query(`
        SELECT
          pid,
          usename AS user,
          datname AS database,
          state,
          COALESCE(
            EXTRACT(EPOCH FROM (now() - query_start))::text || 's',
            '0s'
          ) AS duration,
          COALESCE(EXTRACT(EPOCH FROM (now() - query_start)) * 1000, 0)::bigint AS duration_ms,
          query,
          wait_event_type || ':' || wait_event AS wait_event,
          application_name
        FROM pg_stat_activity
        WHERE state != 'idle'
          AND pid != pg_backend_pid()
          AND query NOT LIKE '%pg_stat_activity%'
        ORDER BY query_start ASC NULLS LAST
      `)

      return result.rows.map((row) => ({
        pid: Number(row.pid),
        user: String(row.user ?? ''),
        database: String(row.database ?? ''),
        state: String(row.state ?? ''),
        duration: String(row.duration ?? '0s'),
        durationMs: Number(row.duration_ms ?? 0),
        query: String(row.query ?? ''),
        waitEvent: row.wait_event ? String(row.wait_event) : undefined,
        applicationName: row.application_name ? String(row.application_name) : undefined
      }))
    } finally {
      await client.end().catch(() => {})
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
    const client = new Client(buildClientConfig(config, tunnelOverrides))

    try {
      await client.connect()

      const dbSizeResult = await client.query(`
        SELECT
          pg_size_pretty(pg_database_size(current_database())) AS total_size,
          pg_database_size(current_database()) AS total_size_bytes
      `)

      const dbSize: DatabaseSizeInfo = {
        totalSize: String(dbSizeResult.rows[0].total_size),
        totalSizeBytes: Number(dbSizeResult.rows[0].total_size_bytes)
      }

      const schemaFilter = schema
        ? `AND s.schemaname = $1`
        : `AND s.schemaname NOT IN ('pg_catalog', 'information_schema')`
      const params = schema ? [schema] : []

      const tablesResult = await client.query(
        `
        SELECT
          schema, "table", row_count_estimate,
          pg_size_pretty(data_size_bytes) AS data_size,
          data_size_bytes,
          pg_size_pretty(index_size_bytes) AS index_size,
          index_size_bytes,
          pg_size_pretty(total_size_bytes) AS total_size,
          total_size_bytes
        FROM (
          SELECT
            s.schemaname AS schema,
            s.relname AS "table",
            s.n_live_tup AS row_count_estimate,
            pg_relation_size(c.oid) AS data_size_bytes,
            pg_indexes_size(c.oid) AS index_size_bytes,
            pg_total_relation_size(c.oid) AS total_size_bytes
          FROM pg_stat_user_tables s
          JOIN pg_class c ON c.relname = s.relname
          JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = s.schemaname
          WHERE 1=1 ${schemaFilter}
        ) t
        ORDER BY total_size_bytes DESC
        LIMIT 50
        `,
        params
      )

      const tables: TableSizeInfo[] = tablesResult.rows.map((row) => ({
        schema: String(row.schema),
        table: String(row.table),
        rowCountEstimate: Number(row.row_count_estimate ?? 0),
        dataSize: String(row.data_size),
        dataSizeBytes: Number(row.data_size_bytes ?? 0),
        indexSize: String(row.index_size),
        indexSizeBytes: Number(row.index_size_bytes ?? 0),
        totalSize: String(row.total_size),
        totalSizeBytes: Number(row.total_size_bytes ?? 0)
      }))

      return { dbSize, tables }
    } finally {
      await client.end().catch(() => {})
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
    const client = new Client(buildClientConfig(config, tunnelOverrides))

    try {
      await client.connect()

      const cacheResult = await client.query(`
        SELECT
          CASE WHEN SUM(heap_blks_hit) + SUM(heap_blks_read) = 0 THEN 0
            ELSE ROUND(SUM(heap_blks_hit)::numeric / (SUM(heap_blks_hit) + SUM(heap_blks_read)) * 100, 2)
          END AS buffer_cache_hit_ratio,
          CASE WHEN SUM(idx_blks_hit) + SUM(idx_blks_read) = 0 THEN 0
            ELSE ROUND(SUM(idx_blks_hit)::numeric / (SUM(idx_blks_hit) + SUM(idx_blks_read)) * 100, 2)
          END AS index_hit_ratio
        FROM pg_statio_user_tables
      `)

      const tableDetailsResult = await client.query(`
        SELECT
          sio.schemaname || '.' || sio.relname AS table,
          CASE WHEN sio.heap_blks_hit + sio.heap_blks_read = 0 THEN 0
            ELSE ROUND(sio.heap_blks_hit::numeric / (sio.heap_blks_hit + sio.heap_blks_read) * 100, 2)
          END AS hit_ratio,
          COALESCE(st.seq_scan, 0) AS seq_scans,
          COALESCE(st.idx_scan, 0) AS index_scans
        FROM pg_statio_user_tables sio
        JOIN pg_stat_user_tables st ON sio.relid = st.relid
        WHERE sio.heap_blks_hit + sio.heap_blks_read > 0
        ORDER BY sio.heap_blks_hit + sio.heap_blks_read DESC
        LIMIT 20
      `)

      return {
        bufferCacheHitRatio: Number(cacheResult.rows[0]?.buffer_cache_hit_ratio ?? 0),
        indexHitRatio: Number(cacheResult.rows[0]?.index_hit_ratio ?? 0),
        tableCacheDetails: tableDetailsResult.rows.map((row) => ({
          table: String(row.table),
          hitRatio: Number(row.hit_ratio),
          seqScans: Number(row.seq_scans),
          indexScans: Number(row.index_scans)
        }))
      }
    } finally {
      await client.end().catch(() => {})
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
    const client = new Client(buildClientConfig(config, tunnelOverrides))

    try {
      await client.connect()

      const result = await client.query(`
        SELECT
          blocked.pid AS blocked_pid,
          blocked_activity.usename AS blocked_user,
          blocked_activity.query AS blocked_query,
          blocking.pid AS blocking_pid,
          blocking_activity.usename AS blocking_user,
          blocking_activity.query AS blocking_query,
          blocked.locktype AS lock_type,
          COALESCE(blocked.relation::regclass::text, '') AS relation,
          COALESCE(
            EXTRACT(EPOCH FROM (now() - blocked_activity.query_start))::text || 's',
            '0s'
          ) AS wait_duration,
          COALESCE(
            EXTRACT(EPOCH FROM (now() - blocked_activity.query_start)) * 1000,
            0
          )::bigint AS wait_duration_ms
        FROM pg_locks blocked
        JOIN pg_stat_activity blocked_activity ON blocked.pid = blocked_activity.pid
        JOIN pg_locks blocking ON (
          blocked.locktype = blocking.locktype
          AND blocked.database IS NOT DISTINCT FROM blocking.database
          AND blocked.relation IS NOT DISTINCT FROM blocking.relation
          AND blocked.page IS NOT DISTINCT FROM blocking.page
          AND blocked.tuple IS NOT DISTINCT FROM blocking.tuple
          AND blocked.virtualxid IS NOT DISTINCT FROM blocking.virtualxid
          AND blocked.transactionid IS NOT DISTINCT FROM blocking.transactionid
          AND blocked.classid IS NOT DISTINCT FROM blocking.classid
          AND blocked.objid IS NOT DISTINCT FROM blocking.objid
          AND blocked.objsubid IS NOT DISTINCT FROM blocking.objsubid
          AND blocked.pid != blocking.pid
        )
        JOIN pg_stat_activity blocking_activity ON blocking.pid = blocking_activity.pid
        WHERE NOT blocked.granted
          AND blocking.granted
        ORDER BY blocked_activity.query_start ASC
      `)

      return result.rows.map((row) => ({
        blockedPid: Number(row.blocked_pid),
        blockedUser: String(row.blocked_user ?? ''),
        blockedQuery: String(row.blocked_query ?? ''),
        blockingPid: Number(row.blocking_pid),
        blockingUser: String(row.blocking_user ?? ''),
        blockingQuery: String(row.blocking_query ?? ''),
        lockType: String(row.lock_type ?? ''),
        relation: row.relation ? String(row.relation) : undefined,
        waitDuration: String(row.wait_duration ?? '0s'),
        waitDurationMs: Number(row.wait_duration_ms ?? 0)
      }))
    } finally {
      await client.end().catch(() => {})
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
    const client = new Client(buildClientConfig(config, tunnelOverrides))

    try {
      await client.connect()
      const result = await client.query('SELECT pg_cancel_backend($1) AS cancelled', [pid])
      const cancelled = result.rows[0]?.cancelled === true
      return cancelled
        ? { success: true }
        : { success: false, error: 'Failed to cancel query - process may have already completed' }
    } finally {
      await client.end().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }
}
