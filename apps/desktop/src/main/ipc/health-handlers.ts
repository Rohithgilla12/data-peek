import { ipcMain } from 'electron'
import type { ConnectionConfig, IpcResponse } from '@shared/index'
import { getAdapter } from '../db-adapter'
import { createLogger } from '../lib/logger'

const log = createLogger('health-handlers')

export function registerHealthHandlers(): void {
  ipcMain.handle('db:active-queries', async (_, config: ConnectionConfig) => {
    try {
      const adapter = getAdapter(config)
      const queries = await adapter.getActiveQueries(config)
      return { success: true, data: queries } as IpcResponse<typeof queries>
    } catch (error) {
      log.error('Failed to get active queries:', error)
      return { success: false, error: String(error) } as IpcResponse<never>
    }
  })

  ipcMain.handle('db:table-sizes', async (_, config: ConnectionConfig, schema?: string) => {
    try {
      const adapter = getAdapter(config)
      const result = await adapter.getTableSizes(config, schema)
      return { success: true, data: result } as IpcResponse<typeof result>
    } catch (error) {
      log.error('Failed to get table sizes:', error)
      return { success: false, error: String(error) } as IpcResponse<never>
    }
  })

  ipcMain.handle('db:cache-stats', async (_, config: ConnectionConfig) => {
    try {
      const adapter = getAdapter(config)
      const stats = await adapter.getCacheStats(config)
      return { success: true, data: stats } as IpcResponse<typeof stats>
    } catch (error) {
      log.error('Failed to get cache stats:', error)
      return { success: false, error: String(error) } as IpcResponse<never>
    }
  })

  ipcMain.handle('db:locks', async (_, config: ConnectionConfig) => {
    try {
      const adapter = getAdapter(config)
      const locks = await adapter.getLocks(config)
      return { success: true, data: locks } as IpcResponse<typeof locks>
    } catch (error) {
      log.error('Failed to get locks:', error)
      return { success: false, error: String(error) } as IpcResponse<never>
    }
  })

  ipcMain.handle('db:kill-query', async (_, config: ConnectionConfig, pid: number) => {
    try {
      const adapter = getAdapter(config)
      const result = await adapter.killQuery(config, pid)
      return { success: true, data: result } as IpcResponse<typeof result>
    } catch (error) {
      log.error('Failed to kill query:', error)
      return { success: false, error: String(error) } as IpcResponse<never>
    }
  })
}
