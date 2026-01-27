import { ipcMain } from 'electron'
import { getAdapter } from '../db-adapter'
import type { DpStorage } from '../storage'
import type { ConnectionConfig, BackupOptions, RestoreOptions } from '@shared/index'

export function registerBackupHandlers(
  connectionsStore: DpStorage<{ connections: ConnectionConfig[] }>
): void {
  // Check if tools are available for the connection's database type
  ipcMain.handle('backup:check-tools', async (_, connectionId: string) => {
    try {
      const connections = connectionsStore.get('connections', [])
      const connection = connections.find((c) => c.id === connectionId)

      if (!connection) {
        return { success: false, error: 'Connection not found' }
      }

      const adapter = getAdapter(connection)
      if (!adapter.checkTools) {
        return {
          success: true,
          data: { available: false, error: 'Backup/Restore not supported for this database type' }
        }
      }

      const status = await adapter.checkTools()
      return { success: true, data: status }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Start backup
  ipcMain.handle(
    'backup:start',
    async (_, { connectionId, options }: { connectionId: string; options: BackupOptions }) => {
      try {
        const connections = connectionsStore.get('connections', [])
        const connection = connections.find((c) => c.id === connectionId)

        if (!connection) {
          return { success: false, error: 'Connection not found' }
        }

        const adapter = getAdapter(connection)
        if (!adapter.backup) {
          return { success: false, error: 'Backup not supported for this database type' }
        }

        await adapter.backup(connection, options)
        return { success: true }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Start restore
  ipcMain.handle(
    'restore:start',
    async (_, { connectionId, options }: { connectionId: string; options: RestoreOptions }) => {
      try {
        const connections = connectionsStore.get('connections', [])
        const connection = connections.find((c) => c.id === connectionId)

        if (!connection) {
          return { success: false, error: 'Connection not found' }
        }

        const adapter = getAdapter(connection)
        if (!adapter.restore) {
          return { success: false, error: 'Restore not supported for this database type' }
        }

        await adapter.restore(connection, options)
        return { success: true }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )
}
