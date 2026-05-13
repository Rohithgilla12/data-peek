import { config } from 'dotenv'
import { app, BrowserWindow } from 'electron'
import { resolve } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'

// Load .env file - in development, it's in the desktop app directory
config({ path: resolve(__dirname, '../../.env') })
import type { ConnectionConfig, SavedQuery, Snippet } from '@shared/index'
import { createMenu } from './menu'
import { initLicenseStore } from './license-service'
import { initAIStore } from './ai-service'
import { initAutoUpdater, stopPeriodicChecks } from './updater'
import { DpStorage } from './storage'
import { NotebookStorage } from './notebook-storage'
import { initSchemaCache } from './schema-cache'
import { registerAllHandlers } from './ipc'
import { setForceQuit } from './app-state'
import { windowManager } from './window-manager'
import { initSchedulerService, stopAllSchedules } from './scheduler-service'
import { initDashboardService } from './dashboard-service'
import { cleanup as cleanupPgNotify } from './pg-notification-listener'
import { closeAllPgPools } from './adapters/pg-pool-manager'
import { StepSessionRegistry } from './step-session'
import { createLogger } from './lib/logger'

const log = createLogger('app')

// Store instances
let store: DpStorage<{ connections: ConnectionConfig[] }>
let savedQueriesStore: DpStorage<{ savedQueries: SavedQuery[] }>
let snippetsStore: DpStorage<{ snippets: Snippet[] }>

const stepSessionRegistry = new StepSessionRegistry()

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

  snippetsStore = await DpStorage.create<{ snippets: Snippet[] }>({
    name: 'data-peek-snippets',
    defaults: {
      snippets: []
    }
  })

  // Initialize schema cache
  await initSchemaCache()
}

// Set app name for macOS dock and Mission Control
if (process.platform === 'darwin') {
  app.name = 'Data Peek'
}

// Global error handlers to prevent silent crashes
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason)
})

// Application initialization
app.whenReady().then(async () => {
  try {
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
  } catch (error) {
    console.error('Failed to initialize services:', error)
    // Continue to create the window so the user can see the app
    // even if some services failed to initialize
  }

  // Anything between the init try/catch above and registerAllHandlers below that
  // throws synchronously will skip IPC handler registration, leaving the renderer
  // with "No handler registered for 'db:connect'" (issue #174). Every step
  // outside the registration call is therefore isolated in its own try/catch.

  try {
    createMenu()
  } catch (error) {
    console.error('Failed to create native menu:', error)
  }

  try {
    electronApp.setAppUserModelId('dev.datapeek.app')
  } catch (error) {
    console.error('Failed to set app user model id:', error)
  }

  try {
    // Default open or close DevTools by F12 in development
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })
  } catch (error) {
    console.error('Failed to register browser-window-created listener:', error)
  }

  // NotebookStorage uses a native module (better-sqlite3) which can fail to load
  // if the wrong-arch binary was bundled — see issue #174.
  let notebookStorage: NotebookStorage | null = null
  try {
    notebookStorage = new NotebookStorage(app.getPath('userData'))
  } catch (error) {
    console.error('Failed to initialize NotebookStorage:', error)
  }

  try {
    stepSessionRegistry.startCleanupTimer()
  } catch (error) {
    console.error('Failed to start step session cleanup timer:', error)
  }

  // CRITICAL: register IPC handlers. Nothing above this line is allowed to abort
  // startup before we reach here.
  registerAllHandlers({
    connections: store,
    savedQueries: savedQueriesStore,
    snippets: snippetsStore
  }, notebookStorage, stepSessionRegistry)

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

  app.on('browser-window-created', (_event, window) => {
    window.on('closed', () => {
      stepSessionRegistry.cleanupWindow(window.id).catch((err) => {
        console.warn('Step session cleanup failed:', err)
      })
    })
  })
})

// macOS: set forceQuit flag before quitting
let isCleaningUp = false
app.on('before-quit', (event) => {
  if (isCleaningUp) return
  event.preventDefault()
  isCleaningUp = true

  setForceQuit(true)
  stopPeriodicChecks()
  stopAllSchedules()
  cleanupPgNotify()

  Promise.race([
    Promise.all([stepSessionRegistry.cleanupAll(), closeAllPgPools()]),
    new Promise((resolve) => setTimeout(resolve, 3000))
  ])
    .catch((err) => log.error('cleanupAll failed during quit:', err))
    .finally(() => {
      stepSessionRegistry.stopCleanupTimer()
      app.quit()
    })
})

// Quit when all windows are closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
