import mysql from 'mysql2/promise'
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
 */
function toMySQLConfig(config: ConnectionConfig): mysql.ConnectionOptions {
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl ? {} : undefined
  }
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
 * Split SQL into individual statements, respecting string literals and comments
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let i = 0

  while (i < sql.length) {
    const char = sql[i]
    const nextChar = sql[i + 1]

    // Handle single-quoted strings
    if (char === "'") {
      current += char
      i++
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          current += "''"
          i += 2
        } else if (sql[i] === '\\' && sql[i + 1] === "'") {
          // MySQL escape sequence
          current += "\\'"
          i += 2
        } else if (sql[i] === "'") {
          current += "'"
          i++
          break
        } else {
          current += sql[i]
          i++
        }
      }
      continue
    }

    // Handle double-quoted strings (when ANSI_QUOTES mode)
    if (char === '"') {
      current += char
      i++
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          current += '""'
          i += 2
        } else if (sql[i] === '"') {
          current += '"'
          i++
          break
        } else {
          current += sql[i]
          i++
        }
      }
      continue
    }

    // Handle backtick-quoted identifiers (MySQL-specific)
    if (char === '`') {
      current += char
      i++
      while (i < sql.length) {
        if (sql[i] === '`' && sql[i + 1] === '`') {
          current += '``'
          i += 2
        } else if (sql[i] === '`') {
          current += '`'
          i++
          break
        } else {
          current += sql[i]
          i++
        }
      }
      continue
    }

    // Handle line comments (-- or #)
    if ((char === '-' && nextChar === '-') || char === '#') {
      if (char === '#') {
        current += '#'
        i++
      } else {
        current += '--'
        i += 2
      }
      while (i < sql.length && sql[i] !== '\n') {
        current += sql[i]
        i++
      }
      continue
    }

    // Handle block comments (/* */)
    if (char === '/' && nextChar === '*') {
      current += '/*'
      i += 2
      while (i < sql.length) {
        if (sql[i] === '*' && sql[i + 1] === '/') {
          current += '*/'
          i += 2
          break
        } else {
          current += sql[i]
          i++
        }
      }
      continue
    }

    // Statement separator
    if (char === ';') {
      const stmt = current.trim()
      if (stmt) {
        statements.push(stmt)
      }
      current = ''
      i++
      continue
    }

    current += char
    i++
  }

  const lastStmt = current.trim()
  if (lastStmt) {
    statements.push(lastStmt)
  }

  return statements
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
    const connection = await mysql.createConnection(toMySQLConfig(config))
    await connection.end()
  }

  async query(config: ConnectionConfig, sql: string): Promise<AdapterQueryResult> {
    const connection = await mysql.createConnection(toMySQLConfig(config))

    try {
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
      await connection.end()
    }
  }

  async queryMultiple(
    config: ConnectionConfig,
    sql: string,
    options?: QueryOptions
  ): Promise<AdapterMultiQueryResult> {
    const connection = await mysql.createConnection(toMySQLConfig(config))

    // Register for cancellation support
    if (options?.executionId) {
      registerQuery(options.executionId, { type: 'mysql', connection })
    }

    const totalStart = Date.now()
    const results: StatementResult[] = []

    try {
      const statements = splitStatements(sql)

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i]
        const stmtStart = Date.now()

        try {
          const [rows, fields] = await connection.query(statement)
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

          results.push({
            statement,
            statementIndex: i,
            rows: resultRows as Record<string, unknown>[],
            fields: queryFields,
            rowCount,
            durationMs: stmtDuration,
            isDataReturning
          })
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

          throw new Error(
            `Error in statement ${i + 1}: ${errorMessage}\n\nStatement:\n${statement}`
          )
        }
      }

      return {
        results,
        totalDurationMs: Date.now() - totalStart
      }
    } finally {
      // Unregister from tracker
      if (options?.executionId) {
        unregisterQuery(options.executionId)
      }
      await connection.end()
    }
  }

  async execute(
    config: ConnectionConfig,
    sql: string,
    params: unknown[]
  ): Promise<{ rowCount: number | null }> {
    const connection = await mysql.createConnection(toMySQLConfig(config))

    try {
      const [result] = await connection.execute(sql, params)
      const affectedRows = (result as mysql.ResultSetHeader).affectedRows ?? null
      return { rowCount: affectedRows }
    } finally {
      await connection.end()
    }
  }

  async executeTransaction(
    config: ConnectionConfig,
    statements: Array<{ sql: string; params: unknown[] }>
  ): Promise<{ rowsAffected: number; results: Array<{ rowCount: number | null }> }> {
    const connection = await mysql.createConnection(toMySQLConfig(config))

    try {
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
      await connection.rollback().catch(() => {})
      throw error
    } finally {
      await connection.end()
    }
  }

  async getSchemas(config: ConnectionConfig): Promise<SchemaInfo[]> {
    const connection = await mysql.createConnection(toMySQLConfig(config))

    try {
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
      await connection.end()
    }
  }

  async explain(config: ConnectionConfig, sql: string, analyze: boolean): Promise<ExplainResult> {
    const connection = await mysql.createConnection(toMySQLConfig(config))

    try {
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
      await connection.end()
    }
  }

  async getTableDDL(
    config: ConnectionConfig,
    schema: string,
    table: string
  ): Promise<TableDefinition> {
    const connection = await mysql.createConnection(toMySQLConfig(config))

    try {
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
      await connection.end()
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getSequences(_config: ConnectionConfig): Promise<SequenceInfo[]> {
    // MySQL doesn't have sequences - it uses AUTO_INCREMENT
    // Return empty array as sequences are a PostgreSQL concept
    return []
  }

  async getTypes(config: ConnectionConfig): Promise<CustomTypeInfo[]> {
    // Get MySQL ENUM types from columns
    const connection = await mysql.createConnection(toMySQLConfig(config))

    try {
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
      await connection.end()
    }
  }
}
