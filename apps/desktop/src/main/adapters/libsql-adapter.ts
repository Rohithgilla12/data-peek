import { createClient, type Client, type ResultSet } from '@libsql/client'
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
  StatementResult
} from '@shared/index'
import type {
  DatabaseAdapter,
  AdapterQueryResult,
  AdapterMultiQueryResult,
  ExplainResult,
  QueryOptions
} from '../db-adapter'
import { splitStatements } from '../lib/sql-parser'

/** Split SQL into statements for SQLite */
const splitSqliteStatements = (sql: string) => splitStatements(sql, 'sqlite')

/**
 * Check if a SQL statement is data-returning (SELECT, RETURNING, etc.)
 */
function isDataReturningStatement(sql: string): boolean {
  const normalized = sql.trim().toUpperCase()
  // SELECT statements return data
  if (normalized.startsWith('SELECT')) return true
  // WITH ... SELECT (CTEs)
  if (normalized.startsWith('WITH') && normalized.includes('SELECT')) return true
  // RETURNING clause in INSERT/UPDATE/DELETE (SQLite 3.35+)
  if (normalized.includes('RETURNING')) return true
  // PRAGMA queries return data
  if (normalized.startsWith('PRAGMA')) return true
  // EXPLAIN
  if (normalized.startsWith('EXPLAIN')) return true
  return false
}

/**
 * Map SQLite type affinity to a normalized type name
 */
function normalizeSqliteType(type: string): string {
  const upper = (type || '').toUpperCase()

  // Integer affinity
  if (upper.includes('INT')) return 'integer'

  // Text affinity
  if (upper.includes('CHAR') || upper.includes('CLOB') || upper.includes('TEXT') || upper === '') {
    return 'text'
  }

  // Blob affinity
  if (upper.includes('BLOB') || upper === 'NONE') return 'blob'

  // Real affinity
  if (upper.includes('REAL') || upper.includes('FLOA') || upper.includes('DOUB')) {
    return 'real'
  }

  // Numeric affinity (includes NUMERIC, DECIMAL, BOOLEAN, DATE, DATETIME)
  if (
    upper.includes('NUMERIC') ||
    upper.includes('DECIMAL') ||
    upper.includes('BOOLEAN') ||
    upper.includes('DATE') ||
    upper.includes('TIME')
  ) {
    return type.toLowerCase()
  }

  return type.toLowerCase() || 'text'
}

/**
 * Convert libSQL ResultSet to our format
 */
function convertResultSet(result: ResultSet): { rows: Record<string, unknown>[]; fields: QueryField[] } {
  const fields: QueryField[] = result.columns.map((col, idx) => ({
    name: col,
    dataType: normalizeSqliteType(result.columnTypes?.[idx] || 'text')
  }))

  const rows = result.rows.map((row) => {
    const obj: Record<string, unknown> = {}
    result.columns.forEach((col, idx) => {
      obj[col] = row[idx]
    })
    return obj
  })

  return { rows, fields }
}

/**
 * libSQL/Turso database adapter
 * Supports remote SQLite databases via HTTP/WebSocket
 */
export class LibSQLAdapter implements DatabaseAdapter {
  readonly dbType = 'sqlite' as const

  /**
   * Create a libSQL client from connection config
   */
  private createClient(config: ConnectionConfig): Client {
    const sqliteOptions = config.sqliteOptions

    if (!sqliteOptions || sqliteOptions.mode !== 'libsql') {
      throw new Error('LibSQL adapter requires sqliteOptions with mode "libsql"')
    }

    // For libSQL, the database field contains the URL
    const url = config.database

    if (!url) {
      throw new Error('LibSQL connection requires a URL in the database field')
    }

    return createClient({
      url,
      authToken: sqliteOptions.authToken,
      syncUrl: sqliteOptions.syncUrl
    })
  }

  async connect(config: ConnectionConfig): Promise<void> {
    const client = this.createClient(config)
    try {
      // Test connection by executing a simple query
      await client.execute('SELECT 1')
    } finally {
      client.close()
    }
  }

  async query(config: ConnectionConfig, sql: string): Promise<AdapterQueryResult> {
    const client = this.createClient(config)
    try {
      const result = await client.execute(sql)
      const { rows, fields } = convertResultSet(result)

      return {
        rows,
        fields,
        rowCount: rows.length
      }
    } finally {
      client.close()
    }
  }

  async queryMultiple(
    config: ConnectionConfig,
    sql: string,
    _options?: QueryOptions
  ): Promise<AdapterMultiQueryResult> {
    const client = this.createClient(config)
    const totalStart = Date.now()
    const results: StatementResult[] = []

    try {
      const statements = splitSqliteStatements(sql)

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i]
        const stmtStart = Date.now()

        try {
          const isDataReturning = isDataReturningStatement(statement)
          const result = await client.execute(statement)
          const { rows, fields } = convertResultSet(result)

          const stmtDuration = Date.now() - stmtStart

          if (isDataReturning) {
            results.push({
              statement,
              statementIndex: i,
              rows,
              fields,
              rowCount: rows.length,
              durationMs: stmtDuration,
              isDataReturning: true
            })
          } else {
            // For non-data statements, return affected rows info
            results.push({
              statement,
              statementIndex: i,
              rows: [{ changes: result.rowsAffected, lastInsertRowid: Number(result.lastInsertRowid) }],
              fields: [
                { name: 'changes', dataType: 'integer' },
                { name: 'lastInsertRowid', dataType: 'integer' }
              ],
              rowCount: result.rowsAffected,
              durationMs: stmtDuration,
              isDataReturning: false
            })
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
      client.close()
    }
  }

  async execute(
    config: ConnectionConfig,
    sql: string,
    params: unknown[]
  ): Promise<{ rowCount: number | null }> {
    const client = this.createClient(config)
    try {
      const result = await client.execute({ sql, args: params as (string | number | null | boolean | bigint | ArrayBuffer)[] })
      return { rowCount: result.rowsAffected }
    } finally {
      client.close()
    }
  }

  async executeTransaction(
    config: ConnectionConfig,
    statements: Array<{ sql: string; params: unknown[] }>
  ): Promise<{ rowsAffected: number; results: Array<{ rowCount: number | null }> }> {
    const client = this.createClient(config)
    try {
      const results: Array<{ rowCount: number | null }> = []
      let rowsAffected = 0

      const transaction = await client.transaction('write')
      try {
        for (const stmt of statements) {
          const result = await transaction.execute({
            sql: stmt.sql,
            args: stmt.params as (string | number | null | boolean | bigint | ArrayBuffer)[]
          })
          results.push({ rowCount: result.rowsAffected })
          rowsAffected += result.rowsAffected
        }
        await transaction.commit()
      } catch (error) {
        await transaction.rollback()
        throw error
      }

      return { rowsAffected, results }
    } finally {
      client.close()
    }
  }

  async getSchemas(config: ConnectionConfig): Promise<SchemaInfo[]> {
    const client = this.createClient(config)
    try {
      // Get list of tables
      const tablesResult = await client.execute(`
        SELECT name, type
        FROM sqlite_master
        WHERE type IN ('table', 'view')
          AND name NOT LIKE 'sqlite_%'
          AND name NOT LIKE '_litestream_%'
          AND name NOT LIKE 'libsql_%'
        ORDER BY name
      `)

      const tables: TableInfo[] = []

      for (const tableRow of tablesResult.rows) {
        const tableName = tableRow[0] as string
        const tableType = tableRow[1] as string

        // Get column info using PRAGMA
        const columnsResult = await client.execute(`PRAGMA table_info("${tableName}")`)

        // Get foreign key info
        const fkResult = await client.execute(`PRAGMA foreign_key_list("${tableName}")`)

        // Build foreign key lookup map
        const fkMap = new Map<string, ForeignKeyInfo>()
        for (const fk of fkResult.rows) {
          const from = fk[3] as string
          const toTable = fk[2] as string
          const toColumn = fk[4] as string
          fkMap.set(from, {
            constraintName: `fk_${tableName}_${from}`,
            referencedSchema: 'main',
            referencedTable: toTable,
            referencedColumn: toColumn
          })
        }

        const columns: ColumnInfo[] = columnsResult.rows.map((col) => ({
          name: col[1] as string,
          dataType: normalizeSqliteType(col[2] as string),
          isNullable: (col[3] as number) === 0,
          isPrimaryKey: (col[5] as number) > 0,
          defaultValue: col[4] ? String(col[4]) : undefined,
          ordinalPosition: (col[0] as number) + 1,
          foreignKey: fkMap.get(col[1] as string)
        }))

        tables.push({
          name: tableName,
          type: tableType === 'view' ? 'view' : 'table',
          columns
        })
      }

      return [
        {
          name: 'main',
          tables,
          routines: []
        }
      ]
    } finally {
      client.close()
    }
  }

  async explain(config: ConnectionConfig, sql: string, _analyze: boolean): Promise<ExplainResult> {
    const client = this.createClient(config)
    try {
      const start = Date.now()
      const result = await client.execute(`EXPLAIN QUERY PLAN ${sql}`)
      const duration = Date.now() - start

      const plan = result.rows.map((row) => ({
        id: row[0] as number,
        parent: row[1] as number,
        detail: row[3] as string
      }))

      return {
        plan,
        durationMs: duration
      }
    } finally {
      client.close()
    }
  }

  async getTableDDL(
    config: ConnectionConfig,
    _schema: string,
    table: string
  ): Promise<TableDefinition> {
    const client = this.createClient(config)
    try {
      // Get column info
      const columnsResult = await client.execute(`PRAGMA table_info("${table}")`)

      // Get index info
      const indexListResult = await client.execute(`PRAGMA index_list("${table}")`)

      // Get foreign key info
      const fkResult = await client.execute(`PRAGMA foreign_key_list("${table}")`)

      // Build columns
      const columns: ColumnDefinition[] = columnsResult.rows.map((col, idx) => ({
        id: `col-${idx}`,
        name: col[1] as string,
        dataType: normalizeSqliteType(col[2] as string) as ColumnDefinition['dataType'],
        isNullable: (col[3] as number) === 0,
        isPrimaryKey: (col[5] as number) > 0,
        isUnique: false,
        defaultValue: col[4] ? String(col[4]) : undefined
      }))

      // Build constraints
      const constraints: ConstraintDefinition[] = []

      // Add foreign key constraints
      const fkGroups = new Map<number, typeof fkResult.rows>()
      for (const fk of fkResult.rows) {
        const id = fk[0] as number
        if (!fkGroups.has(id)) {
          fkGroups.set(id, [])
        }
        fkGroups.get(id)!.push(fk)
      }

      let constraintIdx = 0
      for (const [, fks] of fkGroups) {
        const first = fks[0]
        constraints.push({
          id: `constraint-${constraintIdx++}`,
          name: `fk_${table}_${first[3]}`,
          type: 'foreign_key',
          columns: fks.map((f) => f[3] as string),
          referencedSchema: 'main',
          referencedTable: first[2] as string,
          referencedColumns: fks.map((f) => f[4] as string),
          onUpdate: this.mapFKAction(first[5] as string),
          onDelete: this.mapFKAction(first[6] as string)
        })
      }

      // Build indexes
      const indexes: IndexDefinition[] = []
      for (const idx of indexListResult.rows) {
        const indexName = idx[1] as string
        const isUnique = (idx[2] as number) === 1
        const origin = idx[3] as string

        // Skip auto-generated indexes for PRIMARY KEY and UNIQUE constraints
        if (origin === 'pk' || origin === 'u') {
          if (isUnique && origin === 'u') {
            const indexInfo = await client.execute(`PRAGMA index_info("${indexName}")`)
            if (indexInfo.rows.length === 1) {
              const col = columns.find((c) => c.name === indexInfo.rows[0][2])
              if (col) col.isUnique = true
            }
          }
          continue
        }

        // Get index columns
        const indexInfo = await client.execute(`PRAGMA index_info("${indexName}")`)

        indexes.push({
          id: `index-${indexes.length}`,
          name: indexName,
          columns: indexInfo.rows.map((col) => ({ name: col[2] as string })),
          isUnique,
          method: 'btree'
        })
      }

      return {
        schema: 'main',
        name: table,
        columns,
        constraints,
        indexes
      }
    } finally {
      client.close()
    }
  }

  private mapFKAction(action: string): ConstraintDefinition['onUpdate'] {
    const upper = (action || '').toUpperCase()
    switch (upper) {
      case 'CASCADE':
        return 'CASCADE'
      case 'SET NULL':
        return 'SET NULL'
      case 'SET DEFAULT':
        return 'SET DEFAULT'
      case 'RESTRICT':
        return 'RESTRICT'
      case 'NO ACTION':
      default:
        return 'NO ACTION'
    }
  }

  async getSequences(_config: ConnectionConfig): Promise<SequenceInfo[]> {
    return []
  }

  async getTypes(_config: ConnectionConfig): Promise<CustomTypeInfo[]> {
    return []
  }
}
