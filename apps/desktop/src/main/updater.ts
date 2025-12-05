import { autoUpdater, UpdateInfo } from 'electron-updater'
import { app, BrowserWindow, ipcMain } from 'electron'

// Force quit and install update (handles macOS close event issues)
function forceQuitAndInstall(): void {
  // Remove all window-all-closed listeners that might prevent quit
  app.removeAllListeners('window-all-closed')

  // Close all windows and remove their close listeners
  BrowserWindow.getAllWindows().forEach((win) => {
    win.removeAllListeners('close')
    win.close()
  })

  // Now quit and install
  autoUpdater.quitAndInstall(false)
}

// Simple update state
export type UpdateStatus = 'idle' | 'downloading' | 'ready'

export interface UpdateState {
  status: UpdateStatus
  version: string | null
  releaseNotes: string | null
  downloadProgress: number
}

let mainWindow: BrowserWindow | null = null
let lastProgressUpdate = 0
let lastProgressValue = 0

let updateState: UpdateState = {
  status: 'idle',
  version: null,
  releaseNotes: null,
  downloadProgress: 0
}

function sendUpdateState(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:state-changed', updateState)
  }
}

function setUpdateState(partial: Partial<UpdateState>): void {
  updateState = { ...updateState, ...partial }
  sendUpdateState()
}

// Throttled progress update - only send every 500ms or on significant change
function updateProgress(percent: number): void {
  const now = Date.now()
  const rounded = Math.round(percent)
  // Send if: 500ms passed, or progress jumped 5%+, or reached 100%
  if (now - lastProgressUpdate > 500 || rounded - lastProgressValue >= 5 || rounded >= 100) {
    lastProgressUpdate = now
    lastProgressValue = rounded
    updateState = { ...updateState, downloadProgress: rounded }
    sendUpdateState()
  }
}

function parseReleaseNotes(info: UpdateInfo): string | null {
  if (!info.releaseNotes) return null
  if (typeof info.releaseNotes === 'string') return info.releaseNotes
  if (Array.isArray(info.releaseNotes)) {
    return info.releaseNotes
      .map((note) => (typeof note === 'string' ? note : note.note))
      .filter(Boolean)
      .join('\n\n')
  }
  return null
}

export function initAutoUpdater(window: BrowserWindow): void {
  mainWindow = window

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    console.log('[updater] Skipping in development mode')
    return
  }

  autoUpdater.logger = {
    info: (msg) => console.log('[updater]', msg),
    warn: (msg) => console.warn('[updater]', msg),
    error: (msg) => console.error('[updater]', msg),
    debug: (msg) => console.log('[updater:debug]', msg)
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.log('[updater] Update available:', info.version)
    // Reset progress tracking
    lastProgressUpdate = 0
    lastProgressValue = 0
    setUpdateState({
      status: 'downloading',
      version: info.version,
      releaseNotes: parseReleaseNotes(info),
      downloadProgress: 0
    })
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] No update available')
    // Keep ready state if already downloaded
    if (updateState.status !== 'ready') {
      setUpdateState({ status: 'idle', version: null, releaseNotes: null, downloadProgress: 0 })
    }
  })

  autoUpdater.on('download-progress', (progress) => {
    updateProgress(progress.percent)
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    console.log('[updater] Update downloaded:', info.version)
    setUpdateState({
      status: 'ready',
      version: info.version,
      releaseNotes: parseReleaseNotes(info),
      downloadProgress: 100
    })
  })

  autoUpdater.on('error', (err: Error) => {
    console.error('[updater] Error:', err.message)
    // Reset to idle on error - next check will retry
    if (updateState.status !== 'ready') {
      setUpdateState({ status: 'idle', downloadProgress: 0 })
    }
  })

  // Check on startup after delay
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => console.error('[updater]', e))
  }, 5000)

  // Check every 30 minutes
  setInterval(
    () => {
      if (updateState.status === 'idle') {
        autoUpdater.checkForUpdates().catch((e) => console.error('[updater]', e))
      }
    },
    30 * 60 * 1000
  )
}

export function registerUpdaterIPC(): void {
  ipcMain.handle('updater:get-state', () => updateState)

  ipcMain.handle('updater:check-for-updates', async () => {
    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
      return { success: false }
    }
    try {
      await autoUpdater.checkForUpdates()
      return { success: true }
    } catch {
      return { success: false }
    }
  })

  ipcMain.handle('updater:restart-and-update', () => {
    if (updateState.status === 'ready') {
      console.log('[updater] Restarting to install update...')
      setImmediate(() => forceQuitAndInstall())
      return { success: true }
    }
    console.log('[updater] No update ready to install, status:', updateState.status)
    return { success: false }
  })
}

export async function checkForUpdates(): Promise<void> {
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) return
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    console.error('[updater]', e)
  }
}
