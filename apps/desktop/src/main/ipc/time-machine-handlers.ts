import { ipcMain } from 'electron'
import type { TimeMachineCapturePayload } from '@shared/index'
import type { TimeMachineStorage } from '../time-machine-storage'
import { fingerprintQuery } from '../lib/query-fingerprint'

/**
 * Register Time Machine result-snapshot handlers.
 *
 * The renderer always sends raw SQL; fingerprinting happens here so
 * query-fingerprint.ts stays in the main process. Runs are keyed by
 * (connectionId, fingerprint) where the fingerprint is the full
 * normalized-SQL string — literal changes share a timeline.
 */
export function registerTimeMachineHandlers(storage: TimeMachineStorage | null): void {
  if (!storage) return

  ipcMain.handle('time-machine:capture', (_, payload: TimeMachineCapturePayload) => {
    try {
      if (
        !payload ||
        typeof payload.connectionId !== 'string' ||
        payload.connectionId.length === 0 ||
        typeof payload.sql !== 'string' ||
        payload.sql.length === 0 ||
        !Array.isArray(payload.rows)
      ) {
        return { success: false, error: 'Invalid capture payload' }
      }
      const fingerprint = fingerprintQuery(payload.sql)
      const meta = storage.insertRun(payload, fingerprint)
      return { success: true, data: meta }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('time-machine:list-runs', (_, args: { connectionId: string; sql: string }) => {
    try {
      const fingerprint = fingerprintQuery(args.sql)
      const runs = storage.listRuns(args.connectionId, fingerprint)
      return { success: true, data: { fingerprint, runs } }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('time-machine:get-snapshot', (_, id: string) => {
    try {
      const snapshot = storage.getSnapshot(id)
      return { success: true, data: snapshot }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('time-machine:delete-run', (_, id: string) => {
    try {
      storage.deleteRun(id)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('time-machine:clear-query', (_, args: { connectionId: string; sql: string }) => {
    try {
      const fingerprint = fingerprintQuery(args.sql)
      storage.clearQuery(args.connectionId, fingerprint)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('time-machine:clear-all', (_, connectionId?: string) => {
    try {
      storage.clearAll(connectionId)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('time-machine:stats', () => {
    try {
      const stats = storage.stats()
      return { success: true, data: stats }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })
}
