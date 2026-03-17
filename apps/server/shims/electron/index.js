const app = {
  getPath: (name) => process.env.DATA_DIR || './data',
  getVersion: () => process.env.APP_VERSION || '0.14.0',
  isPackaged: process.env.NODE_ENV === 'production',
  name: 'Data Peek Server'
}

const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: () => Buffer.from(''),
  decryptString: () => ''
}

class Notification { constructor() {} show() {} }
class BrowserWindow {
  static getAllWindows() { return [] }
  static getFocusedWindow() { return null }
  webContents = { send() {} }
}

const ipcMain = {
  handle() {},
  on() {},
  removeHandler() {}
}

const dialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] })
}

const shell = {
  openExternal: async () => {}
}

const screen = {
  getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } })
}

module.exports = { app, safeStorage, Notification, BrowserWindow, ipcMain, dialog, shell, screen }
