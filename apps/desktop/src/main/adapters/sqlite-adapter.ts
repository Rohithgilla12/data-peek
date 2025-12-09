import Database from 'better-sqlite3'
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
 * SQLite database adapter using better-sqlite3
 */
export class SQLiteAdapter implements DatabaseAdapter {
  readonly dbType = 'sqlite' as const

  /**
   * Create a connection to SQLite database
   * Note: SQLite connections are file-based, using config.database as the path
   */
  private getDb(config: ConnectionConfig): Database.Database {
    // For SQLite, database is the file path
    // Support special paths: ':memory:' for in-memory, or file paths
    const dbPath = config.database || ':memory:'
    return new Database(dbPath, { readonly: false })
  }

  async connect(config: ConnectionConfig): Promise<void> {
    // Test connection by opening and closing the database
    const db = this.getDb(config)
    try {
      // Verify we can execute a query
      db.prepare('SELECT 1').get()
    } finally {
      db.close()
    }
  }

  async query(config: ConnectionConfig, sql: string): Promise<AdapterQueryResult> {
    const db = this.getDb(config)
    try {
      const stmt = db.prepare(sql)
      const rows = stmt.all() as Record<string, unknown>[]

      // Get column metadata from the statement
      const columns = stmt.columns()
      const fields: QueryField[] = columns.map((col) => ({
        name: col.name,
        dataType: normalizeSqliteType(col.type || 'text')
      }))

      return {
        rows,
        fields,
        rowCount: rows.length
      }
    } finally {
      db.close()
    }
  }

  async queryMultiple(
    config: ConnectionConfig,
    sql: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options?: QueryOptions
  ): Promise<AdapterMultiQueryResult> {
    const db = this.getDb(config)
    const totalStart = Date.now()
    const results: StatementResult[] = []

    // Note: SQLite with better-sqlite3 is synchronous and cannot be cancelled
    // The executionId in options is acknowledged but cancellation is not supported

    try {
      const statements = splitSqliteStatements(sql)

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i]
        const stmtStart = Date.now()

        try {
          const isDataReturning = isDataReturningStatement(statement)
          const stmt = db.prepare(statement)

          let rows: Record<string, unknown>[] = []
          let fields: QueryField[] = []
          let rowCount = 0

          if (isDataReturning) {
            rows = stmt.all() as Record<string, unknown>[]
            const columns = stmt.columns()
            fields = columns.map((col) => ({
              name: col.name,
              dataType: normalizeSqliteType(col.type || 'text')
            }))
            rowCount = rows.length
          } else {
            const result = stmt.run()
            rowCount = result.changes
            // For non-data statements, return a summary row
            rows = [{ changes: result.changes, lastInsertRowid: result.lastInsertRowid }]
            fields = [
              { name: 'changes', dataType: 'integer' },
              { name: 'lastInsertRowid', dataType: 'integer' }
            ]
          }

          const stmtDuration = Date.now() - stmtStart

          results.push({
            statement,
            statementIndex: i,
            rows,
            fields,
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
      db.close()
    }
  }

  async execute(
    config: ConnectionConfig,
    sql: string,
    params: unknown[]
  ): Promise<{ rowCount: number | null }> {
    const db = this.getDb(config)
    try {
      const stmt = db.prepare(sql)
      const result = stmt.run(...params)
      return { rowCount: result.changes }
    } finally {
      db.close()
    }
  }

  async executeTransaction(
    config: ConnectionConfig,
    statements: Array<{ sql: string; params: unknown[] }>
  ): Promise<{ rowsAffected: number; results: Array<{ rowCount: number | null }> }> {
    const db = this.getDb(config)
    try {
      const results: Array<{ rowCount: number | null }> = []
      let rowsAffected = 0

      const transaction = db.transaction(() => {
        for (const stmt of statements) {
          const prepared = db.prepare(stmt.sql)
          const result = prepared.run(...stmt.params)
          results.push({ rowCount: result.changes })
          rowsAffected += result.changes
        }
      })

      transaction()
      return { rowsAffected, results }
    } finally {
      db.close()
    }
  }

  async getSchemas(config: ConnectionConfig): Promise<SchemaInfo[]> {
    const db = this.getDb(config)
    try {
      // SQLite doesn't have schemas - we use 'main' as the default schema name
      // Get list of tables
      const tablesResult = db
        .prepare(
          `SELECT name, type
           FROM sqlite_master
           WHERE type IN ('table', 'view')
             AND name NOT LIKE 'sqlite_%'
           ORDER BY name`
        )
        .all() as Array<{ name: string; type: string }>

      const tables: TableInfo[] = []

      for (const tableRow of tablesResult) {
        // Get column info using PRAGMA
        const columnsResult = db.prepare(`PRAGMA table_info("${tableRow.name}")`).all() as Array<{
          cid: number
          name: string
          type: string
          notnull: number
          dflt_value: string | null
          pk: number
        }>

        // Get foreign key info
        const fkResult = db.prepare(`PRAGMA foreign_key_list("${tableRow.name}")`).all() as Array<{
          id: number
          seq: number
          table: string
          from: string
          to: string
          on_update: string
          on_delete: string
          match: string
        }>

        // Build foreign key lookup map
        const fkMap = new Map<string, ForeignKeyInfo>()
        for (const fk of fkResult) {
          fkMap.set(fk.from, {
            constraintName: `fk_${tableRow.name}_${fk.from}`,
            referencedSchema: 'main',
            referencedTable: fk.table,
            referencedColumn: fk.to
          })
        }

        const columns: ColumnInfo[] = columnsResult.map((col) => ({
          name: col.name,
          dataType: normalizeSqliteType(col.type),
          isNullable: col.notnull === 0,
          isPrimaryKey: col.pk > 0,
          defaultValue: col.dflt_value || undefined,
          ordinalPosition: col.cid + 1,
          foreignKey: fkMap.get(col.name)
        }))

        tables.push({
          name: tableRow.name,
          type: tableRow.type === 'view' ? 'view' : 'table',
          columns
        })
      }

      return [
        {
          name: 'main',
          tables,
          routines: [] // SQLite doesn't have stored procedures/functions
        }
      ]
    } finally {
      db.close()
    }
  }

  async explain(config: ConnectionConfig, sql: string, analyze: boolean): Promise<ExplainResult> {
    const db = this.getDb(config)
    try {
      const start = Date.now()

      // SQLite supports EXPLAIN QUERY PLAN for query planning info
      const explainSql = analyze ? `EXPLAIN QUERY PLAN ${sql}` : `EXPLAIN QUERY PLAN ${sql}`

      const rows = db.prepare(explainSql).all() as Array<{
        id: number
        parent: number
        notused: number
        detail: string
      }>

      const duration = Date.now() - start

      // Format the explain output
      const plan = rows.map((row) => ({
        id: row.id,
        parent: row.parent,
        detail: row.detail
      }))

      return {
        plan,
        durationMs: duration
      }
    } finally {
      db.close()
    }
  }

  async getTableDDL(
    config: ConnectionConfig,
    _schema: string,
    table: string
  ): Promise<TableDefinition> {
    const db = this.getDb(config)
    try {
      // Get column info
      const columnsResult = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{
        cid: number
        name: string
        type: string
        notnull: number
        dflt_value: string | null
        pk: number
      }>

      // Get index info
      const indexListResult = db.prepare(`PRAGMA index_list("${table}")`).all() as Array<{
        seq: number
        name: string
        unique: number
        origin: string
        partial: number
      }>

      // Get foreign key info
      const fkResult = db.prepare(`PRAGMA foreign_key_list("${table}")`).all() as Array<{
        id: number
        seq: number
        table: string
        from: string
        to: string
        on_update: string
        on_delete: string
        match: string
      }>

      // Build columns
      const columns: ColumnDefinition[] = columnsResult.map((col, idx) => ({
        id: `col-${idx}`,
        name: col.name,
        dataType: normalizeSqliteType(col.type) as ColumnDefinition['dataType'],
        isNullable: col.notnull === 0,
        isPrimaryKey: col.pk > 0,
        isUnique: false, // Will be set from indexes
        defaultValue: col.dflt_value || undefined
      }))

      // Build constraints
      const constraints: ConstraintDefinition[] = []

      // Add foreign key constraints
      const fkGroups = new Map<
        number,
        Array<{
          from: string
          to: string
          table: string
          on_update: string
          on_delete: string
        }>
      >()
      for (const fk of fkResult) {
        if (!fkGroups.has(fk.id)) {
          fkGroups.set(fk.id, [])
        }
        fkGroups.get(fk.id)!.push(fk)
      }

      let constraintIdx = 0
      for (const [, fks] of fkGroups) {
        const first = fks[0]
        constraints.push({
          id: `constraint-${constraintIdx++}`,
          name: `fk_${table}_${first.from}`,
          type: 'foreign_key',
          columns: fks.map((f) => f.from),
          referencedSchema: 'main',
          referencedTable: first.table,
          referencedColumns: fks.map((f) => f.to),
          onUpdate: this.mapFKAction(first.on_update),
          onDelete: this.mapFKAction(first.on_delete)
        })
      }

      // Build indexes
      const indexes: IndexDefinition[] = []
      for (const idx of indexListResult) {
        // Skip auto-generated indexes for PRIMARY KEY and UNIQUE constraints
        if (idx.origin === 'pk' || idx.origin === 'u') {
          // Mark columns as unique for single-column unique indexes
          if (idx.unique && idx.origin === 'u') {
            const indexInfo = db.prepare(`PRAGMA index_info("${idx.name}")`).all() as Array<{
              seqno: number
              cid: number
              name: string
            }>
            if (indexInfo.length === 1) {
              const col = columns.find((c) => c.name === indexInfo[0].name)
              if (col) col.isUnique = true
            }
          }
          continue
        }

        // Get index columns
        const indexInfo = db.prepare(`PRAGMA index_info("${idx.name}")`).all() as Array<{
          seqno: number
          cid: number
          name: string
        }>

        indexes.push({
          id: `index-${indexes.length}`,
          name: idx.name,
          columns: indexInfo.map((col) => ({ name: col.name })),
          isUnique: idx.unique === 1,
          method: 'btree' // SQLite uses B-tree for all indexes
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
      db.close()
    }
  }

  /**
   * Map SQLite FK action string to constraint action type
   */
  private mapFKAction(action: string): ConstraintDefinition['onUpdate'] {
    const upper = action.toUpperCase()
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getSequences(_config: ConnectionConfig): Promise<SequenceInfo[]> {
    // SQLite doesn't have sequences - it uses AUTOINCREMENT on INTEGER PRIMARY KEY
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getTypes(_config: ConnectionConfig): Promise<CustomTypeInfo[]> {
    // SQLite doesn't have custom types
    return []
  }
}
