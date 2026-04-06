import sql from 'mssql'
import { randomUUID } from 'crypto'
import type {
  ConnectionConfig,
  SchemaInfo,
  TableInfo,
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
  DatabaseSizeInfo
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

/** Split SQL into statements for MSSQL */
const splitMssqlStatements = (sqlText: string) => splitStatements(sqlText, 'mssql')

const MSSQL_TYPE_MAP: Record<number, string> = {
  34: 'image',
  35: 'text',
  36: 'uniqueidentifier',
  40: 'date',
  41: 'time',
  42: 'datetime2',
  43: 'datetimeoffset',
  48: 'tinyint',
  52: 'smallint',
  56: 'int',
  58: 'smalldatetime',
  59: 'real',
  60: 'money',
  61: 'datetime',
  62: 'float',
  98: 'sql_variant',
  99: 'ntext',
  104: 'bit',
  106: 'decimal',
  108: 'numeric',
  122: 'smallmoney',
  127: 'bigint',
  167: 'varchar',
  175: 'char',
  189: 'timestamp',
  231: 'nvarchar',
  239: 'nchar',
  240: 'hierarchyid',
  241: 'xml',
  242: 'geometry',
  243: 'geography'
}

/**
 * Resolve MSSQL system type ID to human-readable type name
 */
const SYSTEM_SCHEMAS = [
  'sys',
  'INFORMATION_SCHEMA',
  'guest',
  'db_owner',
  'db_accessadmin',
  'db_securityadmin',
  'db_ddladmin',
  'db_backupoperator',
  'db_datareader',
  'db_datawriter',
  'db_denydatareader',
  'db_denydatawriter'
]

function resolveMSSQLType(dataTypeID: number): string {
  return MSSQL_TYPE_MAP[dataTypeID] ?? `unknown(${dataTypeID})`
}

function inferTypeFromValue(value: unknown): { dataType: string; dataTypeID: number } {
  if (value === null || value === undefined) return { dataType: 'nvarchar', dataTypeID: 231 }
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { dataType: 'int', dataTypeID: 56 }
      : { dataType: 'float', dataTypeID: 62 }
  }
  if (typeof value === 'boolean') return { dataType: 'bit', dataTypeID: 104 }
  if (value instanceof Date) return { dataType: 'datetime', dataTypeID: 61 }
  return { dataType: 'nvarchar', dataTypeID: 231 }
}

function bindParameter(request: sql.Request, paramName: string, value: unknown): void {
  if (value === null || value === undefined) {
    request.input(paramName, sql.NVarChar, null)
  } else if (typeof value === 'string') {
    request.input(paramName, sql.NVarChar, value)
  } else if (typeof value === 'number') {
    request.input(paramName, Number.isInteger(value) ? sql.Int : sql.Float, value)
  } else if (typeof value === 'boolean') {
    request.input(paramName, sql.Bit, value)
  } else if (value instanceof Date) {
    request.input(paramName, sql.DateTime, value)
  } else {
    request.input(paramName, sql.NVarChar, String(value))
  }
}

/**
 * Create MSSQL connection config from our ConnectionConfig
 */
function toMSSQLConfig(
  config: ConnectionConfig,
  overrides?: { host: string; port: number }
): sql.config {
  const mssqlOptions = config.mssqlOptions || {}

  // Handle authentication methods first to determine what options are needed
  const authentication = mssqlOptions.authentication
  const isAzureAD = authentication === 'ActiveDirectoryIntegrated'

  // Build options object - for Azure AD, keep it minimal
  const defaultSsl = config.ssl ?? false
  const options: sql.config['options'] = {}

  // Enforce encryption when SSL is enabled
  if (mssqlOptions.encrypt !== undefined) {
    options.encrypt = mssqlOptions.encrypt
  } else if (defaultSsl) {
    options.encrypt = true
  }

  // For Azure AD, don't set trustServerCertificate or enableArithAbort
  // These can interfere with Azure AD authentication
  if (!isAzureAD) {
    if (mssqlOptions.trustServerCertificate !== undefined) {
      options.trustServerCertificate = mssqlOptions.trustServerCertificate
    } else {
      // Default to trusting the server certificate regardless of SSL setting.
      // When SSL is enabled, this is equivalent to sslmode=require: encrypt the
      // connection but don't verify the certificate, which works with cloud
      // databases that use self-signed certificates.
      options.trustServerCertificate = true
    }
    options.enableArithAbort = mssqlOptions.enableArithAbort ?? true
  }

  // Add connection timeout if specified
  if (mssqlOptions.connectionTimeout !== undefined) {
    options.connectTimeout = mssqlOptions.connectionTimeout
  }

  // Set request timeout (default to 0 = no timeout to allow long-running queries)
  // The mssql library defaults to 15000ms which is too short for complex queries
  options.requestTimeout = mssqlOptions.requestTimeout ?? 0

  // Build base config
  const sqlConfig: sql.config = {
    server: overrides?.host ?? config.host,
    database: config.database,
    options
  }

  // Include port if provided (optional in mssql config)
  if (overrides?.port) {
    sqlConfig.port = overrides.port
  } else if (config.port) {
    sqlConfig.port = config.port
  }

  // Handle authentication methods
  if (authentication === 'ActiveDirectoryIntegrated') {
    // Azure AD Integrated Authentication - uses azure-active-directory-default
    sqlConfig.authentication = {
      type: 'azure-active-directory-default',
      options: {}
    }
    // Explicitly don't set user/password for Azure AD authentication
    // Even if they exist in config, we should not include them
  } else if (authentication === 'ActiveDirectoryPassword') {
    // Azure AD Password Authentication
    // Note: This requires clientId and tenantId which aren't in our config yet
    // For now, use SQL Server auth as fallback
    if (config.user) sqlConfig.user = config.user
    if (config.password) sqlConfig.password = config.password
  } else if (authentication === 'ActiveDirectoryServicePrincipal') {
    // Azure AD Service Principal - would need clientId and clientSecret
    // For now, fall back to SQL Server auth
    if (config.user) sqlConfig.user = config.user
    if (config.password) sqlConfig.password = config.password
  } else {
    // Default: SQL Server Authentication
    if (config.user) sqlConfig.user = config.user
    if (config.password) sqlConfig.password = config.password
  }

  return sqlConfig
}

/**
 * Check if a SQL statement is data-returning (SELECT, etc.)
 */
function isDataReturningStatement(sqlText: string): boolean {
  const normalized = sqlText.trim().toUpperCase()
  if (normalized.startsWith('SELECT')) return true
  if (normalized.startsWith('WITH') && normalized.includes('SELECT')) return true
  if (normalized.startsWith('EXEC') && !normalized.startsWith('EXECUTE AS')) return true
  if (normalized.startsWith('EXECUTE') && !normalized.startsWith('EXECUTE AS')) return true
  // OUTPUT clause in INSERT/UPDATE/DELETE
  if (normalized.includes('OUTPUT')) return true
  return false
}

/**
 * MSSQL database adapter
 */
export class MSSQLAdapter implements DatabaseAdapter {
  readonly dbType = 'mssql' as const

  async connect(config: ConnectionConfig): Promise<void> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    const pool = new sql.ConnectionPool(toMSSQLConfig(config, tunnelOverrides))
    try {
      await pool.connect()
      await pool.close()
    } catch (error) {
      await pool.close().catch(() => {})
      throw error
    } finally {
      closeTunnel(tunnelSession)
    }
  }

  async query(config: ConnectionConfig, sqlQuery: string): Promise<AdapterQueryResult> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    const pool = new sql.ConnectionPool(toMSSQLConfig(config, tunnelOverrides))

    try {
      await pool.connect()
      const result = await pool.request().query(sqlQuery)
      const rows = result.recordset as Record<string, unknown>[]
      const fields: QueryField[] = []

      if (result.recordset?.columns) {
        let colIndex = 0
        for (const col of Object.values(result.recordset.columns)) {
          const meta = col as { name: string; type?: { id?: number; name?: string } }
          let dataTypeID: number | undefined
          let dataType: string

          // MSSQL returns empty string for unnamed columns (e.g., COUNT(*), SUM(), etc.)
          // Generate a fallback name and remap the row data
          const originalName = meta.name
          const columnName = originalName || `column_${colIndex + 1}`

          // If column name was empty, remap the row data to use the generated name
          if (!originalName && rows.length > 0) {
            for (const row of rows) {
              if (originalName in row) {
                row[columnName] = row[originalName]
                delete row[originalName]
              }
            }
          }

          if (meta.type?.id) {
            dataTypeID = meta.type.id
            dataType = resolveMSSQLType(dataTypeID)
          } else if (meta.type?.name) {
            dataType = meta.type.name.toLowerCase()
            const match = Object.entries(MSSQL_TYPE_MAP).find(
              ([, name]) => name.toLowerCase() === dataType
            )
            dataTypeID = match ? Number(match[0]) : undefined
          } else {
            const inferred = inferTypeFromValue(rows[0]?.[columnName])
            dataType = inferred.dataType
            dataTypeID = inferred.dataTypeID
          }

          fields.push({
            name: columnName,
            dataType: dataType || 'nvarchar',
            dataTypeID: dataTypeID || 231
          })
          colIndex++
        }
      } else if (rows.length > 0) {
        for (const [name, value] of Object.entries(rows[0])) {
          const inferred = inferTypeFromValue(value)
          fields.push({ name, ...inferred })
        }
      }

      return { rows, fields, rowCount: result.rowsAffected[0] ?? rows.length }
    } finally {
      await pool.close().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  async queryMultiple(
    config: ConnectionConfig,
    sqlQuery: string,
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

    const pool = new sql.ConnectionPool(toMSSQLConfig(config, tunnelOverrides))
    const totalStart = Date.now()
    const results: StatementResult[] = []
    let totalRowCount = 0

    try {
      if (collectTelemetry) {
        telemetryCollector.endPhase(executionId, TELEMETRY_PHASES.TCP_HANDSHAKE)
        telemetryCollector.startPhase(executionId, TELEMETRY_PHASES.DB_HANDSHAKE)
      }

      await pool.connect()

      if (collectTelemetry) {
        telemetryCollector.endPhase(executionId, TELEMETRY_PHASES.DB_HANDSHAKE)
      }
      const statements = splitMssqlStatements(sqlQuery)

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i]
        const stmtStart = Date.now()

        try {
          const request = pool.request()

          // Set per-request timeout if specified (overrides connection-level timeout)
          const queryTimeoutMs = options?.queryTimeoutMs
          if (
            queryTimeoutMs !== undefined &&
            typeof queryTimeoutMs === 'number' &&
            Number.isFinite(queryTimeoutMs)
          ) {
            // The mssql library supports request.timeout at runtime but types don't expose it
            ;(request as unknown as { timeout: number }).timeout = Math.max(
              0,
              Math.floor(queryTimeoutMs)
            )
          }

          // Register the current request for cancellation support
          if (options?.executionId) {
            registerQuery(options.executionId, { type: 'mssql', request })
          }

          // Start execution phase timing
          if (collectTelemetry) {
            telemetryCollector.startPhase(executionId, TELEMETRY_PHASES.EXECUTION)
          }

          const result = await request.query(statement)

          if (collectTelemetry) {
            telemetryCollector.endPhase(executionId, TELEMETRY_PHASES.EXECUTION)
            telemetryCollector.startPhase(executionId, TELEMETRY_PHASES.PARSE)
          }

          const stmtDuration = Date.now() - stmtStart

          const rows = (result.recordset || []) as Record<string, unknown>[]
          const fields: QueryField[] = []

          if (result.recordset?.columns) {
            let colIndex = 0
            for (const col of Object.values(result.recordset.columns)) {
              const meta = col as { name: string; type?: { id?: number; name?: string } }
              let dataTypeID: number | undefined
              let dataType: string

              // MSSQL returns empty string for unnamed columns (e.g., COUNT(*), SUM(), etc.)
              // Generate a fallback name and remap the row data
              const originalName = meta.name
              const columnName = originalName || `column_${colIndex + 1}`

              // If column name was empty, remap the row data to use the generated name
              if (!originalName && rows.length > 0) {
                for (const row of rows) {
                  if (originalName in row) {
                    row[columnName] = row[originalName]
                    delete row[originalName]
                  }
                }
              }

              if (meta.type?.id) {
                dataTypeID = meta.type.id
                dataType = resolveMSSQLType(dataTypeID)
              } else if (meta.type?.name) {
                dataType = meta.type.name.toLowerCase()
                const match = Object.entries(MSSQL_TYPE_MAP).find(
                  ([, name]) => name.toLowerCase() === dataType
                )
                dataTypeID = match ? Number(match[0]) : undefined
              } else {
                const inferred = inferTypeFromValue(rows[0]?.[columnName])
                dataType = inferred.dataType
                dataTypeID = inferred.dataTypeID
              }

              fields.push({
                name: columnName,
                dataType: dataType || 'nvarchar',
                dataTypeID: dataTypeID || 231
              })
              colIndex++
            }
          } else if (rows.length > 0) {
            for (const [name, value] of Object.entries(rows[0])) {
              const inferred = inferTypeFromValue(value)
              fields.push({ name, ...inferred })
            }
          }

          const isDataReturning = isDataReturningStatement(statement)
          const rowCount = isDataReturning ? rows.length : (result.rowsAffected[0] ?? 0)
          totalRowCount += rowCount

          results.push({
            statement,
            statementIndex: i,
            rows,
            fields,
            rowCount,
            durationMs: stmtDuration,
            isDataReturning
          })

          if (collectTelemetry) {
            telemetryCollector.endPhase(executionId, TELEMETRY_PHASES.PARSE)
          }

          // Unregister after each statement completes successfully
          if (options?.executionId) {
            unregisterQuery(options.executionId)
          }
        } catch (error) {
          const stmtDuration = Date.now() - stmtStart
          const errorMessage = error instanceof Error ? error.message : String(error)

          results.push({
            statement,
            statementIndex: i,
            rows: [],
            fields: [{ name: 'error', dataType: 'nvarchar' }],
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
      await pool.close().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  async execute(
    config: ConnectionConfig,
    sqlQuery: string,
    params: unknown[]
  ): Promise<{ rowCount: number | null }> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    const pool = new sql.ConnectionPool(toMSSQLConfig(config, tunnelOverrides))

    try {
      await pool.connect()
      const request = pool.request()
      const hasMSSQLPlaceholders = /@p\d+/.test(sqlQuery)

      if (hasMSSQLPlaceholders) {
        for (let i = 0; i < params.length; i++) {
          bindParameter(request, `p${i + 1}`, params[i])
        }
      } else {
        let paramIndex = 1
        sqlQuery = sqlQuery.replace(/\?/g, () => {
          bindParameter(request, `p${paramIndex}`, params[paramIndex - 1])
          return `@p${paramIndex++}`
        })
      }

      const result = await request.query(sqlQuery)
      return { rowCount: result.rowsAffected[0] ?? null }
    } finally {
      await pool.close().catch(() => {})
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
    const pool = new sql.ConnectionPool(toMSSQLConfig(config, tunnelOverrides))
    let transaction: sql.Transaction | null = null

    try {
      await pool.connect()
      transaction = new sql.Transaction(pool)
      await transaction.begin()
      const results: Array<{ rowCount: number | null }> = []
      let rowsAffected = 0

      for (const stmt of statements) {
        const request = new sql.Request(transaction)
        const hasMSSQLPlaceholders = /@p\d+/.test(stmt.sql)
        let querySql = stmt.sql

        if (hasMSSQLPlaceholders) {
          for (let i = 0; i < stmt.params.length; i++) {
            bindParameter(request, `p${i + 1}`, stmt.params[i])
          }
        } else {
          let paramIndex = 1
          querySql = stmt.sql.replace(/\?/g, () => {
            bindParameter(request, `p${paramIndex}`, stmt.params[paramIndex - 1])
            return `@p${paramIndex++}`
          })
        }

        const result = await request.query(querySql)
        const affected = result.rowsAffected[0] ?? 0
        results.push({ rowCount: affected })
        rowsAffected += affected
      }

      await transaction.commit()
      return { rowsAffected, results }
    } catch (error) {
      if (transaction) await transaction.rollback().catch(() => {})
      throw error
    } finally {
      await pool.close().catch(() => {})
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
    const pool = new sql.ConnectionPool(toMSSQLConfig(config, tunnelOverrides))

    try {
      await pool.connect()
      const schemaList = SYSTEM_SCHEMAS.map((s) => `'${s}'`).join(', ')

      const [schemasResult, tablesResult] = await Promise.all([
        pool
          .request()
          .query(
            `SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN (${schemaList}) ORDER BY schema_name`
          ),
        pool
          .request()
          .query(
            `SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN (${schemaList}) ORDER BY table_schema, table_name`
          )
      ])

      const [columnsResult, foreignKeysResult, routinesResult, paramsResult] = await Promise.all([
        pool.request().query(`
          SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.is_nullable,
                 c.column_default, c.ordinal_position, c.character_maximum_length,
                 c.numeric_precision, c.numeric_scale,
                 CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END as is_primary_key
          FROM information_schema.columns c
          LEFT JOIN (
            SELECT kcu.table_schema, kcu.table_name, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
          ) pk ON c.table_schema = pk.table_schema AND c.table_name = pk.table_name AND c.column_name = pk.column_name
          WHERE c.table_schema NOT IN (${schemaList})
          ORDER BY c.table_schema, c.table_name, c.ordinal_position
        `),
        pool.request().query(`
          SELECT fk_schema.table_schema, fk_schema.table_name, fk_col.column_name,
                 fk_schema.constraint_name, pk_schema.table_schema AS referenced_schema,
                 pk_schema.table_name AS referenced_table, pk_col.column_name AS referenced_column
          FROM information_schema.table_constraints fk_schema
          JOIN information_schema.referential_constraints rc
            ON fk_schema.constraint_name = rc.constraint_name AND fk_schema.table_schema = rc.constraint_schema
          JOIN information_schema.table_constraints pk_schema
            ON rc.unique_constraint_name = pk_schema.constraint_name AND rc.unique_constraint_schema = pk_schema.table_schema
          JOIN information_schema.key_column_usage fk_col
            ON fk_schema.constraint_name = fk_col.constraint_name AND fk_schema.table_schema = fk_col.table_schema
          JOIN information_schema.key_column_usage pk_col
            ON pk_schema.constraint_name = pk_col.constraint_name AND pk_schema.table_schema = pk_col.table_schema
            AND fk_col.ordinal_position = pk_col.ordinal_position
          WHERE fk_schema.constraint_type = 'FOREIGN KEY'
            AND fk_schema.table_schema NOT IN (${schemaList})
            AND pk_schema.table_schema NOT IN (${schemaList})
          ORDER BY fk_schema.table_schema, fk_schema.table_name, fk_col.column_name
        `),
        pool.request().query(`
          SELECT r.routine_schema, r.routine_name, r.routine_type,
                 r.data_type as return_type, r.specific_name
          FROM information_schema.routines r
          WHERE r.routine_schema NOT IN (${schemaList})
          ORDER BY r.routine_schema, r.routine_name
        `),
        pool.request().query(`
          SELECT p.specific_schema, p.specific_name, p.parameter_name,
                 p.data_type, p.parameter_mode, p.ordinal_position
          FROM information_schema.parameters p
          WHERE p.specific_schema NOT IN (${schemaList})
            AND p.parameter_name IS NOT NULL
          ORDER BY p.specific_schema, p.specific_name, p.ordinal_position
        `)
      ])

      // Build parameters lookup map
      const paramsMap = new Map<string, RoutineParameterInfo[]>()
      for (const row of paramsResult.recordset) {
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
      for (const row of routinesResult.recordset) {
        if (!routinesMap.has(row.routine_schema)) {
          routinesMap.set(row.routine_schema, [])
        }
        const paramsKey = `${row.routine_schema}.${row.specific_name}`
        const routineParams = paramsMap.get(paramsKey) || []

        routinesMap.get(row.routine_schema)!.push({
          name: row.routine_name,
          type: row.routine_type === 'PROCEDURE' ? 'procedure' : 'function',
          returnType: row.return_type || undefined,
          parameters: routineParams
        })
      }

      // Build schema structure
      const schemaMap = new Map<string, SchemaInfo>()

      // Initialize schemas
      for (const row of schemasResult.recordset) {
        schemaMap.set(row.schema_name, {
          name: row.schema_name,
          tables: [],
          routines: routinesMap.get(row.schema_name) || []
        })
      }

      // Build tables map
      const tableMap = new Map<string, TableInfo>()
      for (const row of tablesResult.recordset) {
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

      // Build foreign key lookup map - only include FKs where both source and target tables exist
      const fkMap = new Map<string, ForeignKeyInfo>()
      for (const row of foreignKeysResult.recordset) {
        const sourceTableKey = `${row.table_schema}.${row.table_name}`
        const targetTableKey = `${row.referenced_schema}.${row.referenced_table}`

        // Only include FK if both source and target tables exist in our table map
        if (tableMap.has(sourceTableKey) && tableMap.has(targetTableKey)) {
          const key = `${row.table_schema}.${row.table_name}.${row.column_name}`
          fkMap.set(key, {
            constraintName: row.constraint_name,
            referencedSchema: row.referenced_schema,
            referencedTable: row.referenced_table,
            referencedColumn: row.referenced_column
          })
        }
      }

      for (const row of columnsResult.recordset) {
        const table = tableMap.get(`${row.table_schema}.${row.table_name}`)
        if (!table) continue

        let dataType = row.data_type
        if (row.character_maximum_length) {
          dataType = `${row.data_type}(${row.character_maximum_length})`
        } else if (row.numeric_precision && row.numeric_scale) {
          dataType = `${row.data_type}(${row.numeric_precision},${row.numeric_scale})`
        } else if (row.numeric_precision) {
          dataType = `${row.data_type}(${row.numeric_precision})`
        }

        table.columns.push({
          name: row.column_name,
          dataType,
          isNullable: row.is_nullable === 'YES',
          isPrimaryKey: row.is_primary_key === 1,
          defaultValue: row.column_default || undefined,
          ordinalPosition: row.ordinal_position,
          foreignKey: fkMap.get(`${row.table_schema}.${row.table_name}.${row.column_name}`)
        })
      }

      return Array.from(schemaMap.values())
    } finally {
      await pool.close().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  async explain(
    config: ConnectionConfig,
    sqlQuery: string,
    analyze: boolean
  ): Promise<ExplainResult> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    const pool = new sql.ConnectionPool(toMSSQLConfig(config, tunnelOverrides))

    try {
      await pool.connect()
      const start = Date.now()

      if (analyze) {
        // Use SET STATISTICS XML ON for actual execution plan
        await pool.request().query('SET STATISTICS XML ON')
        const result = await pool.request().query(sqlQuery)
        await pool.request().query('SET STATISTICS XML OFF')

        // Extract XML plan from result
        const plan = result.recordset.find((row: Record<string, unknown>) => {
          const keys = Object.keys(row)
          return keys.some(
            (k) => k.toLowerCase().includes('executionplan') || k.toLowerCase().includes('xml')
          )
        })

        return {
          plan: plan || result.recordset,
          durationMs: Date.now() - start
        }
      } else {
        // Use SET SHOWPLAN_XML ON for estimated plan (doesn't execute)
        await pool.request().query('SET SHOWPLAN_XML ON')
        const result = await pool.request().query(sqlQuery)
        await pool.request().query('SET SHOWPLAN_XML OFF')

        // Extract XML plan from result
        const plan = result.recordset.find((row: Record<string, unknown>) => {
          const keys = Object.keys(row)
          return keys.some(
            (k) => k.toLowerCase().includes('executionplan') || k.toLowerCase().includes('xml')
          )
        })

        return {
          plan: plan || result.recordset,
          durationMs: Date.now() - start
        }
      }
    } finally {
      await pool.close().catch(() => {})
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
    const pool = new sql.ConnectionPool(toMSSQLConfig(config, tunnelOverrides))

    try {
      await pool.connect()
      // Query columns with full metadata
      const columnsResult = await pool
        .request()
        .input('schema', sql.NVarChar, schema)
        .input('table', sql.NVarChar, table).query(`
        SELECT
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          c.ordinal_position,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale,
          c.collation_name,
          CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END as is_primary_key,
          ep.value as column_comment
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = @schema
            AND tc.table_name = @table
        ) pk ON c.column_name = pk.column_name
        LEFT JOIN sys.extended_properties ep
          ON ep.major_id = OBJECT_ID(QUOTENAME(@schema) + '.' + QUOTENAME(@table))
          AND ep.minor_id = c.ordinal_position
          AND ep.name = 'MS_Description'
        WHERE c.table_schema = @schema AND c.table_name = @table
        ORDER BY c.ordinal_position
      `)

      // Query constraints
      const constraintsResult = await pool
        .request()
        .input('schema', sql.NVarChar, schema)
        .input('table', sql.NVarChar, table).query(`
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
        WHERE tc.table_schema = @schema AND tc.table_name = @table
        ORDER BY tc.constraint_name, kcu.ordinal_position
      `)

      // Query indexes
      const indexesResult = await pool
        .request()
        .input('schema', sql.NVarChar, schema)
        .input('table', sql.NVarChar, table).query(`
        SELECT
          i.name as index_name,
          i.is_unique,
          i.type_desc as index_type,
          STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) as columns
        FROM sys.indexes i
        JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        JOIN sys.tables t ON i.object_id = t.object_id
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE s.name = @schema AND t.name = @table
          AND i.is_primary_key = 0
        GROUP BY i.name, i.is_unique, i.type_desc
      `)

      // Query table comment
      const tableCommentResult = await pool
        .request()
        .input('schema', sql.NVarChar, schema)
        .input('table', sql.NVarChar, table).query(`
        SELECT ep.value as comment
        FROM sys.extended_properties ep
        JOIN sys.tables t ON ep.major_id = t.object_id
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE s.name = @schema AND t.name = @table
          AND ep.minor_id = 0
          AND ep.name = 'MS_Description'
      `)

      // Build TableDefinition
      const columns: ColumnDefinition[] = columnsResult.recordset.map((row, idx) => ({
        id: `col-${idx}`,
        name: row.column_name,
        dataType: row.data_type,
        length: row.character_maximum_length || undefined,
        precision: row.numeric_precision || undefined,
        scale: row.numeric_scale || undefined,
        isNullable: row.is_nullable === 'YES',
        isPrimaryKey: row.is_primary_key === 1,
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

      for (const row of constraintsResult.recordset) {
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
      const indexes: IndexDefinition[] = indexesResult.recordset.map((row, idx) => {
        const columnsArray = row.columns ? row.columns.split(', ').filter((c: string) => c) : []

        return {
          id: `index-${idx}`,
          name: row.index_name,
          columns: columnsArray.map((c: string) => ({ name: c.trim() })),
          isUnique: row.is_unique,
          method: 'btree' // MSSQL doesn't expose index method in the same way
        }
      })

      return {
        schema,
        name: table,
        columns,
        constraints,
        indexes,
        comment: tableCommentResult.recordset[0]?.comment || undefined
      }
    } finally {
      await pool.close().catch(() => {})
      closeTunnel(tunnelSession)
    }
  }

  async getSequences(): Promise<SequenceInfo[]> {
    // MSSQL uses IDENTITY columns instead of sequences
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
    const pool = new sql.ConnectionPool(toMSSQLConfig(config, tunnelOverrides))

    try {
      await pool.connect()
      // Get user-defined types from sys.types
      const typesResult = await pool.request().query(`
        SELECT
          s.name as schema_name,
          t.name as type_name,
          t.is_user_defined,
          t.is_table_type
        FROM sys.types t
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE t.is_user_defined = 1
          AND s.name NOT IN ('sys', 'INFORMATION_SCHEMA')
        ORDER BY s.name, t.name
      `)

      // MSSQL doesn't have enum types like PostgreSQL
      // User-defined types are typically table types or aliases
      return typesResult.recordset.map((row) => ({
        schema: row.schema_name,
        name: row.type_name,
        type: 'composite' as const // Treat as composite for now
      }))
    } finally {
      await pool.close().catch(() => {})
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
      lower.includes('real') ||
      lower.includes('money') ||
      lower === 'number'
    ) {
      return 'numeric'
    }
    if (lower.includes('date') || lower.includes('time')) {
      return 'datetime'
    }
    if (lower === 'bit') {
      return 'boolean'
    }
    if (
      lower.includes('char') ||
      lower.includes('text') ||
      lower.includes('varchar') ||
      lower.includes('nvarchar') ||
      lower.includes('nchar')
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
    const pool = new sql.ConnectionPool(toMSSQLConfig(config, tunnelOverrides))

    try {
      await pool.connect()

      const statsType = this.classifyColumnType(dataType)
      const quoteIdent = (name: string) => '[' + name.replace(/\]/g, ']]') + ']'
      const quotedTable = `${quoteIdent(schema)}.${quoteIdent(table)}`
      const quotedCol = quoteIdent(column)

      const baseResult = await pool.request().query(`
        SELECT
          COUNT(*) AS total_rows,
          COUNT(*) - COUNT(${quotedCol}) AS null_count,
          COUNT(DISTINCT ${quotedCol}) AS distinct_count
        FROM ${quotedTable}
      `)

      const baseRow = baseResult.recordset[0]
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
        const numResult = await pool.request().query(`
          SELECT
            CAST(MIN(${quotedCol}) AS NVARCHAR(MAX)) AS min_val,
            CAST(MAX(${quotedCol}) AS NVARCHAR(MAX)) AS max_val,
            AVG(CAST(${quotedCol} AS FLOAT)) AS avg_val,
            STDEV(CAST(${quotedCol} AS FLOAT)) AS stddev_val
          FROM ${quotedTable}
          WHERE ${quotedCol} IS NOT NULL
        `)

        const numRow = numResult.recordset[0]
        stats.min = numRow?.min_val ?? null
        stats.max = numRow?.max_val ?? null
        stats.avg = numRow?.avg_val != null ? Number(numRow.avg_val) : null
        stats.stdDev = numRow?.stddev_val != null ? Number(numRow.stddev_val) : null

        if (totalRows <= 1_000_000 && totalRows > 0) {
          const medianResult = await pool.request().query(`
            SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY CAST(${quotedCol} AS FLOAT))
              OVER () AS median_val
            FROM ${quotedTable}
            WHERE ${quotedCol} IS NOT NULL
          `)
          if (medianResult.recordset.length > 0) {
            stats.median =
              medianResult.recordset[0]?.median_val != null
                ? Number(medianResult.recordset[0].median_val)
                : null
          }

          const mmResult = await pool.request().query(`
            SELECT
              MIN(CAST(${quotedCol} AS FLOAT)) AS min_val,
              MAX(CAST(${quotedCol} AS FLOAT)) AS max_val
            FROM ${quotedTable}
            WHERE ${quotedCol} IS NOT NULL
          `)
          const mmRow = mmResult.recordset[0]
          const minVal = Number(mmRow?.min_val)
          const maxVal = Number(mmRow?.max_val)

          if (!isNaN(minVal) && !isNaN(maxVal) && minVal < maxVal) {
            const histResult = await pool.request().query(`
              SELECT
                NTILE(10) OVER (ORDER BY CAST(${quotedCol} AS FLOAT)) AS bucket,
                CAST(${quotedCol} AS FLOAT) AS val
              FROM ${quotedTable}
              WHERE ${quotedCol} IS NOT NULL
            `)

            const bucketMap = new Map<number, { min: number; max: number; count: number }>()
            for (const row of histResult.recordset) {
              const b = Number(row.bucket)
              const v = Number(row.val)
              if (!bucketMap.has(b)) {
                bucketMap.set(b, { min: v, max: v, count: 0 })
              }
              const entry = bucketMap.get(b)!
              if (v < entry.min) entry.min = v
              if (v > entry.max) entry.max = v
              entry.count++
            }

            stats.histogram = Array.from(bucketMap.entries())
              .sort(([a], [b]) => a - b)
              .map(([, v]) => v)
          }
        }
      } else if (statsType === 'text') {
        const textResult = await pool.request().query(`
          SELECT
            MIN(LEN(${quotedCol})) AS min_length,
            MAX(LEN(${quotedCol})) AS max_length,
            AVG(CAST(LEN(${quotedCol}) AS FLOAT)) AS avg_length
          FROM ${quotedTable}
          WHERE ${quotedCol} IS NOT NULL
        `)

        const textRow = textResult.recordset[0]
        stats.minLength = textRow?.min_length != null ? Number(textRow.min_length) : null
        stats.maxLength = textRow?.max_length != null ? Number(textRow.max_length) : null
        stats.avgLength = textRow?.avg_length != null ? Number(textRow.avg_length) : null

        const commonResult = await pool.request().query(`
          SELECT TOP 5
            CAST(${quotedCol} AS NVARCHAR(MAX)) AS val,
            COUNT(*) AS cnt,
            ROUND(COUNT(*) * 100.0 / ${totalRows}, 2) AS pct
          FROM ${quotedTable}
          WHERE ${quotedCol} IS NOT NULL
          GROUP BY CAST(${quotedCol} AS NVARCHAR(MAX))
          ORDER BY cnt DESC
        `)

        const commonValues: CommonValue[] = commonResult.recordset.map((row) => ({
          value: row.val != null ? String(row.val) : null,
          count: Number(row.cnt),
          percentage: Number(row.pct)
        }))
        stats.commonValues = commonValues
      } else if (statsType === 'datetime') {
        const dtResult = await pool.request().query(`
          SELECT
            CAST(MIN(${quotedCol}) AS NVARCHAR(MAX)) AS min_val,
            CAST(MAX(${quotedCol}) AS NVARCHAR(MAX)) AS max_val
          FROM ${quotedTable}
          WHERE ${quotedCol} IS NOT NULL
        `)

        const dtRow = dtResult.recordset[0]
        stats.min = dtRow?.min_val ?? null
        stats.max = dtRow?.max_val ?? null
      } else if (statsType === 'boolean') {
        const boolResult = await pool.request().query(`
          SELECT
            SUM(CASE WHEN ${quotedCol} = 1 THEN 1 ELSE 0 END) AS true_count,
            SUM(CASE WHEN ${quotedCol} = 0 THEN 1 ELSE 0 END) AS false_count
          FROM ${quotedTable}
        `)

        const boolRow = boolResult.recordset[0]
        stats.trueCount = Number(boolRow?.true_count ?? 0)
        stats.falseCount = Number(boolRow?.false_count ?? 0)
      }

      return stats
    } finally {
      await pool.close().catch(() => {})
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
    const pool = new sql.ConnectionPool(toMSSQLConfig(config, tunnelOverrides))

    try {
      await pool.connect()

      const result = await pool.request().query(`
        SELECT
          r.session_id AS pid,
          s.login_name AS [user],
          DB_NAME(r.database_id) AS [database],
          r.status AS state,
          r.total_elapsed_time AS duration_ms,
          CAST(r.total_elapsed_time / 1000.0 AS VARCHAR) + 's' AS duration,
          t.text AS query,
          r.wait_type AS wait_event
        FROM sys.dm_exec_requests r
        JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
        CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
        WHERE r.session_id != @@SPID
          AND r.status != 'background'
        ORDER BY r.total_elapsed_time DESC
      `)

      return result.recordset.map((row) => ({
        pid: Number(row.pid),
        user: String(row.user ?? ''),
        database: String(row.database ?? ''),
        state: String(row.state ?? ''),
        duration: String(row.duration ?? '0s'),
        durationMs: Number(row.duration_ms ?? 0),
        query: String(row.query ?? ''),
        waitEvent: row.wait_event ? String(row.wait_event) : undefined
      }))
    } finally {
      await pool.close().catch(() => {})
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
    const pool = new sql.ConnectionPool(toMSSQLConfig(config, tunnelOverrides))

    try {
      await pool.connect()

      const dbSizeResult = await pool.request().query(`
        SELECT
          SUM(size * 8 * 1024) AS total_size_bytes
        FROM sys.database_files
      `)
      const totalSizeBytes = Number(dbSizeResult.recordset[0]?.total_size_bytes ?? 0)
      const dbSize: DatabaseSizeInfo = {
        totalSize: this.formatBytes(totalSizeBytes),
        totalSizeBytes
      }

      const schemaFilter = schema ? `AND s.name = @schema` : ''
      const request = pool.request()
      if (schema) {
        request.input('schema', sql.NVarChar, schema)
      }

      const tablesResult = await request.query(`
        SELECT
          s.name AS [schema],
          t.name AS [table],
          SUM(p.rows) AS row_count_estimate,
          SUM(CASE WHEN i.index_id < 2
            THEN a.used_pages * 8 * 1024
            ELSE 0
          END) AS data_size_bytes,
          SUM(CASE WHEN i.index_id >= 2
            THEN a.used_pages * 8 * 1024
            ELSE 0
          END) AS index_size_bytes,
          SUM(a.used_pages * 8 * 1024) AS total_size_bytes
        FROM sys.tables t
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        JOIN sys.indexes i ON t.object_id = i.object_id
        JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
        JOIN sys.allocation_units a ON p.partition_id = a.container_id
        WHERE t.is_ms_shipped = 0
          ${schemaFilter}
        GROUP BY s.name, t.name
        ORDER BY SUM(a.used_pages) DESC
      `)

      const tables: TableSizeInfo[] = tablesResult.recordset.map((row) => {
        const dataSizeBytes = Number(row.data_size_bytes ?? 0)
        const indexSizeBytes = Number(row.index_size_bytes ?? 0)
        const tSizeBytes = Number(row.total_size_bytes ?? 0)
        return {
          schema: String(row.schema),
          table: String(row.table),
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
      await pool.close().catch(() => {})
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
    const pool = new sql.ConnectionPool(toMSSQLConfig(config, tunnelOverrides))

    try {
      await pool.connect()

      const cacheResult = await pool.request().query(`
        SELECT
          CASE WHEN SUM(CAST(page_count AS BIGINT)) = 0 THEN 0
            ELSE ROUND(
              CAST(SUM(CASE WHEN is_modified = 0 THEN 1 ELSE 0 END) AS FLOAT)
              / SUM(CAST(page_count AS BIGINT)) * 100, 2
            )
          END AS buffer_cache_hit_ratio
        FROM sys.dm_os_buffer_descriptors
        WHERE database_id = DB_ID()
      `)

      const bufferCacheHitRatio = Number(cacheResult.recordset[0]?.buffer_cache_hit_ratio ?? 0)

      let indexHitRatio = bufferCacheHitRatio
      try {
        const indexResult = await pool.request().query(`
          SELECT
            CASE WHEN SUM(user_seeks + user_scans + user_lookups) = 0 THEN 0
              ELSE ROUND(
                CAST(SUM(user_seeks + user_lookups) AS FLOAT)
                / SUM(user_seeks + user_scans + user_lookups) * 100, 2
              )
            END AS index_hit_ratio
          FROM sys.dm_db_index_usage_stats
          WHERE database_id = DB_ID()
        `)
        indexHitRatio = Number(indexResult.recordset[0]?.index_hit_ratio ?? bufferCacheHitRatio)
      } catch {
        // fall through with default
      }

      return {
        bufferCacheHitRatio,
        indexHitRatio
      }
    } finally {
      await pool.close().catch(() => {})
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
    const pool = new sql.ConnectionPool(toMSSQLConfig(config, tunnelOverrides))

    try {
      await pool.connect()

      const result = await pool.request().query(`
        SELECT
          blocked.request_session_id AS blocked_pid,
          blocked_s.login_name AS blocked_user,
          blocked_t.text AS blocked_query,
          blocker.request_session_id AS blocking_pid,
          blocker_s.login_name AS blocking_user,
          blocker_t.text AS blocking_query,
          blocked.resource_type AS lock_type,
          blocked.resource_description AS relation,
          r.total_elapsed_time AS wait_duration_ms,
          CAST(r.total_elapsed_time / 1000.0 AS VARCHAR) + 's' AS wait_duration
        FROM sys.dm_tran_locks blocked
        JOIN sys.dm_exec_sessions blocked_s ON blocked.request_session_id = blocked_s.session_id
        JOIN sys.dm_exec_requests r ON blocked.request_session_id = r.session_id
        CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) blocked_t
        JOIN sys.dm_tran_locks blocker ON (
          blocked.resource_type = blocker.resource_type
          AND blocked.resource_database_id = blocker.resource_database_id
          AND blocked.resource_associated_entity_id = blocker.resource_associated_entity_id
          AND blocked.request_session_id != blocker.request_session_id
        )
        JOIN sys.dm_exec_sessions blocker_s ON blocker.request_session_id = blocker_s.session_id
        OUTER APPLY (
          SELECT TOP 1 req.sql_handle FROM sys.dm_exec_requests req
          WHERE req.session_id = blocker.request_session_id
        ) blocker_r
        OUTER APPLY sys.dm_exec_sql_text(blocker_r.sql_handle) blocker_t
        WHERE blocked.request_status = 'WAIT'
          AND blocker.request_status = 'GRANT'
      `)

      return result.recordset.map((row) => ({
        blockedPid: Number(row.blocked_pid ?? 0),
        blockedUser: String(row.blocked_user ?? ''),
        blockedQuery: String(row.blocked_query ?? ''),
        blockingPid: Number(row.blocking_pid ?? 0),
        blockingUser: String(row.blocking_user ?? ''),
        blockingQuery: String(row.blocking_query ?? ''),
        lockType: String(row.lock_type ?? ''),
        relation: row.relation ? String(row.relation) : undefined,
        waitDuration: String(row.wait_duration ?? '0s'),
        waitDurationMs: Number(row.wait_duration_ms ?? 0)
      }))
    } finally {
      await pool.close().catch(() => {})
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
    const pool = new sql.ConnectionPool(toMSSQLConfig(config, tunnelOverrides))

    try {
      await pool.connect()
      await pool.request().query(`KILL ${Number(pid)}`)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    } finally {
      await pool.close().catch(() => {})
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
