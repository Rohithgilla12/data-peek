import { ipcMain } from 'electron'
import type { ConnectionConfig, SchemaInfo } from '@shared/index'
import { startMCPServer, stopMCPServer, getMCPServerStatus, updateMCPSchemas } from '../mcp-server'
import { createLogger } from '../lib/logger'

const log = createLogger('mcp-handlers')

export function registerMCPHandlers(): void {
  ipcMain.handle(
    'mcp:start',
    async (
      _,
      {
        connectionConfig,
        schemas,
        port
      }: { connectionConfig: ConnectionConfig; schemas: SchemaInfo[]; port?: number }
    ) => {
      try {
        const result = await startMCPServer(connectionConfig, schemas, port)
        return { success: result.success, data: { port: result.port }, error: result.error }
      } catch (error) {
        log.error('Failed to start MCP server:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to start MCP server'
        }
      }
    }
  )

  ipcMain.handle('mcp:stop', async () => {
    try {
      const result = await stopMCPServer()
      return { success: result.success, error: result.error }
    } catch (error) {
      log.error('Failed to stop MCP server:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop MCP server'
      }
    }
  })

  ipcMain.handle('mcp:status', () => {
    try {
      const status = getMCPServerStatus()
      return { success: true, data: status }
    } catch (error) {
      log.error('Failed to get MCP status:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get MCP status'
      }
    }
  })

  ipcMain.handle('mcp:update-schemas', async (_, { schemas }: { schemas: SchemaInfo[] }) => {
    try {
      updateMCPSchemas(schemas)
      return { success: true }
    } catch (error) {
      log.error('Failed to update MCP schemas:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update MCP schemas'
      }
    }
  })

  log.debug('MCP handlers registered')
}
