import { ipcMain } from 'electron'
import type { ConnectionConfig } from '@shared/index'
import type { DpStorage } from '../storage'

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
      return { success: true, data: connection }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Update an existing connection
  ipcMain.handle('connections:update', (_, connection: ConnectionConfig) => {
    try {
      const connections = store.get('connections', [])
      const index = connections.findIndex((c) => c.id === connection.id)
      if (index === -1) {
        return { success: false, error: 'Connection not found' }
      }
      connections[index] = connection
      store.set('connections', connections)
      return { success: true, data: connection }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Delete a connection
  ipcMain.handle('connections:delete', (_, id: string) => {
    try {
      const connections = store.get('connections', [])
      const filtered = connections.filter((c) => c.id !== id)
      store.set('connections', filtered)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })
}
