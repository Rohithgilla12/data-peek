import { Menu, BrowserWindow } from 'electron'

export function setupContextMenu(window: BrowserWindow): void {
  window.webContents.on('context-menu', (_event, params) => {
    const menuItems: Electron.MenuItemConstructorOptions[] = []

    // Text editing options
    if (params.isEditable) {
      menuItems.push(
        { role: 'undo', enabled: params.editFlags.canUndo },
        { role: 'redo', enabled: params.editFlags.canRedo },
        { type: 'separator' },
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { role: 'selectAll', enabled: params.editFlags.canSelectAll }
      )
    } else if (params.selectionText.length > 0) {
      // Text selection in non-editable area
      menuItems.push({ role: 'copy' }, { type: 'separator' }, { role: 'selectAll' })
    }
    // Default context (no selection, not editable) is intentionally left empty
    // so renderer-side context menus can take over. A lone "Select All" is not
    // useful here and collides with the Radix row context menu.

    // Link handling
    if (params.linkURL) {
      menuItems.push(
        { type: 'separator' },
        {
          label: 'Open Link in Browser',
          click: (): void => {
            import('electron').then(({ shell }) => {
              shell.openExternal(params.linkURL)
            })
          }
        },
        {
          label: 'Copy Link',
          click: (): void => {
            import('electron').then(({ clipboard }) => {
              clipboard.writeText(params.linkURL)
            })
          }
        }
      )
    }

    // Dev tools (only in development or with modifier)
    if (process.env.NODE_ENV === 'development' || params.y < 0) {
      menuItems.push({ type: 'separator' }, { role: 'toggleDevTools' })
    }

    if (menuItems.length === 0) return
    const menu = Menu.buildFromTemplate(menuItems)
    menu.popup({ window })
  })
}
