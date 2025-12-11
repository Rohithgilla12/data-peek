import { ipcMain, BrowserWindow } from 'electron'

export function registerWindowHandlers(): void {
  ipcMain.handle('minimize-window', async (): Promise<void> => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })

  ipcMain.handle('maximize-window', async (): Promise<void> => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (!focusedWindow) return

    focusedWindow.isMaximized() ? focusedWindow.unmaximize() : focusedWindow.maximize()
  })

  ipcMain.handle('close-window', async (): Promise<void> => {
    BrowserWindow.getFocusedWindow()?.close()
  })
}
