import { ipcMain, BrowserWindow } from 'electron'
import type { StepSessionRegistry } from '../step-session'
import type { ConnectionConfig, StartStepRequest } from '@shared/index'

export function registerStepHandlers(registry: StepSessionRegistry): void {
  ipcMain.handle(
    'step:start',
    async (event, { config, request }: { config: ConnectionConfig; request: StartStepRequest }) => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender)
        const windowId = win?.id ?? -1
        const data = await registry.start({
          config,
          tabId: request.tabId,
          windowId,
          sql: request.sql,
          inTransaction: request.inTransaction
        })
        return { success: true, data }
      } catch (error: unknown) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )

  ipcMain.handle('step:next', async (_event, sessionId: string) => {
    try {
      const data = await registry.next(sessionId)
      return { success: true, data }
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('step:skip', async (_event, sessionId: string) => {
    try {
      const data = await registry.skip(sessionId)
      return { success: true, data }
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('step:continue', async (_event, sessionId: string) => {
    try {
      const data = await registry.continue(sessionId)
      return { success: true, data }
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle('step:retry', async (_event, sessionId: string) => {
    try {
      const data = await registry.retry(sessionId)
      return { success: true, data }
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  ipcMain.handle(
    'step:set-breakpoints',
    async (
      _event,
      { sessionId, breakpoints }: { sessionId: string; breakpoints: number[] }
    ) => {
      try {
        await registry.setBreakpoints(sessionId, breakpoints)
        return { success: true }
      } catch (error: unknown) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )

  ipcMain.handle('step:stop', async (_event, sessionId: string) => {
    try {
      const data = await registry.stop(sessionId)
      return { success: true, data }
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })
}
