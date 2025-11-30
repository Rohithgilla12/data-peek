/**
 * DDL SQL Builder for Table Designer
 * Generates CREATE TABLE, ALTER TABLE, and related DDL statements
 */

import type {
  TableDefinition,
  ColumnDefinition,
  ConstraintDefinition,
  IndexDefinition,
  AlterTableBatch,
  AlterColumnOperation,
  AlterConstraintOperation,
  AlterIndexOperation,
  ParameterizedQuery,
  DatabaseType
} from '@data-peek/shared'
import { quoteIdentifier as quoteIdentifierUtil } from './sql-utils'

/**
 * SQL dialect configuration for DDL
 */
interface DdlDialect {
  identifierQuote: string
  stringQuote: string
  supportsIfNotExists: boolean
  supportsIfExists: boolean
  supportsConcurrent: boolean
}

const DIALECTS: Record<DatabaseType, DdlDialect> = {
  postgresql: {
    identifierQuote: '"',
    stringQuote: "'",
    supportsIfNotExists: true,
    supportsIfExists: true,
    supportsConcurrent: true
  },
  mysql: {
    identifierQuote: '`',
    stringQuote: "'",
    supportsIfNotExists: true,
    supportsIfExists: true,
    supportsConcurrent: false
  },
  sqlite: {
    identifierQuote: '"',
    stringQuote: "'",
    supportsIfNotExists: true,
    supportsIfExists: true,
    supportsConcurrent: false
  },
  mssql: {
    identifierQuote: '[',
    stringQuote: "'",
    supportsIfNotExists: false,
    supportsIfExists: true,
    supportsConcurrent: false
  }
}

/**
 * Quote an identifier (table name, column name) for the given dialect
 */
function quoteIdentifier(name: string, dialect: DdlDialect): string {
  return quoteIdentifierUtil(name, dialect.identifierQuote)
}

/**
 * Quote a string literal
 */
function quoteString(value: string, dialect: DdlDialect): string {
  const q = dialect.stringQuote
  const escaped = value.replace(new RegExp(q, 'g'), q + q)
  return `${q}${escaped}${q}`
}

/**
 * Build fully qualified table reference
 */
function buildTableRef(schema: string, table: string, dialect: DdlDialect): string {
  const tableName = quoteIdentifier(table, dialect)
  // MSSQL uses 'dbo' as default schema, PostgreSQL uses 'public', SQLite uses 'main'
  if (schema && schema !== 'public' && schema !== 'main' && schema !== 'dbo') {
    return `${quoteIdentifier(schema, dialect)}.${tableName}`
  }
  return tableName
}

/**
 * Build column data type with modifiers
 */
function buildDataType(column: ColumnDefinition): string {
  let dataType = column.dataType

  // Handle length for varchar/char
  if ((dataType === 'varchar' || dataType === 'char') && column.length !== undefined) {
    dataType = `${dataType}(${column.length})`
  }

  // Handle precision/scale for numeric
  if (dataType === 'numeric' && column.precision !== undefined) {
    if (column.scale !== undefined) {
      dataType = `numeric(${column.precision},${column.scale})`
    } else {
      dataType = `numeric(${column.precision})`
    }
  }

  // Handle array types
  if (column.isArray) {
    dataType = `${dataType}[]`
  }

  return dataType
}

/**
 * Build column definition for CREATE TABLE
 */
function buildColumnDef(column: ColumnDefinition, dialect: DdlDialect): string {
  const parts: string[] = []

  // Column name and type
  parts.push(quoteIdentifier(column.name, dialect))
  parts.push(buildDataType(column))

  // Collation
  if (column.collation) {
    parts.push(`COLLATE ${quoteIdentifier(column.collation, dialect)}`)
  }

  // NOT NULL constraint
  if (!column.isNullable) {
    parts.push('NOT NULL')
  }

  // Default value
  if (column.defaultValue !== undefined && column.defaultValue !== '') {
    if (column.defaultType === 'sequence' && column.sequenceName) {
      parts.push(`DEFAULT nextval(${quoteString(column.sequenceName, dialect)})`)
    } else if (column.defaultType === 'expression') {
      // Expression defaults are used as-is (e.g., now(), gen_random_uuid())
      parts.push(`DEFAULT ${column.defaultValue}`)
    } else {
      // Value defaults need proper quoting based on type
      parts.push(`DEFAULT ${column.defaultValue}`)
    }
  }

  // Inline PRIMARY KEY (for single-column PK defined on column)
  // Note: We'll handle composite PKs as table constraints
  if (column.isPrimaryKey) {
    parts.push('PRIMARY KEY')
  }

  // Inline UNIQUE
  if (column.isUnique && !column.isPrimaryKey) {
    parts.push('UNIQUE')
  }

  // Column-level CHECK constraint
  if (column.checkConstraint) {
    parts.push(`CHECK (${column.checkConstraint})`)
  }

  return parts.join(' ')
}

/**
 * Build constraint definition for CREATE TABLE
 */
function buildConstraintDef(constraint: ConstraintDefinition, dialect: DdlDialect): string {
  const parts: string[] = []

  // Constraint name
  if (constraint.name) {
    parts.push(`CONSTRAINT ${quoteIdentifier(constraint.name, dialect)}`)
  }

  switch (constraint.type) {
    case 'primary_key': {
      const columns = constraint.columns.map((c) => quoteIdentifier(c, dialect)).join(', ')
      parts.push(`PRIMARY KEY (${columns})`)
      break
    }

    case 'foreign_key': {
      const columns = constraint.columns.map((c) => quoteIdentifier(c, dialect)).join(', ')
      const refColumns = (constraint.referencedColumns || [])
        .map((c) => quoteIdentifier(c, dialect))
        .join(', ')
      const refTable = buildTableRef(
        constraint.referencedSchema || 'public',
        constraint.referencedTable || '',
        dialect
      )

      parts.push(`FOREIGN KEY (${columns})`)
      parts.push(`REFERENCES ${refTable} (${refColumns})`)

      if (constraint.onUpdate && constraint.onUpdate !== 'NO ACTION') {
        parts.push(`ON UPDATE ${constraint.onUpdate}`)
      }
      if (constraint.onDelete && constraint.onDelete !== 'NO ACTION') {
        parts.push(`ON DELETE ${constraint.onDelete}`)
      }
      break
    }

    case 'unique': {
      const columns = constraint.columns.map((c) => quoteIdentifier(c, dialect)).join(', ')
      parts.push(`UNIQUE (${columns})`)
      break
    }

    case 'check': {
      if (constraint.checkExpression) {
        parts.push(`CHECK (${constraint.checkExpression})`)
      }
      break
    }

    case 'exclude': {
      if (constraint.excludeElements && constraint.excludeElements.length > 0) {
        const using = constraint.excludeUsing || 'gist'
        const elements = constraint.excludeElements
          .map((e) => `${quoteIdentifier(e.column, dialect)} WITH ${e.operator}`)
          .join(', ')
        parts.push(`EXCLUDE USING ${using} (${elements})`)
      }
      break
    }
  }

  return parts.join(' ')
}

/**
 * Build CREATE TABLE statement
 */
export function buildCreateTable(
  definition: TableDefinition,
  dbType: DatabaseType = 'postgresql'
): ParameterizedQuery {
  const dialect = DIALECTS[dbType]
  const lines: string[] = []

  // Table header
  const tableRef = buildTableRef(definition.schema, definition.name, dialect)
  let header = 'CREATE'
  if (definition.unlogged) {
    header += ' UNLOGGED'
  }
  header += ` TABLE ${tableRef}`

  // Inheritance
  if (definition.inherits && definition.inherits.length > 0) {
    // We'll handle INHERITS after the column definitions
  }

  lines.push(`${header} (`)

  // Column definitions
  // Filter out columns that are part of composite PK (we'll add PK as constraint)
  const pkColumns = definition.columns.filter((c) => c.isPrimaryKey)
  const isCompositePk = pkColumns.length > 1

  const columnDefs = definition.columns.map((col) => {
    // If composite PK, don't add inline PRIMARY KEY
    const adjustedCol = isCompositePk ? { ...col, isPrimaryKey: false } : col
    return '  ' + buildColumnDef(adjustedCol, dialect)
  })
  lines.push(columnDefs.join(',\n'))

  // Table-level constraints
  const constraintDefs: string[] = []

  // Add composite primary key if needed
  if (isCompositePk) {
    const pkConstraint: ConstraintDefinition = {
      id: 'pk',
      type: 'primary_key',
      columns: pkColumns.map((c) => c.name)
    }
    constraintDefs.push('  ' + buildConstraintDef(pkConstraint, dialect))
  }

  // Add explicit constraints
  for (const constraint of definition.constraints) {
    // Skip primary key if it's already defined inline or as composite
    if (constraint.type === 'primary_key' && !isCompositePk) {
      continue
    }
    constraintDefs.push('  ' + buildConstraintDef(constraint, dialect))
  }

  if (constraintDefs.length > 0) {
    lines[lines.length - 1] += ','
    lines.push(constraintDefs.join(',\n'))
  }

  lines.push(')')

  // Inheritance clause
  if (definition.inherits && definition.inherits.length > 0) {
    const parents = definition.inherits.map((p) => quoteIdentifier(p, dialect)).join(', ')
    lines[lines.length - 1] += ` INHERITS (${parents})`
  }

  // Partition clause
  if (definition.partition) {
    const partCols = definition.partition.columns.map((c) => quoteIdentifier(c, dialect)).join(', ')
    lines[lines.length - 1] += ` PARTITION BY ${definition.partition.type} (${partCols})`
  }

  // Tablespace
  if (definition.tablespace) {
    lines[lines.length - 1] += ` TABLESPACE ${quoteIdentifier(definition.tablespace, dialect)}`
  }

  const createTableSql = lines.join('\n') + ';'

  // Build complete SQL with comments and indexes
  const statements: string[] = [createTableSql]

  // Table comment
  if (definition.comment) {
    const commentSql = `COMMENT ON TABLE ${tableRef} IS ${quoteString(definition.comment, dialect)};`
    statements.push(commentSql)
  }

  // Column comments
  for (const col of definition.columns) {
    if (col.comment) {
      const colRef = `${tableRef}.${quoteIdentifier(col.name, dialect)}`
      const commentSql = `COMMENT ON COLUMN ${colRef} IS ${quoteString(col.comment, dialect)};`
      statements.push(commentSql)
    }
  }

  // Indexes (created separately from table)
  for (const index of definition.indexes) {
    const indexSql = buildCreateIndex(definition.schema, definition.name, index, dbType)
    statements.push(indexSql.sql)
  }

  return {
    sql: statements.join('\n\n'),
    params: []
  }
}

/**
 * Build CREATE INDEX statement
 */
export function buildCreateIndex(
  schema: string,
  table: string,
  index: IndexDefinition,
  dbType: DatabaseType = 'postgresql'
): ParameterizedQuery {
  const dialect = DIALECTS[dbType]
  const parts: string[] = ['CREATE']

  if (index.isUnique) {
    parts.push('UNIQUE')
  }

  parts.push('INDEX')

  if (index.concurrent && dialect.supportsConcurrent) {
    parts.push('CONCURRENTLY')
  }

  // Index name
  const indexName = index.name || `idx_${table}_${index.columns.map((c) => c.name).join('_')}`
  parts.push(quoteIdentifier(indexName, dialect))

  // ON table
  const tableRef = buildTableRef(schema, table, dialect)
  parts.push(`ON ${tableRef}`)

  // USING method
  if (index.method && index.method !== 'btree') {
    parts.push(`USING ${index.method}`)
  }

  // Columns
  const columnDefs = index.columns.map((col) => {
    let colDef = quoteIdentifier(col.name, dialect)
    if (col.order) {
      colDef += ` ${col.order}`
    }
    if (col.nullsPosition) {
      colDef += ` NULLS ${col.nullsPosition}`
    }
    return colDef
  })
  parts.push(`(${columnDefs.join(', ')})`)

  // INCLUDE columns (covering index)
  if (index.include && index.include.length > 0) {
    const includeCols = index.include.map((c) => quoteIdentifier(c, dialect)).join(', ')
    parts.push(`INCLUDE (${includeCols})`)
  }

  // WHERE clause (partial index)
  if (index.where) {
    parts.push(`WHERE ${index.where}`)
  }

  return {
    sql: parts.join(' ') + ';',
    params: []
  }
}

/**
 * Build DROP TABLE statement
 */
export function buildDropTable(
  schema: string,
  table: string,
  cascade: boolean = false,
  dbType: DatabaseType = 'postgresql'
): ParameterizedQuery {
  const dialect = DIALECTS[dbType]
  const tableRef = buildTableRef(schema, table, dialect)

  let sql = `DROP TABLE`
  if (dialect.supportsIfExists) {
    sql += ' IF EXISTS'
  }
  sql += ` ${tableRef}`
  if (cascade) {
    sql += ' CASCADE'
  }
  sql += ';'

  return { sql, params: [] }
}

/**
 * Build ALTER TABLE column operation
 */
function buildAlterColumnOp(
  tableRef: string,
  op: AlterColumnOperation,
  dialect: DdlDialect
): string {
  switch (op.type) {
    case 'add':
      return `ALTER TABLE ${tableRef} ADD COLUMN ${buildColumnDef(op.column, dialect)};`

    case 'drop': {
      let sql = `ALTER TABLE ${tableRef} DROP COLUMN ${quoteIdentifier(op.columnName, dialect)}`
      if (op.cascade) {
        sql += ' CASCADE'
      }
      return sql + ';'
    }

    case 'rename':
      return `ALTER TABLE ${tableRef} RENAME COLUMN ${quoteIdentifier(op.oldName, dialect)} TO ${quoteIdentifier(op.newName, dialect)};`

    case 'set_type': {
      let sql = `ALTER TABLE ${tableRef} ALTER COLUMN ${quoteIdentifier(op.columnName, dialect)} TYPE ${op.newType}`
      if (op.using) {
        sql += ` USING ${op.using}`
      }
      return sql + ';'
    }

    case 'set_nullable':
      if (op.nullable) {
        return `ALTER TABLE ${tableRef} ALTER COLUMN ${quoteIdentifier(op.columnName, dialect)} DROP NOT NULL;`
      } else {
        return `ALTER TABLE ${tableRef} ALTER COLUMN ${quoteIdentifier(op.columnName, dialect)} SET NOT NULL;`
      }

    case 'set_default':
      if (op.defaultValue === null) {
        return `ALTER TABLE ${tableRef} ALTER COLUMN ${quoteIdentifier(op.columnName, dialect)} DROP DEFAULT;`
      } else {
        return `ALTER TABLE ${tableRef} ALTER COLUMN ${quoteIdentifier(op.columnName, dialect)} SET DEFAULT ${op.defaultValue};`
      }

    case 'set_comment':
      if (op.comment === null) {
        return `COMMENT ON COLUMN ${tableRef}.${quoteIdentifier(op.columnName, dialect)} IS NULL;`
      } else {
        return `COMMENT ON COLUMN ${tableRef}.${quoteIdentifier(op.columnName, dialect)} IS ${quoteString(op.comment, dialect)};`
      }

    default:
      throw new Error(`Unknown column operation type`)
  }
}

/**
 * Build ALTER TABLE constraint operation
 */
function buildAlterConstraintOp(
  tableRef: string,
  op: AlterConstraintOperation,
  dialect: DdlDialect
): string {
  switch (op.type) {
    case 'add_constraint':
      return `ALTER TABLE ${tableRef} ADD ${buildConstraintDef(op.constraint, dialect)};`

    case 'drop_constraint': {
      let sql = `ALTER TABLE ${tableRef} DROP CONSTRAINT ${quoteIdentifier(op.name, dialect)}`
      if (op.cascade) {
        sql += ' CASCADE'
      }
      return sql + ';'
    }

    case 'rename_constraint':
      return `ALTER TABLE ${tableRef} RENAME CONSTRAINT ${quoteIdentifier(op.oldName, dialect)} TO ${quoteIdentifier(op.newName, dialect)};`

    default:
      throw new Error(`Unknown constraint operation type`)
  }
}

/**
 * Build index operation (CREATE/DROP/RENAME/REINDEX)
 */
function buildIndexOp(
  schema: string,
  table: string,
  op: AlterIndexOperation,
  dialect: DdlDialect,
  dbType: DatabaseType
): string {
  switch (op.type) {
    case 'create_index':
      return buildCreateIndex(schema, table, op.index, dbType).sql

    case 'drop_index': {
      let sql = 'DROP INDEX'
      if (op.concurrent && dialect.supportsConcurrent) {
        sql += ' CONCURRENTLY'
      }
      sql += ` IF EXISTS ${quoteIdentifier(op.name, dialect)}`
      if (op.cascade) {
        sql += ' CASCADE'
      }
      return sql + ';'
    }

    case 'rename_index':
      return `ALTER INDEX ${quoteIdentifier(op.oldName, dialect)} RENAME TO ${quoteIdentifier(op.newName, dialect)};`

    case 'reindex': {
      let sql = 'REINDEX INDEX'
      if (op.concurrent && dialect.supportsConcurrent) {
        sql += ' CONCURRENTLY'
      }
      return sql + ` ${quoteIdentifier(op.name, dialect)};`
    }

    default:
      throw new Error(`Unknown index operation type`)
  }
}

/**
 * Build ALTER TABLE batch operations
 */
export function buildAlterTable(
  batch: AlterTableBatch,
  dbType: DatabaseType = 'postgresql'
): ParameterizedQuery[] {
  const dialect = DIALECTS[dbType]
  const tableRef = buildTableRef(batch.schema, batch.table, dialect)
  const queries: ParameterizedQuery[] = []

  // Rename table first (if requested)
  if (batch.renameTable) {
    queries.push({
      sql: `ALTER TABLE ${tableRef} RENAME TO ${quoteIdentifier(batch.renameTable, dialect)};`,
      params: []
    })
  }

  // Set schema (if requested)
  if (batch.setSchema) {
    queries.push({
      sql: `ALTER TABLE ${tableRef} SET SCHEMA ${quoteIdentifier(batch.setSchema, dialect)};`,
      params: []
    })
  }

  // Column operations
  for (const op of batch.columnOperations) {
    queries.push({
      sql: buildAlterColumnOp(tableRef, op, dialect),
      params: []
    })
  }

  // Constraint operations
  for (const op of batch.constraintOperations) {
    queries.push({
      sql: buildAlterConstraintOp(tableRef, op, dialect),
      params: []
    })
  }

  // Index operations
  for (const op of batch.indexOperations) {
    queries.push({
      sql: buildIndexOp(batch.schema, batch.table, op, dialect, dbType),
      params: []
    })
  }

  // Table comment
  if (batch.comment !== undefined) {
    if (batch.comment === null) {
      queries.push({
        sql: `COMMENT ON TABLE ${tableRef} IS NULL;`,
        params: []
      })
    } else {
      queries.push({
        sql: `COMMENT ON TABLE ${tableRef} IS ${quoteString(batch.comment, dialect)};`,
        params: []
      })
    }
  }

  return queries
}

/**
 * Build preview SQL for CREATE TABLE (human-readable, not for execution)
 */
export function buildPreviewDDL(
  definition: TableDefinition,
  dbType: DatabaseType = 'postgresql'
): string {
  return buildCreateTable(definition, dbType).sql
}

/**
 * Build preview SQL for ALTER TABLE operations
 */
export function buildAlterPreviewDDL(
  batch: AlterTableBatch,
  dbType: DatabaseType = 'postgresql'
): string[] {
  return buildAlterTable(batch, dbType).map((q) => q.sql)
}

/**
 * Validate table definition before generating DDL
 */
export function validateTableDefinition(definition: TableDefinition): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  // Table name is required
  if (!definition.name || definition.name.trim() === '') {
    errors.push('Table name is required')
  }

  // Must have at least one column
  if (!definition.columns || definition.columns.length === 0) {
    errors.push('Table must have at least one column')
  }

  // Check for duplicate column names
  const columnNames = new Set<string>()
  for (const col of definition.columns) {
    if (!col.name || col.name.trim() === '') {
      errors.push('All columns must have a name')
    } else if (columnNames.has(col.name.toLowerCase())) {
      errors.push(`Duplicate column name: ${col.name}`)
    } else {
      columnNames.add(col.name.toLowerCase())
    }
  }

  // Check foreign key references
  for (const constraint of definition.constraints) {
    if (constraint.type === 'foreign_key') {
      if (!constraint.referencedTable) {
        errors.push('Foreign key must reference a table')
      }
      if (!constraint.referencedColumns || constraint.referencedColumns.length === 0) {
        errors.push('Foreign key must reference columns')
      }
      if (constraint.columns.length !== constraint.referencedColumns?.length) {
        errors.push('Foreign key column count must match referenced columns')
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}
