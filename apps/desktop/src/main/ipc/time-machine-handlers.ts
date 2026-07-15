import { ipcMain } from 'electron'
import type { TimeMachineCapturePayload } from '@shared/index'
import type { TimeMachineStorage } from '../time-machine-storage'
import { fingerprintQuery } from '../lib/query-fingerprint'

function isValidCapturePayload(payload: unknown): payload is TimeMachineCapturePayload {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as Record<string, unknown>

  if (typeof p.connectionId !== 'string' || p.connectionId.length === 0) return false
  if (typeof p.sql !== 'string' || p.sql.length === 0) return false
  if (typeof p.capturedAt !== 'number' || !Number.isFinite(p.capturedAt)) return false
  if (typeof p.durationMs !== 'number' || !Number.isFinite(p.durationMs) || p.durationMs < 0)
    return false
  if (typeof p.rowCount !== 'number' || !Number.isFinite(p.rowCount) || p.rowCount < 0) return false
  if (typeof p.truncated !== 'boolean') return false
  if (p.keyStrategy !== 'primary_key' && p.keyStrategy !== 'row_position') return false
  if (!Array.isArray(p.keyColumns) || p.keyColumns.some((c) => typeof c !== 'string')) return false
  if (
    !Array.isArray(p.columns) ||
    p.columns.some(
      (c) =>
        !c ||
        typeof c !== 'object' ||
        typeof (c as Record<string, unknown>).name !== 'string' ||
        typeof (c as Record<string, unknown>).dataType !== 'string'
    )
  )
    return false
  if (!Array.isArray(p.rows) || p.rows.some((row) => !Array.isArray(row))) return false

  return true
}

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
      if (!isValidCapturePayload(payload)) {
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
