import { ipcMain } from 'electron'
import type { ConnectionConfig, DataGenConfig, DataGenProgress, DataGenResult } from '@shared/index'
import { getAdapter } from '../db-adapter'
import { generateRows, resolveFK } from '../data-generator'
import { batchInsert, requestCancelBatchInsert, resetCancelBatchInsert } from '../batch-insert'
import { createLogger } from '../lib/logger'

const log = createLogger('data-gen-handlers')

let cancelDataGen = false

export function registerDataGenHandlers(): void {
  ipcMain.handle(
    'db:generate-data',
    async (event, connectionConfig: ConnectionConfig, genConfig: DataGenConfig) => {
      const startTime = Date.now()
      cancelDataGen = false
      resetCancelBatchInsert()

      const adapter = getAdapter(connectionConfig)

      const sendProgress = (progress: DataGenProgress): void => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('db:generate-progress', progress)
        }
      }

      sendProgress({
        phase: 'generating',
        rowsGenerated: 0,
        rowsInserted: 0,
        totalRows: genConfig.rowCount
      })

      try {
        const fkData = new Map<string, unknown[]>()

        for (const col of genConfig.columns) {
          if (col.generatorType === 'fk-reference' && col.fkTable && col.fkColumn) {
            const key = `${col.fkTable}.${col.fkColumn}`
            if (!fkData.has(key)) {
              const ids = await resolveFK(
                adapter,
                connectionConfig,
                genConfig.schema,
                col.fkTable,
                col.fkColumn
              )
              fkData.set(key, ids)
            }
          }
        }

        if (cancelDataGen) {
          const result: DataGenResult = {
            success: false,
            rowsInserted: 0,
            durationMs: Date.now() - startTime,
            error: 'Cancelled'
          }
          return { success: true, data: result }
        }

        const rows = generateRows(genConfig, fkData)

        sendProgress({
          phase: 'inserting',
          rowsGenerated: rows.length,
          rowsInserted: 0,
          totalRows: genConfig.rowCount
        })

        if (cancelDataGen) {
          const result: DataGenResult = {
            success: false,
            rowsInserted: 0,
            durationMs: Date.now() - startTime,
            error: 'Cancelled'
          }
          return { success: true, data: result }
        }

        const activeColumns = genConfig.columns.filter((c) => !c.skip).map((c) => c.columnName)

        const batchResult = await batchInsert(
          adapter,
          connectionConfig,
          rows,
          {
            schema: genConfig.schema,
            table: genConfig.table,
            columns: activeColumns,
            onConflict: 'error'
          },
          genConfig.batchSize,
          (inserted, total) => {
            sendProgress({
              phase: 'inserting',
              rowsGenerated: rows.length,
              rowsInserted: inserted,
              totalRows: total
            })
          }
        )

        const durationMs = Date.now() - startTime

        sendProgress({
          phase: 'complete',
          rowsGenerated: rows.length,
          rowsInserted: batchResult.rowsInserted,
          totalRows: genConfig.rowCount
        })

        const result: DataGenResult = {
          success: true,
          rowsInserted: batchResult.rowsInserted,
          durationMs
        }

        return { success: true, data: result }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        log.error('Data generation error:', error)

        sendProgress({
          phase: 'error',
          rowsGenerated: 0,
          rowsInserted: 0,
          totalRows: genConfig.rowCount,
          error: errorMessage
        })

        const result: DataGenResult = {
          success: false,
          rowsInserted: 0,
          durationMs: Date.now() - startTime,
          error: errorMessage
        }

        return { success: true, data: result }
      }
    }
  )

  ipcMain.handle('db:generate-cancel', async () => {
    cancelDataGen = true
    requestCancelBatchInsert()
    return { success: true }
  })

  ipcMain.handle(
    'db:generate-preview',
    async (_event, connectionConfig: ConnectionConfig, genConfig: DataGenConfig) => {
      try {
        const adapter = getAdapter(connectionConfig)
        const fkData = new Map<string, unknown[]>()

        for (const col of genConfig.columns) {
          if (col.generatorType === 'fk-reference' && col.fkTable && col.fkColumn) {
            const key = `${col.fkTable}.${col.fkColumn}`
            if (!fkData.has(key)) {
              const ids = await resolveFK(
                adapter,
                connectionConfig,
                genConfig.schema,
                col.fkTable,
                col.fkColumn
              )
              fkData.set(key, ids)
            }
          }
        }

        const previewConfig = { ...genConfig, rowCount: 5 }
        const rows = generateRows(previewConfig, fkData)

        return { success: true, data: { rows } }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        log.error('Data generation preview error:', error)
        return { success: false, error: errorMessage }
      }
    }
  )
}
