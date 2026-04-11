import { ipcMain } from 'electron'
import type { ConnectionConfig } from '@shared/index'
import {
  subscribe,
  unsubscribe,
  send,
  getChannels,
  getHistory,
  clearHistory,
  forceReconnect,
  getStatus,
  getAllStatuses
} from '../pg-notification-listener'
import { createLogger } from '../lib/logger'

const log = createLogger('pg-notify-handlers')

export function registerPgNotifyHandlers(): void {
  ipcMain.handle(
    'pg-notify:subscribe',
    async (_event, connectionId: string, config: ConnectionConfig, channel: string) => {
      try {
        await subscribe(connectionId, config, channel)
        return { success: true }
      } catch (error) {
        log.error('pg-notify:subscribe error:', error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle('pg-notify:unsubscribe', async (_event, connectionId: string, channel: string) => {
    try {
      await unsubscribe(connectionId, channel)
      return { success: true }
    } catch (error) {
      log.error('pg-notify:unsubscribe error:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(
    'pg-notify:send',
    async (_event, config: ConnectionConfig, channel: string, payload: string) => {
      try {
        await send(config, channel, payload)
        return { success: true }
      } catch (error) {
        log.error('pg-notify:send error:', error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle('pg-notify:get-channels', async (_event, connectionId: string) => {
    try {
      const channels = getChannels(connectionId)
      return { success: true, data: channels }
    } catch (error) {
      log.error('pg-notify:get-channels error:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('pg-notify:get-history', async (_event, connectionId: string, limit?: number) => {
    try {
      const events = getHistory(connectionId, limit)
      return { success: true, data: events }
    } catch (error) {
      log.error('pg-notify:get-history error:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('pg-notify:clear-history', async (_event, connectionId: string) => {
    try {
      clearHistory(connectionId)
      return { success: true }
    } catch (error) {
      log.error('pg-notify:clear-history error:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('pg-notify:reconnect', async (_event, connectionId: string) => {
    try {
      await forceReconnect(connectionId)
      return { success: true }
    } catch (error) {
      log.error('pg-notify:reconnect error:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('pg-notify:get-status', async (_event, connectionId: string) => {
    try {
      return { success: true, data: getStatus(connectionId) }
    } catch (error) {
      log.error('pg-notify:get-status error:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('pg-notify:get-all-statuses', async () => {
    try {
      return { success: true, data: getAllStatuses() }
    } catch (error) {
      log.error('pg-notify:get-all-statuses error:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}
