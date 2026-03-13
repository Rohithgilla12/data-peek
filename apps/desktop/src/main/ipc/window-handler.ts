import { ipcMain, BrowserWindow } from 'electron'
import { windowManager } from '../window-manager'

export function registerWindowHandlers(): void {
  ipcMain.handle('minimize-window', () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })

  ipcMain.handle('maximize-window', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow()

    if (focusedWindow?.isMaximized()) {
      focusedWindow.unmaximize()
    } else {
      focusedWindow?.maximize()
    }
  })

  ipcMain.handle('close-window', () => {
    BrowserWindow.getFocusedWindow()?.close()
  })

  ipcMain.on('window:set-connection-info', (event, connectionName: string | null) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      windowManager.setWindowConnectionName(win.id, connectionName)
    }
  })
}
