import { BrowserWindow, shell, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getWindowState, trackWindowState } from './window-state'
import { setupContextMenu } from './context-menu'
import { shouldForceQuit } from './app-state'

// Lazy import to avoid circular dependency (menu.ts imports windowManager)
const scheduleMenuUpdate = (): void => {
  setImmediate(() => {
    import('./menu').then(({ updateMenu }) => updateMenu())
  })
}

// Cascade offset for new windows
const CASCADE_OFFSET = 30

class WindowManager {
  private windows = new Map<number, BrowserWindow>()
  private lastWindowPosition: { x: number; y: number } | null = null

  /**
   * Create a new application window
   */
  async createWindow(): Promise<BrowserWindow> {
    // Get saved window state for first window, cascade for subsequent
    const windowState = await getWindowState()
    const cascadePosition = this.getCascadePosition(windowState)

    const window = new BrowserWindow({
      width: windowState.width,
      height: windowState.height,
      minWidth: 900,
      minHeight: 600,
      x: cascadePosition.x,
      y: cascadePosition.y,
      title: 'Data Peek',
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
        titleBarStyle: 'hidden'
      }),
      ...(process.platform === 'linux' ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    // Track this window
    this.windows.set(window.id, window)
    this.lastWindowPosition = { x: cascadePosition.x ?? 0, y: cascadePosition.y ?? 0 }

    // Track window state for persistence (only first window persists state)
    if (this.windows.size === 1) {
      trackWindowState(window)
    }

    // Restore maximized state for first window only
    if (this.windows.size === 1 && windowState.isMaximized) {
      window.maximize()
    }

    // Setup context menu for this window
    setupContextMenu(window)

    window.on('ready-to-show', () => {
      window.show()
      scheduleMenuUpdate()
    })

    // Update menu when window gains focus (to update checkmarks)
    window.on('focus', () => {
      scheduleMenuUpdate()
    })

    // macOS: hide instead of close for last window
    window.on('close', (e) => {
      if (process.platform === 'darwin' && !shouldForceQuit()) {
        // Only hide if this is the last window
        if (this.windows.size === 1) {
          e.preventDefault()
          window.hide()
          return
        }
      }
    })

    // Cleanup when window is closed
    window.on('closed', () => {
      this.windows.delete(window.id)
      // Reset cascade position if all windows closed
      if (this.windows.size === 0) {
        this.lastWindowPosition = null
      }
      scheduleMenuUpdate()
    })

    window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // Load the app
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      window.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      window.loadFile(join(__dirname, '../renderer/index.html'))
    }

    return window
  }

  /**
   * Calculate cascade position for new windows
   */
  private getCascadePosition(baseState: {
    x?: number
    y?: number
    width: number
    height: number
  }): { x?: number; y?: number } {
    // First window uses saved position
    if (this.windows.size === 0) {
      return { x: baseState.x, y: baseState.y }
    }

    // Subsequent windows cascade from last position
    const lastX = this.lastWindowPosition?.x ?? baseState.x ?? 100
    const lastY = this.lastWindowPosition?.y ?? baseState.y ?? 100

    let newX = lastX + CASCADE_OFFSET
    let newY = lastY + CASCADE_OFFSET

    // Check if new position would be off-screen, reset if so
    const displays = screen.getAllDisplays()
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

    // If window would go off right or bottom edge, reset to top-left area
    if (newX + baseState.width > screenWidth || newY + baseState.height > screenHeight) {
      // Find a reasonable starting position
      const startX = displays[0]?.bounds.x ?? 100
      const startY = displays[0]?.bounds.y ?? 100
      newX = startX + CASCADE_OFFSET
      newY = startY + CASCADE_OFFSET
    }

    return { x: newX, y: newY }
  }

  /**
   * Get a window by ID
   */
  getWindow(id: number): BrowserWindow | undefined {
    return this.windows.get(id)
  }

  /**
   * Get all open windows
   */
  getAllWindows(): BrowserWindow[] {
    return Array.from(this.windows.values())
  }

  /**
   * Get the first (primary) window
   */
  getPrimaryWindow(): BrowserWindow | undefined {
    return this.windows.values().next().value
  }

  /**
   * Close a specific window
   */
  closeWindow(id: number): void {
    const window = this.windows.get(id)
    if (window && !window.isDestroyed()) {
      window.close()
    }
  }

  /**
   * Broadcast a message to all windows
   */
  broadcastToAll(channel: string, ...args: unknown[]): void {
    for (const window of this.windows.values()) {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, ...args)
      }
    }
  }

  /**
   * Show the primary window (for macOS dock click)
   */
  showPrimaryWindow(): void {
    const primary = this.getPrimaryWindow()
    if (primary && !primary.isDestroyed()) {
      primary.show()
    }
  }

  /**
   * Check if any windows are open
   */
  hasWindows(): boolean {
    return this.windows.size > 0
  }
}

// Export singleton instance
export const windowManager = new WindowManager()
