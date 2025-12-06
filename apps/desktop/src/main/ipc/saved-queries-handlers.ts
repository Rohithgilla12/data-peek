import { ipcMain } from 'electron'
import type { SavedQuery } from '@shared/index'
import type { DpStorage } from '../storage'

/**
 * Register saved queries CRUD handlers
 */
export function registerSavedQueriesHandlers(
  store: DpStorage<{ savedQueries: SavedQuery[] }>
): void {
  // List all saved queries
  ipcMain.handle('saved-queries:list', () => {
    try {
      const savedQueries = store.get('savedQueries', [])
      return { success: true, data: savedQueries }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Add a new saved query
  ipcMain.handle('saved-queries:add', (_, query: SavedQuery) => {
    try {
      const savedQueries = store.get('savedQueries', [])
      savedQueries.push(query)
      store.set('savedQueries', savedQueries)
      return { success: true, data: query }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Update a saved query
  ipcMain.handle(
    'saved-queries:update',
    (_, { id, updates }: { id: string; updates: Partial<SavedQuery> }) => {
      try {
        const savedQueries = store.get('savedQueries', [])
        const index = savedQueries.findIndex((q) => q.id === id)
        if (index === -1) {
          return { success: false, error: 'Saved query not found' }
        }
        savedQueries[index] = {
          ...savedQueries[index],
          ...updates,
          updatedAt: Date.now()
        }
        store.set('savedQueries', savedQueries)
        return { success: true, data: savedQueries[index] }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Delete a saved query
  ipcMain.handle('saved-queries:delete', (_, id: string) => {
    try {
      const savedQueries = store.get('savedQueries', [])
      const filtered = savedQueries.filter((q) => q.id !== id)
      store.set('savedQueries', filtered)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Increment usage count for a saved query
  ipcMain.handle('saved-queries:increment-usage', (_, id: string) => {
    try {
      const savedQueries = store.get('savedQueries', [])
      const index = savedQueries.findIndex((q) => q.id === id)
      if (index === -1) {
        return { success: false, error: 'Saved query not found' }
      }
      savedQueries[index] = {
        ...savedQueries[index],
        usageCount: savedQueries[index].usageCount + 1,
        lastUsedAt: Date.now()
      }
      store.set('savedQueries', savedQueries)
      return { success: true, data: savedQueries[index] }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })
}
