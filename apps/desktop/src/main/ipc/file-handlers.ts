import { dialog, ipcMain } from 'electron'

export function registerFileHandlers(): void {
  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(
    'save-file-dialog',
    async (_, options?: { defaultPath?: string; filters?: Electron.FileFilter[] }) => {
      const result = await dialog.showSaveDialog({
        defaultPath: options?.defaultPath,
        filters: options?.filters
      })
      return result.canceled ? null : result.filePath
    }
  )
}
