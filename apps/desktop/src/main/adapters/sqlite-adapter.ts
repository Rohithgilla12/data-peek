import Database from 'better-sqlite3'
import * as fs from 'fs'
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
  CustomTypeInfo
} from '@shared/index'
import type { DatabaseAdapter, AdapterQueryResult, ExplainResult } from '../db-adapter'

/**
 * SQLite type affinity mapping
 * SQLite has 5 type affinities: TEXT, NUMERIC, INTEGER, REAL, BLOB
 */
function normalizeSQLiteType(rawType: string | null): string {
  if (!rawType) return 'BLOB'

  const type = rawType.toUpperCase()

  // Direct matches
  if (type === 'INTEGER' || type === 'INT') return 'integer'
  if (type === 'TEXT') return 'text'
  if (type === 'REAL' || type === 'FLOAT' || type === 'DOUBLE') return 'real'
  if (type === 'BLOB') return 'blob'
  if (type === 'NUMERIC') return 'numeric'

  // Common type aliases
  if (type.includes('INT')) return 'integer'
  if (type.includes('CHAR') || type.includes('CLOB') || type.includes('TEXT')) return 'text'
  if (type.includes('REAL') || type.includes('FLOA') || type.includes('DOUB')) return 'real'
  if (type.includes('BLOB')) return 'blob'

  // Numeric types
  if (type.includes('NUM') || type.includes('DEC')) return 'numeric'
  if (type === 'BOOLEAN') return 'boolean'
  if (type === 'DATE' || type === 'TIME') return type.toLowerCase()

  // Default to numeric affinity
  return rawType.toLowerCase()
}

/**
 * SQLite database adapter
 */
export class SQLiteAdapter implements DatabaseAdapter {
  readonly dbType = 'sqlite' as const

  /**
   * Test connection by attempting to open the database file
   */
  async connect(config: ConnectionConfig): Promise<void> {
    const filePath = config.filePath || config.database

    if (!filePath) {
      throw new Error('SQLite requires a file path')
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`Database file not found: ${filePath}`)
    }

    // Try to open the database
    try {
      const db = new Database(filePath, { readonly: true, fileMustExist: true })
      // Test query to ensure it's a valid SQLite database
      db.prepare('SELECT sqlite_version()').get()
      db.close()
    } catch (error) {
      throw new Error(`Invalid SQLite database: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Execute a query and return results
   */
  async query(config: ConnectionConfig, sql: string): Promise<AdapterQueryResult> {
    const filePath = config.filePath || config.database
    if (!filePath) {
      throw new Error('SQLite requires a file path')
    }

    const db = new Database(filePath, { readonly: true })

    try {
      const stmt = db.prepare(sql)
      const rows = stmt.all() as Record<string, unknown>[]

      // Extract field metadata from statement
      const columns = stmt.columns()
      const fields: QueryField[] = columns.map((col) => ({
        name: col.name,
        dataType: normalizeSQLiteType(col.type),
        dataTypeID: undefined
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

  /**
   * Execute a parameterized statement (for INSERT/UPDATE/DELETE)
   */
  async execute(
    config: ConnectionConfig,
    sql: string,
    params: unknown[]
  ): Promise<{ rowCount: number | null }> {
    const filePath = config.filePath || config.database
    if (!filePath) {
      throw new Error('SQLite requires a file path')
    }

    const db = new Database(filePath)

    try {
      const stmt = db.prepare(sql)
      const info = stmt.run(...params)
      return { rowCount: info.changes }
    } finally {
      db.close()
    }
  }

  /**
   * Execute multiple statements in a transaction
   */
  async executeTransaction(
    config: ConnectionConfig,
    statements: Array<{ sql: string; params: unknown[] }>
  ): Promise<{ rowsAffected: number; results: Array<{ rowCount: number | null }> }> {
    const filePath = config.filePath || config.database
    if (!filePath) {
      throw new Error('SQLite requires a file path')
    }

    const db = new Database(filePath)

    try {
      // Enable WAL mode for better concurrency
      db.pragma('journal_mode = WAL')

      const results: Array<{ rowCount: number | null }> = []
      let totalRowsAffected = 0

      // Start transaction
      db.prepare('BEGIN').run()

      try {
        for (const { sql, params } of statements) {
          const stmt = db.prepare(sql)
          const info = stmt.run(...params)
          results.push({ rowCount: info.changes })
          totalRowsAffected += info.changes
        }

        // Commit transaction
        db.prepare('COMMIT').run()

        return { rowsAffected: totalRowsAffected, results }
      } catch (error) {
        // Rollback on error
        db.prepare('ROLLBACK').run()
        throw error
      }
    } finally {
      db.close()
    }
  }

  /**
   * Fetch database schemas, tables, and columns
   * SQLite doesn't have schemas - we return a single 'main' schema
   */
  async getSchemas(config: ConnectionConfig): Promise<SchemaInfo[]> {
    const filePath = config.filePath || config.database
    if (!filePath) {
      throw new Error('SQLite requires a file path')
    }

    const db = new Database(filePath, { readonly: true })

    try {
      // Get all tables and views
      const tablesAndViews = db
        .prepare(
          `
          SELECT name, type
          FROM sqlite_master
          WHERE type IN ('table', 'view')
            AND name NOT LIKE 'sqlite_%'
          ORDER BY name
        `
        )
        .all() as Array<{ name: string; type: string }>

      const tables: TableInfo[] = []

      for (const item of tablesAndViews) {
        const columns = await this.getTableColumns(db, item.name)
        const estimatedRowCount = this.getTableRowCount(db, item.name)

        tables.push({
          name: item.name,
          type: item.type === 'view' ? 'view' : 'table',
          columns,
          estimatedRowCount
        })
      }

      return [
        {
          name: 'main',
          tables
        }
      ]
    } finally {
      db.close()
    }
  }

  /**
   * Get columns for a table with foreign key information
   */
  private async getTableColumns(db: Database.Database, tableName: string): Promise<ColumnInfo[]> {
    // Get column info from PRAGMA
    const columnInfo = db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
      cid: number
      name: string
      type: string
      notnull: number
      dflt_value: string | null
      pk: number
    }>

    // Get foreign keys
    const foreignKeys = db.prepare(`PRAGMA foreign_key_list("${tableName}")`).all() as Array<{
      id: number
      seq: number
      table: string
      from: string
      to: string
      on_update: string
      on_delete: string
      match: string
    }>

    // Create foreign key map
    const fkMap = new Map<string, ForeignKeyInfo>()
    for (const fk of foreignKeys) {
      fkMap.set(fk.from, {
        constraintName: `fk_${tableName}_${fk.id}`,
        referencedSchema: 'main',
        referencedTable: fk.table,
        referencedColumn: fk.to
      })
    }

    // Map columns
    const columns: ColumnInfo[] = columnInfo.map((col) => ({
      name: col.name,
      dataType: normalizeSQLiteType(col.type),
      isNullable: col.notnull === 0,
      isPrimaryKey: col.pk > 0,
      defaultValue: col.dflt_value ?? undefined,
      ordinalPosition: col.cid + 1,
      foreignKey: fkMap.get(col.name)
    }))

    return columns
  }

  /**
   * Get estimated row count for a table
   */
  private getTableRowCount(db: Database.Database, tableName: string): number | undefined {
    try {
      const result = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get() as {
        count: number
      }
      return result.count
    } catch {
      return undefined
    }
  }

  /**
   * Get query execution plan
   * SQLite uses EXPLAIN QUERY PLAN instead of PostgreSQL's EXPLAIN
   */
  async explain(
    config: ConnectionConfig,
    sql: string,
    _analyze: boolean
  ): Promise<ExplainResult> {
    const filePath = config.filePath || config.database
    if (!filePath) {
      throw new Error('SQLite requires a file path')
    }

    const db = new Database(filePath, { readonly: true })

    try {
      const startTime = performance.now()

      // SQLite doesn't have EXPLAIN ANALYZE, just EXPLAIN QUERY PLAN
      const explainQuery = `EXPLAIN QUERY PLAN ${sql}`
      const stmt = db.prepare(explainQuery)
      const planRows = stmt.all()

      const durationMs = performance.now() - startTime

      return {
        plan: planRows,
        durationMs
      }
    } finally {
      db.close()
    }
  }

  /**
   * Get table DDL definition
   * Reverse engineer table structure for the table designer
   */
  async getTableDDL(
    config: ConnectionConfig,
    _schema: string,
    table: string
  ): Promise<TableDefinition> {
    const filePath = config.filePath || config.database
    if (!filePath) {
      throw new Error('SQLite requires a file path')
    }

    const db = new Database(filePath, { readonly: true })

    try {
      // Get table creation SQL
      const createSql = db
        .prepare(
          `
          SELECT sql
          FROM sqlite_master
          WHERE type='table' AND name=?
        `
        )
        .get(table) as { sql: string } | undefined

      if (!createSql) {
        throw new Error(`Table not found: ${table}`)
      }

      // Get column info
      const columnInfo = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{
        cid: number
        name: string
        type: string
        notnull: number
        dflt_value: string | null
        pk: number
      }>

      // Build column definitions
      const columns: ColumnDefinition[] = columnInfo.map((col) => ({
        id: `col_${col.cid}`,
        name: col.name,
        dataType: normalizeSQLiteType(col.type),
        isNullable: col.notnull === 0,
        isPrimaryKey: col.pk > 0,
        isUnique: false, // TODO: detect from indexes
        defaultValue: col.dflt_value ?? undefined
      }))

      // Get foreign keys
      const foreignKeys = db.prepare(`PRAGMA foreign_key_list("${table}")`).all() as Array<{
        id: number
        seq: number
        table: string
        from: string
        to: string
        on_update: string
        on_delete: string
      }>

      // Build constraint definitions
      const constraints: ConstraintDefinition[] = []

      // Add foreign key constraints
      const fkGroups = new Map<number, typeof foreignKeys>()
      for (const fk of foreignKeys) {
        if (!fkGroups.has(fk.id)) {
          fkGroups.set(fk.id, [])
        }
        fkGroups.get(fk.id)!.push(fk)
      }

      for (const [fkId, fkCols] of fkGroups) {
        if (fkCols.length > 0) {
          constraints.push({
            id: `fk_${fkId}`,
            name: `fk_${table}_${fkId}`,
            type: 'foreign_key',
            columns: fkCols.map((fk) => fk.from),
            referencedSchema: 'main',
            referencedTable: fkCols[0].table,
            referencedColumns: fkCols.map((fk) => fk.to),
            onUpdate: fkCols[0].on_update as any,
            onDelete: fkCols[0].on_delete as any
          })
        }
      }

      // Get indexes
      const indexList = db.prepare(`PRAGMA index_list("${table}")`).all() as Array<{
        seq: number
        name: string
        unique: number
        origin: string
        partial: number
      }>

      const indexes: IndexDefinition[] = []

      for (const idx of indexList) {
        // Skip auto-created indexes for primary keys
        if (idx.origin === 'pk') continue

        const indexInfo = db.prepare(`PRAGMA index_info("${idx.name}")`).all() as Array<{
          seqno: number
          cid: number
          name: string
        }>

        indexes.push({
          id: `idx_${idx.seq}`,
          name: idx.name,
          columns: indexInfo.map((col) => ({ name: col.name })),
          isUnique: idx.unique === 1,
          method: 'btree' // SQLite only uses btree
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
   * Get sequences
   * SQLite doesn't have sequences - return empty array
   */
  async getSequences(_config: ConnectionConfig): Promise<SequenceInfo[]> {
    return []
  }

  /**
   * Get custom types (enums, composites, etc.)
   * SQLite doesn't have custom types - return empty array
   */
  async getTypes(_config: ConnectionConfig): Promise<CustomTypeInfo[]> {
    return []
  }
}
