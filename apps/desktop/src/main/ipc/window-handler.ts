import { ipcMain, BrowserWindow } from 'electron'

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
}
