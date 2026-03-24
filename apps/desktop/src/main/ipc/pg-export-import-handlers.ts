import { ipcMain, dialog } from 'electron'
import type {
  ConnectionConfig,
  PgExportOptions,
  PgImportOptions,
  PgExportProgress,
  PgImportProgress
} from '@shared/index'
import { pgExport } from '../pg-export'
import { pgImport } from '../pg-import'
import { createLogger } from '../lib/logger'

const log = createLogger('pg-export-import-handlers')

let exportCancelToken = { cancelled: false }
let importCancelToken = { cancelled: false }

export function registerPgExportImportHandlers(): void {
  // ── Export ──────────────────────────────────────────────────────────────
  ipcMain.handle(
    'db:pg-export',
    async (event, config: ConnectionConfig, options: PgExportOptions) => {
      exportCancelToken = { cancelled: false }

      // Show save dialog
      const result = await dialog.showSaveDialog({
        title: 'Export Database',
        defaultPath: `${config.database}_dump.sql`,
        filters: [
          { name: 'SQL Files', extensions: ['sql'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Export cancelled' }
      }

      const filePath = result.filePath

      const sendProgress = (progress: PgExportProgress): void => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('db:pg-export-progress', progress)
        }
      }

      try {
        const exportResult = await pgExport(
          config,
          options,
          filePath,
          sendProgress,
          exportCancelToken
        )
        return { success: exportResult.success, data: exportResult, error: exportResult.error }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.error('Export handler error:', error)
        return { success: false, error: message }
      }
    }
  )

  ipcMain.handle('db:pg-export-cancel', async () => {
    exportCancelToken.cancelled = true
    return { success: true }
  })

  // ── Import ──────────────────────────────────────────────────────────────
  ipcMain.handle(
    'db:pg-import',
    async (event, config: ConnectionConfig, options: PgImportOptions) => {
      importCancelToken = { cancelled: false }

      // Show open dialog
      const result = await dialog.showOpenDialog({
        title: 'Import SQL File',
        filters: [
          { name: 'SQL Files', extensions: ['sql'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Import cancelled' }
      }

      const filePath = result.filePaths[0]

      const sendProgress = (progress: PgImportProgress): void => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('db:pg-import-progress', progress)
        }
      }

      try {
        const importResult = await pgImport(
          config,
          filePath,
          options,
          sendProgress,
          importCancelToken
        )
        return {
          success: importResult.success,
          data: importResult,
          error: importResult.errors?.[0]?.error
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.error('Import handler error:', error)
        return { success: false, error: message }
      }
    }
  )

  ipcMain.handle('db:pg-import-cancel', async () => {
    importCancelToken.cancelled = true
    return { success: true }
  })
}
