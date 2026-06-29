import { ipcMain } from 'electron'
import { capQueryHistoryPerConnection, type QueryHistoryEntry } from '@shared/index'
import type { DpStorage } from '../storage'

/**
 * Register query history CRUD handlers.
 *
 * History is persisted to disk via electron-store (the same backing used for
 * saved queries and snippets) so it survives app restarts. localStorage in the
 * renderer is not reliable for this — Chromium can evict it between launches.
 *
 * Entries are stored newest-first in a single array and capped per connection,
 * so the renderer can filter by `connectionId` at read time.
 */
export function registerQueryHistoryHandlers(
  store: DpStorage<{ queryHistory: QueryHistoryEntry[] }>
): void {
  // List all history entries (newest first)
  ipcMain.handle('query-history:list', () => {
    try {
      const queryHistory = store.get('queryHistory', [])
      return { success: true, data: queryHistory }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Add a new history entry
  ipcMain.handle('query-history:add', (_, entry: QueryHistoryEntry) => {
    try {
      const queryHistory = store.get('queryHistory', [])
      const updated = capQueryHistoryPerConnection([entry, ...queryHistory])
      store.set('queryHistory', updated)
      return { success: true, data: entry }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Remove a single history entry by id
  ipcMain.handle('query-history:remove', (_, id: string) => {
    try {
      const queryHistory = store.get('queryHistory', [])
      const filtered = queryHistory.filter((h) => h.id !== id)
      store.set('queryHistory', filtered)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Clear history. When a connectionId is provided, only that connection's
  // entries are removed; otherwise all history is cleared.
  ipcMain.handle('query-history:clear', (_, connectionId?: string) => {
    try {
      if (connectionId) {
        const queryHistory = store.get('queryHistory', [])
        const filtered = queryHistory.filter((h) => h.connectionId !== connectionId)
        store.set('queryHistory', filtered)
      } else {
        store.set('queryHistory', [])
      }
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })
}
