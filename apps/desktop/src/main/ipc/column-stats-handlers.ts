import { ipcMain } from 'electron'
import { getAdapter } from '../db-adapter'
import type { ConnectionConfig, ColumnStatsRequest } from '@shared/index'
import { requireCapability } from '../lib/capability-guard'

export function registerColumnStatsHandlers(): void {
  ipcMain.handle(
    'db:column-stats',
    async (_, config: ConnectionConfig, request: ColumnStatsRequest) => {
      try {
        requireCapability(config, 'columnStats')
        const adapter = getAdapter(config)
        const stats = await adapter.getColumnStats(
          config,
          request.schema,
          request.table,
          request.column,
          request.dataType || 'text'
        )
        return { success: true, data: stats }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )
}
