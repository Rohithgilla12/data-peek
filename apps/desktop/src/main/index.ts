import { config } from 'dotenv'
import { app, shell, BrowserWindow } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

// Load .env file - in development, it's in the desktop app directory
config({ path: resolve(__dirname, '../../.env') })
import icon from '../../resources/icon.png?asset'
import type { ConnectionConfig, SavedQuery } from '@shared/index'
import { createMenu } from './menu'
import { setupContextMenu } from './context-menu'
import { getWindowState, trackWindowState } from './window-state'
import { initLicenseStore } from './license-service'
import { initAIStore } from './ai-service'
import { initAutoUpdater, stopPeriodicChecks } from './updater'
import { DpStorage } from './storage'
import { initSchemaCache } from './schema-cache'
import { registerAllHandlers } from './ipc'
import { setForceQuit, shouldForceQuit } from './app-state'

// Store instances
let store: DpStorage<{ connections: ConnectionConfig[] }>
let savedQueriesStore: DpStorage<{ savedQueries: SavedQuery[] }>

// Store main window reference for macOS hide-on-close behavior
let mainWindow: BrowserWindow | null = null

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

/**
 * Create the main application window
 */
async function createWindow(): Promise<void> {
  // Get saved window state
  const windowState = await getWindowState()

  // Create the browser window
  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: false,
    // macOS-style window with vibrancy
    ...(process.platform === 'darwin' && {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 18 },
      vibrancy: 'sidebar',
      visualEffectState: 'active',
      transparent: true,
      backgroundColor: '#00000000'
    }),
    // Windows titlebar overlay
    ...(process.platform === 'win32' && {
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#1e1e1e',
        symbolColor: '#ffffff',
        height: 40
      },
      backgroundColor: '#1e1e1e'
    }),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Track window state for persistence
  trackWindowState(mainWindow)

  // Restore maximized state
  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  // Setup context menu
  setupContextMenu(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // macOS: hide instead of close (like native apps)
  mainWindow.on('close', (e) => {
    if (process.platform === 'darwin' && !shouldForceQuit()) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the app
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
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

  await createWindow()

  // Initialize auto-updater (only runs in production)
  initAutoUpdater(mainWindow!)

  app.on('activate', function () {
    // On macOS re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (mainWindow) {
      mainWindow.show()
    }
  })
})

// macOS: set forceQuit flag before quitting
app.on('before-quit', () => {
  setForceQuit(true)
  stopPeriodicChecks()
})

// Quit when all windows are closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
