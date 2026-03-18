/**
 * Shim for 'electron' module when desktop code is imported by the server.
 * Provides minimal stubs for the APIs that desktop modules reference.
 */

// app.getPath('userData') — used by storage.ts, license-service.ts
// app.getVersion() — used by license-service.ts
// app.isPackaged — used by logger.ts
const app = {
  getPath: (name: string) => {
    if (name === 'userData') return process.env.DATA_DIR || './data'
    return '/tmp'
  },
  getVersion: () => process.env.APP_VERSION || '0.14.0',
  isPackaged: process.env.NODE_ENV === 'production',
  name: 'Data Peek Server'
}

// safeStorage — used by storage.ts (encryption)
const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: (_s: string) => Buffer.from(''),
  decryptString: (_b: Buffer) => ''
}

// Notification — used by scheduler-service.ts
class Notification {
  constructor(_opts?: any) {}
  show() {}
}

// ipcMain — used by all ipc/*.ts handlers
// Since the server doesn't import ipc handlers directly, this is a safety net
const ipcMain = {
  handle: (_channel: string, _handler: Function) => {},
  on: (_channel: string, _handler: Function) => {},
  removeHandler: (_channel: string) => {}
}

// dialog — used by file-handlers.ts
const dialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] })
}

// shell — used by license-handlers.ts
const shell = {
  openExternal: async (_url: string) => {}
}

// BrowserWindow — used by window-manager.ts, dashboard-service.ts
class BrowserWindow {
  static getAllWindows() { return [] }
  static getFocusedWindow() { return null }
  webContents = { send: () => {} }
}

const screen = {
  getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } })
}

export { app, safeStorage, Notification, ipcMain, dialog, shell, BrowserWindow, screen }
export default { app, safeStorage, Notification, ipcMain, dialog, shell, BrowserWindow, screen }
