import { config } from 'dotenv'
import { app, BrowserWindow } from 'electron'
import { resolve } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'

// Load .env file - in development, it's in the desktop app directory
config({ path: resolve(__dirname, '../../.env') })
import type { ConnectionConfig, SavedQuery } from '@shared/index'
import { createMenu } from './menu'
import { initLicenseStore } from './license-service'
import { initAIStore } from './ai-service'
import { initAutoUpdater, stopPeriodicChecks } from './updater'
import { DpStorage } from './storage'
import { initSchemaCache } from './schema-cache'
import { registerAllHandlers } from './ipc'
import { setForceQuit } from './app-state'
import { windowManager } from './window-manager'
import { initSchedulerService, stopAllSchedules } from './scheduler-service'
import { initDashboardService } from './dashboard-service'

// Store instances
let store: DpStorage<{ connections: ConnectionConfig[] }>
let savedQueriesStore: DpStorage<{ savedQueries: SavedQuery[] }>

/**
 * Initialize all persistent stores
 */
async function initStores(): Promise<void> {
  store = await DpStorage.create<{ connections: ConnectionConfig[] }>({
    name: 'data-peek-connections',
    defaults: {
      connections: []
    }
  })

  savedQueriesStore = await DpStorage.create<{ savedQueries: SavedQuery[] }>({
    name: 'data-peek-saved-queries',
    defaults: {
      savedQueries: []
    }
  })

  // Initialize schema cache
  await initSchemaCache()
}

// Set app name for macOS dock and Mission Control
if (process.platform === 'darwin') {
  app.name = 'Data Peek'
}

// Application initialization
app.whenReady().then(async () => {
  // Initialize stores
  await initStores()

  // Initialize license store
  await initLicenseStore()

  // Initialize AI store
  await initAIStore()

  // Initialize scheduler service (needs connections store)
  await initSchedulerService(store)

  // Initialize dashboard service (needs connections and saved queries stores)
  await initDashboardService(store, savedQueriesStore)

  // Create native application menu
  createMenu()

  // Set app user model id for windows
  electronApp.setAppUserModelId('dev.datapeek.app')

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register all IPC handlers
  registerAllHandlers({
    connections: store,
    savedQueries: savedQueriesStore
  })

  // Create initial window
  await windowManager.createWindow()

  // Initialize auto-updater (only runs in production)
  initAutoUpdater()

  app.on('activate', function () {
    // On macOS re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager.createWindow()
    } else {
      windowManager.showPrimaryWindow()
    }
  })
})

// macOS: set forceQuit flag before quitting
app.on('before-quit', () => {
  setForceQuit(true)
  stopPeriodicChecks()
  stopAllSchedules()
})

// Quit when all windows are closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
