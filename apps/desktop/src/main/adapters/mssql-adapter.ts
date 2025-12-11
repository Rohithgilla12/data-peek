import sql from 'mssql'
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
  RoutineParameterInfo
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
function toMSSQLConfig(config: ConnectionConfig): sql.config {
  const mssqlOptions = config.mssqlOptions || {}

  // Handle authentication methods first to determine what options are needed
  const authentication = mssqlOptions.authentication
  const isAzureAD = authentication === 'ActiveDirectoryIntegrated'

  // Build options object - for Azure AD, keep it minimal
  const defaultSsl = config.ssl ?? false
  const options: sql.config['options'] = {}

  // Always set encrypt if specified
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
    } else if (!defaultSsl) {
      options.trustServerCertificate = true
    }
    options.enableArithAbort = mssqlOptions.enableArithAbort ?? true
  }

  // Add connection timeout if specified
  if (mssqlOptions.connectionTimeout !== undefined) {
    options.connectTimeout = mssqlOptions.connectionTimeout
  }

  // Add request timeout if specified
  if (mssqlOptions.requestTimeout !== undefined) {
    options.requestTimeout = mssqlOptions.requestTimeout
  }

  // Build base config
  const sqlConfig: sql.config = {
    server: config.host,
    database: config.database,
    options
  }

  // Include port if provided (optional in mssql config)
  if (config.port) {
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
    const pool = new sql.ConnectionPool(toMSSQLConfig(config))
    await pool.connect()
    await pool.close()
    closeTunnel(tunnelSession)
  }

  async query(config: ConnectionConfig, sqlQuery: string): Promise<AdapterQueryResult> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const pool = new sql.ConnectionPool(toMSSQLConfig(config))
    await pool.connect()

    try {
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
      await pool.close()
      closeTunnel(tunnelSession)
    }
  }

  async queryMultiple(
    config: ConnectionConfig,
    sqlQuery: string,
    options?: QueryOptions
  ): Promise<AdapterMultiQueryResult> {
    const collectTelemetry = options?.collectTelemetry ?? false
    const executionId = options?.executionId ?? crypto.randomUUID()

    // Start telemetry collection if requested
    if (collectTelemetry) {
      telemetryCollector.startQuery(executionId, false)
      telemetryCollector.startPhase(executionId, TELEMETRY_PHASES.TCP_HANDSHAKE)
    }

    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }

    if (collectTelemetry) {
      telemetryCollector.endPhase(executionId, TELEMETRY_PHASES.TCP_HANDSHAKE)
      telemetryCollector.startPhase(executionId, TELEMETRY_PHASES.DB_HANDSHAKE)
    }

    const pool = new sql.ConnectionPool(toMSSQLConfig(config))
    await pool.connect()

    if (collectTelemetry) {
      telemetryCollector.endPhase(executionId, TELEMETRY_PHASES.DB_HANDSHAKE)
    }

    const totalStart = Date.now()
    const results: StatementResult[] = []
    let totalRowCount = 0

    try {
      const statements = splitMssqlStatements(sqlQuery)

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i]
        const stmtStart = Date.now()

        try {
          const request = pool.request()

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
      await pool.close()
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
    const pool = new sql.ConnectionPool(toMSSQLConfig(config))
    await pool.connect()

    try {
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
      await pool.close()
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
    const pool = new sql.ConnectionPool(toMSSQLConfig(config))
    await pool.connect()
    const transaction = new sql.Transaction(pool)

    try {
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
      await transaction.rollback().catch(() => {})
      throw error
    } finally {
      await pool.close()
      closeTunnel(tunnelSession)
    }
  }

  async getSchemas(config: ConnectionConfig): Promise<SchemaInfo[]> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const pool = new sql.ConnectionPool(toMSSQLConfig(config))
    await pool.connect()

    try {
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
      await pool.close()
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
    const pool = new sql.ConnectionPool(toMSSQLConfig(config))
    await pool.connect()

    try {
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
      await pool.close()
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
    const pool = new sql.ConnectionPool(toMSSQLConfig(config))
    await pool.connect()

    try {
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
      await pool.close()
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
    const pool = new sql.ConnectionPool(toMSSQLConfig(config))
    await pool.connect()

    try {
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
      await pool.close()
      closeTunnel(tunnelSession)
    }
  }
}
