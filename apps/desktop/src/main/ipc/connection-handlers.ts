import { ipcMain } from 'electron'
import type { ConnectionConfig } from '@shared/index'
import type { DpStorage } from '../storage'
import { windowManager } from '../window-manager'
import { closePgPool } from '../adapters/pg-pool-manager'
import { invalidateSchemaCache } from '../schema-cache'

/**
 * Register connection CRUD handlers
 */
export function registerConnectionHandlers(
  store: DpStorage<{ connections: ConnectionConfig[] }>
): void {
  // List all connections
  ipcMain.handle('connections:list', () => {
    try {
      const connections = store.get('connections', [])
      return { success: true, data: connections }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Add a new connection
  ipcMain.handle('connections:add', (_, connection: ConnectionConfig) => {
    try {
      const connections = store.get('connections', [])
      connections.push(connection)
      store.set('connections', connections)
      // Broadcast to all windows that connections have changed
      windowManager.broadcastToAll('connections:updated')
      return { success: true, data: connection }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Update an existing connection
  ipcMain.handle('connections:update', async (_, connection: ConnectionConfig) => {
    try {
      const connections = store.get('connections', [])
      const index = connections.findIndex((c) => c.id === connection.id)
      if (index === -1) {
        return { success: false, error: 'Connection not found' }
      }
      const previous = connections[index]
      connections[index] = connection
      store.set('connections', connections)
      // Drop pooled clients/cache that may now be pointing at stale host/port/credentials.
      if (previous.dbType === 'postgresql') {
        await closePgPool(previous)
      }
      invalidateSchemaCache(previous)
      windowManager.broadcastToAll('connections:updated')
      return { success: true, data: connection }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Delete a connection
  ipcMain.handle('connections:delete', async (_, id: string) => {
    try {
      const connections = store.get('connections', [])
      const removed = connections.find((c) => c.id === id)
      const filtered = connections.filter((c) => c.id !== id)
      store.set('connections', filtered)
      if (removed) {
        if (removed.dbType === 'postgresql') {
          await closePgPool(removed)
        }
        invalidateSchemaCache(removed)
      }
      windowManager.broadcastToAll('connections:updated')
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })
}
