import { autoUpdater } from 'electron-updater'
import { app, dialog, BrowserWindow, ipcMain } from 'electron'
import { createLogger } from './lib/logger'
import { setForceQuit } from './app-state'

const log = createLogger('updater')

let isUpdaterInitialized = false
let isManualCheck = false
let mainWindow: BrowserWindow | null = null
let periodicCheckInterval: ReturnType<typeof setInterval> | null = null

// Check interval: 4 hours in milliseconds
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

// Send event to renderer process
function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

export function initAutoUpdater(window?: BrowserWindow): void {
  // Store window reference
  if (window) {
    mainWindow = window
  }

  // Only check for updates in production
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    log.debug('Skipping auto-update check in development mode')
    return
  }

  // Configure logging - use our logger
  autoUpdater.logger = {
    info: (message) => log.info(String(message)),
    warn: (message) => log.warn(String(message)),
    error: (message) => log.error(String(message)),
    debug: (message) => log.debug(String(message))
  }

  // Disable auto-download - download silently on automatic checks, ask on manual checks
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // Event handlers
  autoUpdater.on('checking-for-update', () => {
    log.debug('Checking for update...')
  })

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version)

    // Notify renderer about available update
    sendToRenderer('updater:update-available', info.version)

    if (isManualCheck) {
      // Manual check: ask user if they want to download
      dialog
        .showMessageBox({
          type: 'info',
          title: 'Update Available',
          message: `Version ${info.version} is available. Would you like to download it now?`,
          buttons: ['Download', 'Later'],
          defaultId: 0
        })
        .then((result) => {
          if (result.response === 0) {
            autoUpdater.downloadUpdate()
          }
        })
    } else {
      // Automatic check: download silently in background
      autoUpdater.downloadUpdate()
    }
  })

  autoUpdater.on('update-not-available', () => {
    log.debug('No update available')
    if (isManualCheck) {
      dialog.showMessageBox({
        type: 'info',
        title: 'No Updates',
        message: `You're running the latest version (${app.getVersion()}).`,
        buttons: ['OK']
      })
      isManualCheck = false
    }
  })

  autoUpdater.on('download-progress', (progress) => {
    log.debug(`Download progress: ${progress.percent.toFixed(1)}%`)
    sendToRenderer('updater:download-progress', progress.percent)
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version)
    // Notify renderer that update is ready to install
    sendToRenderer('updater:update-downloaded', info.version)
  })

  autoUpdater.on('error', (err) => {
    log.error('Update error:', err.message)
    sendToRenderer('updater:error', err.message)
    if (isManualCheck) {
      dialog.showMessageBox({
        type: 'error',
        title: 'Update Check Failed',
        message: 'Could not check for updates. Please try again later.',
        buttons: ['OK']
      })
      isManualCheck = false
    }
  })

  // Handle quit-and-install request from renderer
  ipcMain.on('updater:quit-and-install', () => {
    log.info('Quit and install requested')

    // On macOS, we need to force the app to actually quit (not hide)
    // The main window has a 'close' handler that hides instead of closes unless forceQuit is true
    setForceQuit(true)

    // isSilent: true = no installation UI (cleaner UX)
    // isForceRunAfter: true = ensure app restarts after install (critical for macOS)
    autoUpdater.quitAndInstall(true, true)
  })

  isUpdaterInitialized = true

  // Check for updates silently on startup
  autoUpdater.checkForUpdatesAndNotify()

  // Set up periodic update checks
  startPeriodicChecks()
}

// Start periodic update checks
function startPeriodicChecks(): void {
  if (periodicCheckInterval) {
    clearInterval(periodicCheckInterval)
  }

  periodicCheckInterval = setInterval(() => {
    log.debug('Running periodic update check...')
    autoUpdater.checkForUpdates().catch((err) => {
      log.error('Periodic check failed:', err.message)
    })
  }, CHECK_INTERVAL_MS)

  log.debug(`Periodic checks scheduled every ${CHECK_INTERVAL_MS / 1000 / 60 / 60} hours`)
}

// Stop periodic checks (call this on app quit)
export function stopPeriodicChecks(): void {
  if (periodicCheckInterval) {
    clearInterval(periodicCheckInterval)
    periodicCheckInterval = null
  }
}

export async function checkForUpdates(): Promise<void> {
  // In development, show a message
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    dialog.showMessageBox({
      type: 'info',
      title: 'Check for Updates',
      message: 'Auto-updates are disabled in development mode.',
      buttons: ['OK']
    })
    return
  }

  if (!isUpdaterInitialized) {
    initAutoUpdater()
  }

  isManualCheck = true

  try {
    await autoUpdater.checkForUpdates()
    // The event handlers will show appropriate dialogs
  } catch (error) {
    log.error('Manual check failed:', error)
    dialog.showMessageBox({
      type: 'error',
      title: 'Update Check Failed',
      message: 'Could not check for updates. Please try again later.',
      buttons: ['OK']
    })
    isManualCheck = false
  }
}
