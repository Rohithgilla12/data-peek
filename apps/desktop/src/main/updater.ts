import { autoUpdater } from 'electron-updater'
import { app, dialog } from 'electron'

let isUpdaterInitialized = false

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

  // Disable auto-download, let user decide
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // Event handlers
  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for update...')
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] Update available:', info.version)
    // Auto-download the update
    autoUpdater.downloadUpdate()
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] No update available')
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
  })

  isUpdaterInitialized = true

  // Check for updates
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

  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result || !result.updateInfo) {
      dialog.showMessageBox({
        type: 'info',
        title: 'No Updates',
        message: `You're running the latest version (${app.getVersion()}).`,
        buttons: ['OK']
      })
    }
  } catch (error) {
    console.error('[updater] Manual check failed:', error)
    dialog.showMessageBox({
      type: 'error',
      title: 'Update Check Failed',
      message: 'Could not check for updates. Please try again later.',
      buttons: ['OK']
    })
  }
}
