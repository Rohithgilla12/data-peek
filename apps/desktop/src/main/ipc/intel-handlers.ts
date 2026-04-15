import { ipcMain } from 'electron'
import type {
  ConnectionConfig,
  IpcResponse,
  SchemaIntelCheckId,
  SchemaIntelReport
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
