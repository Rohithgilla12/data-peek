import { ipcMain } from 'electron'
import type { ConnectionConfig, CsvImportRequest, CsvImportProgress, CsvImportResult } from '@shared/index'
import { getAdapter } from '../db-adapter'
import {
  batchInsert,
  requestCancelBatchInsert,
  resetCancelBatchInsert
} from '../batch-insert'
import { createLogger } from '../lib/logger'
import { quoteIdentifier } from '../sql-utils'

const log = createLogger('import-handlers')

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

function buildCreateTableSql(
  schema: string,
  table: string,
  columns: Array<{ name: string; dataType: string; isNullable: boolean }>,
  dbType: string
): string {
  const tableRef = buildTableRef(schema, table, dbType)
  const colDefs = columns
    .map((col) => {
      const name = quoteId(col.name, dbType)
      const nullable = col.isNullable ? '' : ' NOT NULL'
      return `  ${name} ${col.dataType}${nullable}`
    })
    .join(',\n')
  return `CREATE TABLE ${tableRef} (\n${colDefs}\n)`
}

export function registerImportHandlers(): void {
  ipcMain.handle(
    'db:import-csv',
    async (
      event,
      config: ConnectionConfig,
      request: CsvImportRequest,
      rows: unknown[][]
    ) => {
      const startTime = Date.now()
      resetCancelBatchInsert()

      const dbType = config.dbType || 'postgresql'
      const adapter = getAdapter(config)

      const sendProgress = (progress: CsvImportProgress): void => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('db:import-progress', progress)
        }
      }

      sendProgress({
        phase: 'preparing',
        rowsImported: 0,
        totalRows: rows.length,
        currentBatch: 0,
        totalBatches: 0
      })

      try {
        if (request.createTable && request.tableDefinition) {
          const createSql = buildCreateTableSql(
            request.schema,
            request.table,
            request.tableDefinition.columns,
            dbType
          )
          log.debug('Creating table:', createSql)
          await adapter.execute(config, createSql, [])
        }

        if (request.options.truncateFirst) {
          const tableRef = buildTableRef(request.schema, request.table, dbType)
          const truncateSql =
            dbType === 'mssql'
              ? `TRUNCATE TABLE ${tableRef}`
              : `TRUNCATE TABLE ${tableRef}`
          await adapter.execute(config, truncateSql, [])
        }

        const mappedColumns = request.mappings
          .filter((m) => m.tableColumn !== null)
          .map((m) => m.tableColumn as string)

        const columnIndexes = request.mappings
          .filter((m) => m.tableColumn !== null)
          .map((m) => request.columns.indexOf(m.csvColumn))

        const mappedRows = rows.map((row) => columnIndexes.map((idx) => row[idx]))

        const batchSize = request.options.batchSize || 500
        const totalBatches = Math.ceil(mappedRows.length / batchSize)

        sendProgress({
          phase: 'importing',
          rowsImported: 0,
          totalRows: mappedRows.length,
          currentBatch: 0,
          totalBatches
        })

        const batchResult = await batchInsert(
          adapter,
          config,
          mappedRows,
          {
            schema: request.schema,
            table: request.table,
            columns: mappedColumns,
            onConflict: request.options.onConflict
          },
          batchSize,
          (inserted, total, batch, batches) => {
            sendProgress({
              phase: 'importing',
              rowsImported: inserted,
              totalRows: total,
              currentBatch: batch,
              totalBatches: batches
            })
          }
        )

        const durationMs = Date.now() - startTime

        sendProgress({
          phase: 'complete',
          rowsImported: batchResult.rowsInserted,
          totalRows: mappedRows.length,
          currentBatch: totalBatches,
          totalBatches
        })

        const importResult: CsvImportResult = {
          success: true,
          rowsImported: batchResult.rowsInserted,
          rowsSkipped: batchResult.rowsSkipped,
          rowsFailed: batchResult.rowsFailed,
          durationMs
        }

        return { success: true, data: importResult }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        log.error('CSV import error:', error)

        sendProgress({
          phase: 'error',
          rowsImported: 0,
          totalRows: rows.length,
          currentBatch: 0,
          totalBatches: 0,
          error: errorMessage
        })

        const importResult: CsvImportResult = {
          success: false,
          rowsImported: 0,
          rowsSkipped: 0,
          rowsFailed: rows.length,
          error: errorMessage,
          durationMs: Date.now() - startTime
        }

        return { success: true, data: importResult }
      }
    }
  )

  ipcMain.handle('db:import-cancel', async () => {
    requestCancelBatchInsert()
    return { success: true }
  })
}
