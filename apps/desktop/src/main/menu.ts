import { app, Menu, shell, BrowserWindow } from 'electron'
import { checkForUpdates } from './updater'
import { windowManager } from './window-manager'

const isMac = process.platform === 'darwin'

/**
 * Build the Window submenu with a list of all open windows
 */
function buildWindowSubmenu(): Electron.MenuItemConstructorOptions[] {
  const windows = windowManager.getAllWindows()
  const focusedWindow = BrowserWindow.getFocusedWindow()

  const windowList: Electron.MenuItemConstructorOptions[] = windows.map((win, index) => {
    const title = win.getTitle() || `Window ${index + 1}`
    return {
      label: title,
      type: 'checkbox' as const,
      checked: focusedWindow?.id === win.id,
      click: (): void => {
        if (win.isMinimized()) {
          win.restore()
        }
        win.focus()
      }
    }
  })

  return [
    { role: 'minimize' as const },
    { role: 'zoom' as const },
    ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : []),
    ...(windowList.length > 0 ? [{ type: 'separator' as const }, ...windowList] : [])
  ]
}

export function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              {
                label: 'Check for Updates...',
                click: (): void => {
                  checkForUpdates()
                }
              },
              { type: 'separator' as const },
              {
                label: 'Settings...',
                accelerator: 'Cmd+,',
                click: (): void => {
                  const focusedWindow = BrowserWindow.getFocusedWindow()
                  if (focusedWindow) {
                    focusedWindow.webContents.send('menu:open-settings')
                  }
                }
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),

    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: (): void => {
            windowManager.createWindow()
          }
        },
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: (): void => {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.webContents.send('menu:new-tab')
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: (): void => {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.webContents.send('menu:close-tab')
            }
          }
        },
        { type: 'separator' },
        // Settings for Windows/Linux (macOS has it in app menu)
        ...(!isMac
          ? [
              {
                label: 'Settings',
                accelerator: 'Ctrl+,',
                click: (): void => {
                  const focusedWindow = BrowserWindow.getFocusedWindow()
                  if (focusedWindow) {
                    focusedWindow.webContents.send('menu:open-settings')
                  }
                }
              },
              { type: 'separator' as const }
            ]
          : []),
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },

    // Edit menu - THIS IS WHAT MAKES CMD+A, CMD+C, ETC WORK
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' as const },
              { role: 'delete' as const },
              { role: 'selectAll' as const },
              { type: 'separator' as const },
              {
                label: 'Speech',
                submenu: [{ role: 'startSpeaking' as const }, { role: 'stopSpeaking' as const }]
              }
            ]
          : [
              { role: 'delete' as const },
              { type: 'separator' as const },
              { role: 'selectAll' as const }
            ])
      ]
    },

    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Saved Queries',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: (): void => {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.webContents.send('open-saved-queries')
            }
          }
        },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: (): void => {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.webContents.send('menu:toggle-sidebar')
            }
          }
        }
      ]
    },

    // Query menu (app-specific)
    {
      label: 'Query',
      submenu: [
        {
          label: 'Execute Query',
          accelerator: 'CmdOrCtrl+Enter',
          click: (): void => {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.webContents.send('menu:execute-query')
            }
          }
        },
        {
          label: 'Format SQL',
          accelerator: 'Shift+Alt+F',
          click: (): void => {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.webContents.send('menu:format-sql')
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Clear Results',
          accelerator: 'CmdOrCtrl+K',
          click: (): void => {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.webContents.send('menu:clear-results')
            }
          }
        }
      ]
    },

    // Data menu (table editing operations)
    {
      label: 'Data',
      submenu: [
        {
          label: 'Save Changes',
          accelerator: 'CmdOrCtrl+S',
          click: (): void => {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.webContents.send('menu:save-changes')
            }
          }
        },
        {
          label: 'Discard Changes',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: (): void => {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.webContents.send('menu:discard-changes')
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Add Row',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: (): void => {
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.webContents.send('menu:add-row')
            }
          }
        }
      ]
    },

    // Window menu
    {
      label: 'Window',
      submenu: buildWindowSubmenu()
    },

    // Help menu
    {
      role: 'help',
      submenu: [
        {
          label: 'Documentation',
          click: async (): Promise<void> => {
            await shell.openExternal('https://github.com/Rohithgilla12/data-peek')
          }
        },
        {
          label: 'Report Issue',
          click: async (): Promise<void> => {
            await shell.openExternal('https://github.com/Rohithgilla12/data-peek/issues')
          }
        },
        // Check for Updates (Windows/Linux only - macOS has it in app menu)
        ...(!isMac
          ? [
              { type: 'separator' as const },
              {
                label: 'Check for Updates...',
                click: (): void => {
                  checkForUpdates()
                }
              }
            ]
          : [])
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

/**
 * Update the menu (call when windows change)
 */
export function updateMenu(): void {
  createMenu()
}
