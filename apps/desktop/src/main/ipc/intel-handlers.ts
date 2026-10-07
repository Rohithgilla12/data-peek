import { ipcMain } from 'electron'
import {
  supportsSchemaIntel,
  type ConnectionConfig,
  type IpcResponse,
  type SchemaIntelCheckId,
  type SchemaIntelReport
} from '@shared/index'
import { getAdapter } from '../db-adapter'
import { createLogger } from '../lib/logger'

const log = createLogger('intel-handlers')

export function registerIntelHandlers(): void {
  ipcMain.handle(
    'intel:run',
    async (
      _,
      payload: { config: ConnectionConfig; checks?: SchemaIntelCheckId[] }
    ): Promise<IpcResponse<SchemaIntelReport>> => {
      try {
        const dbType = payload.config.dbType || 'postgresql'
        if (!supportsSchemaIntel(dbType)) {
          return {
            success: false,
            error: `Schema Intel is not available for ${dbType} connections.`
          }
        }
        const adapter = getAdapter(payload.config)
        const report = await adapter.runSchemaIntel(payload.config, payload.checks)
        return { success: true, data: report }
      } catch (error) {
        log.error('Failed to run schema intel:', error)
        return { success: false, error: String(error) }
      }
    }
  )
}
