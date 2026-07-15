import { config } from 'dotenv'
import { app, BrowserWindow, safeStorage } from 'electron'
import { resolve, join } from 'path'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { electronApp, optimizer } from '@electron-toolkit/utils'

// Load .env file - in development, it's in the desktop app directory
config({ path: resolve(__dirname, '../../.env') })
import type { ConnectionConfig, QueryHistoryEntry, SavedQuery, Snippet } from '@shared/index'
import { createMenu } from './menu'
import { initLicenseStore } from './license-service'
import { initAIStore } from './ai-service'
import { initAutoUpdater, stopPeriodicChecks } from './updater'
import {
  DpStorage,
  DpSecureStorage,
  EncryptionUnavailableError,
  type PersistentStore
} from './storage'
import { NotebookStorage } from './notebook-storage'
import { TimeMachineStorage } from './time-machine-storage'
import { initSchemaCache } from './schema-cache'
import { registerAllHandlers } from './ipc'
import { setForceQuit } from './app-state'
import { windowManager } from './window-manager'
import { initSchedulerService, stopAllSchedules } from './scheduler-service'
import { initDashboardService } from './dashboard-service'
import { cleanup as cleanupPgNotify } from './pg-notification-listener'
import { closeAllPgPools } from './adapters/pg-pool-manager'
import { PostgresAdapter } from './adapters/postgres-adapter'
import { getAdapterByType } from './db-adapter'
import { StepSessionRegistry } from './step-session'
import { createLogger } from './lib/logger'

const log = createLogger('app')

// Store instances
let store: PersistentStore<{ connections: ConnectionConfig[] }>
let savedQueriesStore: DpStorage<{ savedQueries: SavedQuery[] }>
let snippetsStore: DpStorage<{ snippets: Snippet[] }>
let queryHistoryStore: DpStorage<{ queryHistory: QueryHistoryEntry[] }>
let timeMachineStorage: TimeMachineStorage | null = null

const stepSessionRegistry = new StepSessionRegistry()

/**
 * One-time migration of connections from the legacy plaintext store into the
 * encrypted store. Idempotent: only copies when the encrypted store is empty, and
 * removes the plaintext file afterwards so credentials no longer sit in cleartext.
 */
function migratePlaintextConnections(
  secure: PersistentStore<{ connections: ConnectionConfig[] }>
): void {
  const legacyPath = join(app.getPath('userData'), 'data-peek-connections.json')
  if (!existsSync(legacyPath)) return

  try {
    const parsed = JSON.parse(readFileSync(legacyPath, 'utf8')) as {
      connections?: ConnectionConfig[]
    }
    const legacy = parsed.connections ?? []
    if (legacy.length > 0 && secure.get('connections', []).length === 0) {
      secure.set('connections', legacy)
      log.info(`Migrated ${legacy.length} connection(s) to encrypted storage`)
    }
    unlinkSync(legacyPath)
    log.info('Removed legacy plaintext connections file')
  } catch (error) {
    log.error('Failed to migrate plaintext connections:', error)
  }
}

/**
 * Create the connections store, preferring OS-encrypted storage. If secure storage
 * is unavailable (e.g. a Linux box without a keyring), fall back to plaintext so the
 * app stays usable — but log it, since credentials are then unencrypted on disk.
 */
async function createConnectionsStore(): Promise<
  PersistentStore<{ connections: ConnectionConfig[] }>
> {
  try {
    const secure = await DpSecureStorage.create<{ connections: ConnectionConfig[] }>({
      name: 'data-peek-connections-secure',
      defaults: { connections: [] }
    })
    migratePlaintextConnections(secure)
    return secure
  } catch (error) {
    if (error instanceof EncryptionUnavailableError) {
      log.warn(
        'Secure storage unavailable — connection credentials will be stored unencrypted on this machine.'
      )
    } else {
      log.error('Failed to open encrypted connections store, falling back to plaintext:', error)
    }
    return DpStorage.create<{ connections: ConnectionConfig[] }>({
      name: 'data-peek-connections',
      defaults: { connections: [] }
    })
  }
}

/**
 * Initialize all persistent stores
 */
async function initStores(): Promise<void> {
  store = await createConnectionsStore()

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

  queryHistoryStore = await DpStorage.create<{ queryHistory: QueryHistoryEntry[] }>({
    name: 'data-peek-query-history',
    defaults: {
      queryHistory: []
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
  // Pin a non-plaintext safeStorage backend on Linux so the encryption key stays
  // decryptable across launches (the keyring backend can otherwise vary). Must run
  // before any safeStorage use. No-op / unsupported elsewhere, so guard it.
  if (process.platform === 'linux') {
    try {
      safeStorage.setUsePlainTextEncryption(false)
    } catch (error) {
      log.warn('Failed to pin safeStorage backend:', error)
    }
  }

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

  // Same native-module caveat as NotebookStorage — degrade to null so handler
  // registration below is always reached.
  try {
    timeMachineStorage = new TimeMachineStorage(app.getPath('userData'))
  } catch (error) {
    log.warn('Failed to initialize TimeMachineStorage:', error)
  }

  try {
    stepSessionRegistry.startCleanupTimer()
  } catch (error) {
    console.error('Failed to start step session cleanup timer:', error)
  }

  // CRITICAL: register IPC handlers. Nothing above this line is allowed to abort
  // startup before we reach here.
  registerAllHandlers(
    {
      connections: store,
      savedQueries: savedQueriesStore,
      snippets: snippetsStore,
      queryHistory: queryHistoryStore
    },
    notebookStorage,
    timeMachineStorage,
    stepSessionRegistry
  )

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

  // Roll back any open manual transactions first — their checked-out clients
  // would otherwise block pool.end() and leave transactions open server-side.
  const drainPgSessions = async (): Promise<void> => {
    const pg = getAdapterByType('postgresql')
    if (pg instanceof PostgresAdapter) {
      await pg.rollbackAllTransactions()
    }
  }

  Promise.race([
    Promise.all([
      stepSessionRegistry.cleanupAll(),
      drainPgSessions().then(() => closeAllPgPools())
    ]),
    new Promise((resolve) => setTimeout(resolve, 3000))
  ])
    .catch((err) => log.error('cleanupAll failed during quit:', err))
    .finally(() => {
      stepSessionRegistry.stopCleanupTimer()
      try {
        timeMachineStorage?.close()
      } catch (err) {
        log.warn('TimeMachineStorage close failed during quit:', err)
      }
      app.quit()
    })
})

// Quit when all windows are closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
