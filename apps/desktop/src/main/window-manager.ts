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
  private lastFocusedWindowId: number | null = null
  private windowConnectionNames = new Map<number, string>()

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
      this.updateWindowTitles()
      scheduleMenuUpdate()
    })

    // Update menu when window gains focus and track last focused window
    window.on('focus', () => {
      this.lastFocusedWindowId = window.id
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
      this.windowConnectionNames.delete(window.id)
      if (this.lastFocusedWindowId === window.id) {
        this.lastFocusedWindowId = null
      }
      // Reset cascade position if all windows closed
      if (this.windows.size === 0) {
        this.lastWindowPosition = null
      }
      this.updateWindowTitles()
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
   * Show a window on macOS dock click.
   * Prefers the last focused window; falls back to any visible window, then primary.
   */
  showPrimaryWindow(): void {
    // Try last focused window first
    if (this.lastFocusedWindowId) {
      const lastFocused = this.windows.get(this.lastFocusedWindowId)
      if (lastFocused && !lastFocused.isDestroyed()) {
        lastFocused.show()
        return
      }
    }

    // Fall back to any existing window
    const primary = this.getPrimaryWindow()
    if (primary && !primary.isDestroyed()) {
      primary.show()
    }
  }

  /**
   * Set the connection name for a window and update all titles
   */
  setWindowConnectionName(windowId: number, connectionName: string | null): void {
    if (connectionName) {
      this.windowConnectionNames.set(windowId, connectionName)
    } else {
      this.windowConnectionNames.delete(windowId)
    }
    this.updateWindowTitles()
    scheduleMenuUpdate()
  }

  /**
   * Update window titles based on connection names.
   * Single window with no connection: "Data Peek"
   * Single window with connection: "Data Peek — mydb"
   * Multiple windows with unique connections: "Data Peek — mydb", "Data Peek — otherdb"
   * Multiple windows with same connection: "Data Peek — mydb — 1", "Data Peek — mydb — 2"
   */
  private updateWindowTitles(): void {
    const windows = this.getAllWindows()

    if (windows.length <= 1) {
      const win = windows[0]
      if (win && !win.isDestroyed()) {
        const connName = this.windowConnectionNames.get(win.id)
        win.setTitle(connName ? `Data Peek — ${connName}` : 'Data Peek')
      }
      return
    }

    // Count how many windows share each connection name
    const nameCounts = new Map<string, number>()
    for (const win of windows) {
      const name = this.windowConnectionNames.get(win.id) || ''
      nameCounts.set(name, (nameCounts.get(name) || 0) + 1)
    }

    // Track per-name index for numbering duplicates
    const nameIndexes = new Map<string, number>()

    for (const win of windows) {
      if (win.isDestroyed()) continue

      const connName = this.windowConnectionNames.get(win.id)
      const key = connName || ''
      const count = nameCounts.get(key) || 1
      const idx = (nameIndexes.get(key) || 0) + 1
      nameIndexes.set(key, idx)

      let title: string
      if (!connName) {
        title = count > 1 ? `Data Peek — ${idx}` : 'Data Peek'
      } else if (count > 1) {
        title = `Data Peek — ${connName} — ${idx}`
      } else {
        title = `Data Peek — ${connName}`
      }

      win.setTitle(title)
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
