import type { DatabaseAdapter } from './db-adapter'
import type { ConnectionConfig, BatchInsertOptions, BatchInsertResult } from '@shared/index'
import { quoteIdentifier } from './sql-utils'

type ProgressCallback = (inserted: number, total: number, batch: number, totalBatches: number) => void

const IDENTIFIER_QUOTES: Record<string, string> = {
  postgresql: '"',
  mysql: '`',
  sqlite: '"',
  mssql: '['
}

function quoteId(name: string, dbType: string): string {
  return quoteIdentifier(name, IDENTIFIER_QUOTES[dbType] ?? '"')
}

function buildTableRef(schema: string, table: string, dbType: string): string {
  const quoted = quoteId(table, dbType)
  if (schema && schema !== 'public' && schema !== 'main' && schema !== 'dbo') {
    return `${quoteId(schema, dbType)}.${quoted}`
  }
  return quoted
}

function buildPlaceholders(dbType: string, colCount: number, rowIndex: number): string {
  if (dbType === 'postgresql') {
    const base = rowIndex * colCount
    return Array.from({ length: colCount }, (_, i) => `$${base + i + 1}`).join(', ')
  }
  if (dbType === 'mssql') {
    const base = rowIndex * colCount
    return Array.from({ length: colCount }, (_, i) => `@p${base + i + 1}`).join(', ')
  }
  return Array.from({ length: colCount }, () => '?').join(', ')
}

function buildInsertSql(
  dbType: string,
  tableRef: string,
  columns: string[],
  rows: unknown[][],
  onConflict: BatchInsertOptions['onConflict'],
  primaryKeyColumns: string[]
): string {
  const quotedCols = columns.map((c) => quoteId(c, dbType)).join(', ')

  const valueClauses = rows
    .map((_, rowIdx) => `(${buildPlaceholders(dbType, columns.length, rowIdx)})`)
    .join(', ')

  let sql = `INSERT INTO ${tableRef} (${quotedCols}) VALUES ${valueClauses}`

  if (onConflict === 'skip') {
    if (dbType === 'postgresql' || dbType === 'sqlite') {
      sql += ' ON CONFLICT DO NOTHING'
    } else if (dbType === 'mysql') {
      sql = sql.replace('INSERT INTO', 'INSERT IGNORE INTO')
    }
  } else if (onConflict === 'update' && primaryKeyColumns.length > 0) {
    if (dbType === 'postgresql') {
      const pkList = primaryKeyColumns.map((c) => quoteId(c, dbType)).join(', ')
      const updateCols = columns
        .filter((c) => !primaryKeyColumns.includes(c))
        .map((c) => `${quoteId(c, dbType)} = EXCLUDED.${quoteId(c, dbType)}`)
        .join(', ')
      if (updateCols) {
        sql += ` ON CONFLICT (${pkList}) DO UPDATE SET ${updateCols}`
      } else {
        sql += ` ON CONFLICT (${pkList}) DO NOTHING`
      }
    } else if (dbType === 'mysql') {
      const updateCols = columns
        .filter((c) => !primaryKeyColumns.includes(c))
        .map((c) => `${quoteId(c, dbType)} = VALUES(${quoteId(c, dbType)})`)
        .join(', ')
      if (updateCols) {
        sql += ` ON DUPLICATE KEY UPDATE ${updateCols}`
      }
    } else if (dbType === 'sqlite') {
      const pkList = primaryKeyColumns.map((c) => quoteId(c, dbType)).join(', ')
      const updateCols = columns
        .filter((c) => !primaryKeyColumns.includes(c))
        .map((c) => `${quoteId(c, dbType)} = EXCLUDED.${quoteId(c, dbType)}`)
        .join(', ')
      if (updateCols) {
        sql += ` ON CONFLICT (${pkList}) DO UPDATE SET ${updateCols}`
      } else {
        sql += ` ON CONFLICT (${pkList}) DO NOTHING`
      }
    }
  }

  return sql
}

let cancelRequested = false

export function requestCancelBatchInsert(): void {
  cancelRequested = true
}

export function resetCancelBatchInsert(): void {
  cancelRequested = false
}

export async function batchInsert(
  adapter: DatabaseAdapter,
  config: ConnectionConfig,
  rows: unknown[][],
  options: BatchInsertOptions,
  batchSize: number,
  onProgress?: ProgressCallback
): Promise<BatchInsertResult> {
  const result: BatchInsertResult = { rowsInserted: 0, rowsSkipped: 0, rowsFailed: 0 }

  if (rows.length === 0) return result

  const dbType = adapter.dbType
  const tableRef = buildTableRef(options.schema, options.table, dbType)
  const primaryKeyColumns = options.primaryKeyColumns ?? []

  const totalBatches = Math.ceil(rows.length / batchSize)

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    if (cancelRequested) break

    const batchRows = rows.slice(batchIdx * batchSize, (batchIdx + 1) * batchSize)
    const params: unknown[] = batchRows.flat()

    const sql = buildInsertSql(
      dbType,
      tableRef,
      options.columns,
      batchRows,
      options.onConflict,
      primaryKeyColumns
    )

    try {
      const execResult = await adapter.execute(config, sql, params)
      const affected = execResult.rowCount ?? batchRows.length

      if (options.onConflict === 'skip') {
        result.rowsInserted += affected
        result.rowsSkipped += batchRows.length - affected
      } else {
        result.rowsInserted += affected
      }
    } catch (err) {
      if (options.onConflict === 'error') {
        throw err
      }
      result.rowsFailed += batchRows.length
    }

    onProgress?.(
      result.rowsInserted,
      rows.length,
      batchIdx + 1,
      totalBatches
    )
  }

  return result
}
