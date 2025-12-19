import { ipcMain, BrowserWindow } from 'electron'
import { getAdapter } from '../db-adapter'
import { toolManager } from '../tool-manager'
import type { DpStorage } from '../storage'
import type { ConnectionConfig, ToolDownloadProgress } from '@shared/index'

export function registerToolHandlers(
  connectionsStore: DpStorage<{ connections: ConnectionConfig[] }>
): void {
  ipcMain.handle('tools:get-server-version', async (_, connectionId: string) => {
    try {
      const connections = connectionsStore.get('connections', [])
      const connection = connections.find((c) => c.id === connectionId)

      if (!connection) {
        return { success: false, error: 'Connection not found' }
      }

      if (connection.dbType !== 'postgresql') {
        return { success: false, error: 'Server version detection only supported for PostgreSQL' }
      }

      const adapter = getAdapter(connection)
      if (!adapter.getServerVersion) {
        return { success: false, error: 'Server version detection not available' }
      }

      const version = await adapter.getServerVersion(connection)
      return { success: true, data: version }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('tools:check-compatibility', async (_, connectionId: string) => {
    try {
      const connections = connectionsStore.get('connections', [])
      const connection = connections.find((c) => c.id === connectionId)

      if (!connection) {
        return { success: false, error: 'Connection not found' }
      }

      if (connection.dbType !== 'postgresql') {
        return { success: false, error: 'Version compatibility only supported for PostgreSQL' }
      }

      const adapter = getAdapter(connection)

      let serverVersion: import('@shared/index').PostgresVersion | null = null
      if (adapter.getServerVersion) {
        serverVersion = await adapter.getServerVersion(connection)
      }

      if (!adapter.checkToolsWithVersion) {
        return { success: false, error: 'Version compatibility check not available' }
      }

      const compatibility = await adapter.checkToolsWithVersion(serverVersion ?? undefined)
      return { success: true, data: compatibility }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('tools:get-managed-versions', async () => {
    try {
      const versions = toolManager.getInstalledManagedVersions()
      return { success: true, data: versions }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('tools:get-supported-versions', async () => {
    try {
      const versions = toolManager.getSupportedVersions()
      return { success: true, data: versions }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('tools:download', async (event, majorVersion: number) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender)

      await toolManager.downloadTools(majorVersion, (progress: ToolDownloadProgress) => {
        window?.webContents.send('tools:download-progress', {
          majorVersion,
          ...progress
        })
      })

      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('tools:delete-version', async (_, majorVersion: number) => {
    try {
      await toolManager.deleteManagedVersion(majorVersion)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })
}
