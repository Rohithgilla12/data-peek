/**
 * Database-agnostic SQL builder for edit operations
 * Generates parameterized queries to prevent SQL injection
 */

import type {
  EditOperation,
  RowUpdate,
  RowInsert,
  RowDelete,
  EditContext,
  ParameterizedQuery,
  DatabaseType
} from '@data-peek/shared'
import { quoteIdentifier as quoteIdentifierUtil } from './sql-utils'

/**
 * SQL dialect configuration
 */
interface SqlDialect {
  /** Parameter placeholder format: $1 (pg), ? (mysql/sqlite) */
  parameterPlaceholder: (index: number) => string
  /** Identifier quote character: " (pg/sqlite), ` (mysql) */
  identifierQuote: string
  /** Whether to use RETURNING clause */
  supportsReturning: boolean
}

const DIALECTS: Record<DatabaseType, SqlDialect> = {
  postgresql: {
    parameterPlaceholder: (i) => `$${i}`,
    identifierQuote: '"',
    supportsReturning: true
  },
  mysql: {
    parameterPlaceholder: () => '?',
    identifierQuote: '`',
    supportsReturning: false
  },
  sqlite: {
    parameterPlaceholder: () => '?',
    identifierQuote: '"',
    supportsReturning: true // SQLite 3.35+
  },
  mssql: {
    parameterPlaceholder: (i) => `@p${i}`,
    identifierQuote: '[',
    supportsReturning: false // MSSQL uses OUTPUT clause instead
  }
}

/**
 * Quote an identifier (table name, column name) for the given dialect
 */
function quoteIdentifier(name: string, dialect: SqlDialect): string {
  return quoteIdentifierUtil(name, dialect.identifierQuote)
}

/**
 * Build fully qualified table name with schema
 */
function buildTableRef(context: EditContext, dialect: SqlDialect): string {
  const table = quoteIdentifier(context.table, dialect)
  // PostgreSQL uses schema.table, MySQL uses database.table, MSSQL uses schema.table (default 'dbo')
  if (
    context.schema &&
    context.schema !== 'public' &&
    context.schema !== 'main' &&
    context.schema !== 'dbo'
  ) {
    return `${quoteIdentifier(context.schema, dialect)}.${table}`
  }
  return table
}

/**
 * Serialize a value for SQL
 * Handles special types like JSON, arrays, etc.
 */
function serializeValue(value: unknown, dataType: string): unknown {
  if (value === null || value === undefined) {
    return null
  }

  // Handle JSON/JSONB - stringify objects
  if ((dataType === 'json' || dataType === 'jsonb') && typeof value === 'object') {
    return JSON.stringify(value)
  }

  // Handle arrays - PostgreSQL array syntax
  if (dataType.endsWith('[]') && Array.isArray(value)) {
    return value
  }

  // Handle booleans
  if (dataType === 'boolean' || dataType === 'bool') {
    return Boolean(value)
  }

  return value
}

/**
 * Build UPDATE statement
 */
function buildUpdate(
  operation: RowUpdate,
  context: EditContext,
  dialect: SqlDialect
): ParameterizedQuery {
  const params: unknown[] = []
  let paramIndex = 1

  const tableRef = buildTableRef(context, dialect)

  // SET clause
  const setClauses = operation.changes.map((change) => {
    const col = quoteIdentifier(change.column, dialect)
    const placeholder = dialect.parameterPlaceholder(paramIndex++)
    params.push(serializeValue(change.newValue, change.dataType))
    return `${col} = ${placeholder}`
  })

  // WHERE clause (primary keys)
  const whereClauses = operation.primaryKeys.map((pk) => {
    const col = quoteIdentifier(pk.column, dialect)
    const placeholder = dialect.parameterPlaceholder(paramIndex++)
    params.push(serializeValue(pk.value, pk.dataType))
    return `${col} = ${placeholder}`
  })

  let sql = `UPDATE ${tableRef} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`

  if (dialect.supportsReturning) {
    sql += ' RETURNING *'
  }

  return { sql, params }
}

/**
 * Build INSERT statement
 */
function buildInsert(
  operation: RowInsert,
  context: EditContext,
  dialect: SqlDialect
): ParameterizedQuery {
  const params: unknown[] = []
  let paramIndex = 1

  const tableRef = buildTableRef(context, dialect)

  // Filter out null/undefined values for columns that have defaults
  const entries = Object.entries(operation.values).filter(([, value]) => value !== undefined)

  const columns = entries.map(([col]) => quoteIdentifier(col, dialect))
  const placeholders = entries.map(([col, value]) => {
    const colInfo = operation.columns.find((c) => c.name === col)
    const dataType = colInfo?.dataType || 'text'
    params.push(serializeValue(value, dataType))
    return dialect.parameterPlaceholder(paramIndex++)
  })

  let sql = `INSERT INTO ${tableRef} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`

  if (dialect.supportsReturning) {
    sql += ' RETURNING *'
  }

  return { sql, params }
}

/**
 * Build DELETE statement
 */
function buildDelete(
  operation: RowDelete,
  context: EditContext,
  dialect: SqlDialect
): ParameterizedQuery {
  const params: unknown[] = []
  let paramIndex = 1

  const tableRef = buildTableRef(context, dialect)

  // WHERE clause (primary keys)
  const whereClauses = operation.primaryKeys.map((pk) => {
    const col = quoteIdentifier(pk.column, dialect)
    const placeholder = dialect.parameterPlaceholder(paramIndex++)
    params.push(serializeValue(pk.value, pk.dataType))
    return `${col} = ${placeholder}`
  })

  let sql = `DELETE FROM ${tableRef} WHERE ${whereClauses.join(' AND ')}`

  if (dialect.supportsReturning) {
    sql += ' RETURNING *'
  }

  return { sql, params }
}

/**
 * Build a parameterized SQL query for an edit operation
 */
export function buildQuery(
  operation: EditOperation,
  context: EditContext,
  dbType: DatabaseType = 'postgresql'
): ParameterizedQuery {
  const dialect = DIALECTS[dbType]

  switch (operation.type) {
    case 'update':
      return buildUpdate(operation, context, dialect)
    case 'insert':
      return buildInsert(operation, context, dialect)
    case 'delete':
      return buildDelete(operation, context, dialect)
    default:
      throw new Error(`Unknown operation type: ${(operation as EditOperation).type}`)
  }
}

/**
 * Build multiple queries for a batch of operations
 */
export function buildBatchQueries(
  operations: EditOperation[],
  context: EditContext,
  dbType: DatabaseType = 'postgresql'
): ParameterizedQuery[] {
  return operations.map((op) => buildQuery(op, context, dbType))
}

/**
 * Generate human-readable SQL for preview (NOT for execution)
 * This shows the actual values for user review
 */
export function buildPreviewSql(
  operation: EditOperation,
  context: EditContext,
  dbType: DatabaseType = 'postgresql'
): string {
  const { sql, params } = buildQuery(operation, context, dbType)

  // Replace placeholders with actual values (for preview only)
  let preview = sql
  params.forEach((param, index) => {
    let placeholder: string
    if (dbType === 'postgresql') {
      placeholder = `$${index + 1}`
    } else if (dbType === 'mssql') {
      placeholder = `@p${index + 1}`
    } else {
      placeholder = '?'
    }

    let displayValue: string
    if (param === null) {
      displayValue = 'NULL'
    } else if (typeof param === 'string') {
      // Escape single quotes and wrap in quotes
      displayValue = `'${param.replace(/'/g, "''")}'`
    } else if (typeof param === 'boolean') {
      displayValue = param ? 'TRUE' : 'FALSE'
    } else if (typeof param === 'object') {
      displayValue = `'${JSON.stringify(param).replace(/'/g, "''")}'`
    } else {
      displayValue = String(param)
    }

    preview = preview.replace(placeholder, displayValue)
  })

  return preview
}

/**
 * Validate that we can generate valid SQL for an operation
 */
export function validateOperation(operation: EditOperation): { valid: boolean; error?: string } {
  // Check for primary key on UPDATE/DELETE
  if (operation.type === 'update' || operation.type === 'delete') {
    if (operation.primaryKeys.length === 0) {
      return {
        valid: false,
        error: 'Cannot update or delete rows without a primary key'
      }
    }
  }

  // Check for empty changes on UPDATE
  if (operation.type === 'update' && operation.changes.length === 0) {
    return {
      valid: false,
      error: 'No changes to save'
    }
  }

  // Check for empty values on INSERT
  if (operation.type === 'insert') {
    const nonNullValues = Object.values(operation.values).filter(
      (v) => v !== null && v !== undefined
    )
    if (nonNullValues.length === 0) {
      return {
        valid: false,
        error: 'Cannot insert an empty row'
      }
    }
  }

  return { valid: true }
}
