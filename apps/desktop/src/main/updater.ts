import { autoUpdater } from 'electron-updater'
import { app, dialog } from 'electron'

let isUpdaterInitialized = false
let isManualCheck = false

export function initAutoUpdater(): void {
  // Only check for updates in production
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    console.log('[updater] Skipping auto-update check in development mode')
    return
  }

  // Configure logging
  autoUpdater.logger = {
    info: (message) => console.log('[updater]', message),
    warn: (message) => console.warn('[updater]', message),
    error: (message) => console.error('[updater]', message),
    debug: (message) => console.log('[updater:debug]', message)
  }

  // Disable auto-download - download silently on automatic checks, ask on manual checks
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // Event handlers
  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for update...')
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] Update available:', info.version)

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
    console.log('[updater] No update available')
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
    console.log(`[updater] Download progress: ${progress.percent.toFixed(1)}%`)
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] Update downloaded:', info.version)
    // The update will be installed on quit
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err.message)
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

  isUpdaterInitialized = true

  // Check for updates silently on startup
  autoUpdater.checkForUpdatesAndNotify()
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
    console.error('[updater] Manual check failed:', error)
    dialog.showMessageBox({
      type: 'error',
      title: 'Update Check Failed',
      message: 'Could not check for updates. Please try again later.',
      buttons: ['OK']
    })
    isManualCheck = false
  }
}
