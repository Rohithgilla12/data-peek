import { Client } from 'pg'
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
  type RoutineParameterInfo
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

    const client = new Client(config)
    await client.connect()
    await client.end()
    closeTunnel(tunnelSession)
  }

  async query(config: ConnectionConfig, sql: string): Promise<AdapterQueryResult> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const client = new Client(config)
    await client.connect()

    try {
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
      await client.end()
      closeTunnel(tunnelSession)
    }
  }

  async queryMultiple(
    config: ConnectionConfig,
    sql: string,
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

    const client = new Client(config)

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

    try {
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
      await client.end()
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
    const client = new Client(config)
    await client.connect()

    try {
      const res = await client.query(sql, params)
      return { rowCount: res.rowCount }
    } finally {
      await client.end()
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
    const client = new Client(config)
    await client.connect()

    try {
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
      await client.end()
      closeTunnel(tunnelSession)
    }
  }

  async getSchemas(config: ConnectionConfig): Promise<SchemaInfo[]> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const client = new Client(config)
    await client.connect()
    try {
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
        enumMap.set(row.name, row.values)
        enumMap.set(`${row.schema}.${row.name}`, row.values)
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
          const enumValues = enumMap.get(row.udt_name)

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

      return Array.from(schemaMap.values())
    } finally {
      await client.end()
      closeTunnel(tunnelSession)
    }
  }

  async explain(config: ConnectionConfig, sql: string, analyze: boolean): Promise<ExplainResult> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const client = new Client(config)
    await client.connect()

    try {
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
      await client.end()
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
    const client = new Client(config)
    await client.connect()

    try {
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
      await client.end()
      closeTunnel(tunnelSession)
    }
  }

  async getSequences(config: ConnectionConfig): Promise<SequenceInfo[]> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const client = new Client(config)
    await client.connect()

    try {
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
      await client.end()
      closeTunnel(tunnelSession)
    }
  }

  async getTypes(config: ConnectionConfig): Promise<CustomTypeInfo[]> {
    let tunnelSession: TunnelSession | null = null
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const client = new Client(config)
    await client.connect()

    try {
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
          values: row.values
        })),
        ...domainsResult.rows.map((row) => ({
          schema: row.schema,
          name: row.name,
          type: 'domain' as const
        }))
      ]
    } finally {
      await client.end()
      closeTunnel(tunnelSession)
    }
  }
}
