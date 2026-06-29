import { BrowserWindow, shell, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getWindowState, trackWindowState } from './window-state'
import { setupContextMenu } from './context-menu'
import { shouldForceQuit } from './app-state'
import { computeWindowTitles, pickFocusTarget } from './window-presentation'

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
  // Window ids ordered least- → most-recently focused. Used to restore the
  // genuinely active window on a dock/taskbar click (issue #195).
  private focusOrder: number[] = []
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
        // sandbox stays disabled: the current preload bundle doesn't run under the
        // renderer sandbox (window.api ends up undefined, which breaks the whole app
        // and the e2e suite). contextIsolation + nodeIntegration:false still provide
        // the primary renderer isolation. Re-enabling the sandbox needs preload build
        // work (CommonJS, no incompatible imports) and is tracked as a follow-up.
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true
      }
    })

    // Track this window. A freshly created window receives focus, so seed the
    // focus order with it immediately (in case the 'focus' event is delayed).
    this.windows.set(window.id, window)
    this.markFocused(window.id)
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
      this.markFocused(window.id)
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
      this.focusOrder = this.focusOrder.filter((id) => id !== window.id)
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
   * Record that a window became the active one, keeping it at the end of the
   * most-recently-focused order.
   */
  private markFocused(windowId: number): void {
    this.focusOrder = this.focusOrder.filter((id) => id !== windowId)
    this.focusOrder.push(windowId)
  }

  /**
   * Bring a window back to the foreground on a dock/taskbar click.
   *
   * Restores the genuinely active (most recently focused) window rather than
   * always focusing the first one — see issue #195. Falls back to the most
   * recently opened window if the focus history points at a closed window.
   */
  showPrimaryWindow(): void {
    const aliveIds = Array.from(this.windows.keys())
    const targetId = pickFocusTarget(this.focusOrder, aliveIds)
    if (targetId == null) return

    const target = this.windows.get(targetId)
    if (!target || target.isDestroyed()) return

    // Restore, reveal, and explicitly focus so the window is raised above its
    // siblings on every platform — `show()` alone does not reliably re-focus a
    // window that is already visible.
    if (target.isMinimized()) {
      target.restore()
    }
    target.show()
    target.focus()
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
    const windows = this.getAllWindows().filter((win) => !win.isDestroyed())

    const titles = computeWindowTitles(
      windows.map((win) => ({
        id: win.id,
        connName: this.windowConnectionNames.get(win.id)
      }))
    )

    for (const win of windows) {
      const title = titles.get(win.id)
      if (title) {
        win.setTitle(title)
      }
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
