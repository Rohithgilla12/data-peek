// Pure presentation helpers for the multi-window manager.
//
// These are intentionally free of any `electron` imports so they can be unit
// tested in isolation. `window-manager.ts` wires them up to real BrowserWindows.

export interface WindowTitleInput {
  /** Stable window id (BrowserWindow.id). */
  id: number
  /** Connection/database name for the window, if any. */
  connName?: string | null
}

/**
 * Compute the title for every window based on the connection names.
 *
 * Rules:
 * - Single window, no connection:            "Data Peek"
 * - Single window with a connection:          "Data Peek — mydb"
 * - Multiple windows, unique connections:     "Data Peek — mydb", "Data Peek — otherdb"
 * - Multiple windows sharing a connection:    "Data Peek — mydb — 1", "Data Peek — mydb — 2"
 * - Multiple windows, none connected:         "Data Peek — 1", "Data Peek — 2"
 *
 * Returns a map of window id -> title so the caller can apply each title to the
 * matching BrowserWindow.
 */
export function computeWindowTitles(windows: WindowTitleInput[]): Map<number, string> {
  const titles = new Map<number, string>()

  if (windows.length <= 1) {
    const win = windows[0]
    if (win) {
      titles.set(win.id, win.connName ? `Data Peek — ${win.connName}` : 'Data Peek')
    }
    return titles
  }

  // Count how many windows share each connection name ('' === no connection).
  const nameCounts = new Map<string, number>()
  for (const win of windows) {
    const name = win.connName || ''
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1)
  }

  // Track a per-name running index so duplicates get numbered 1, 2, 3…
  const nameIndexes = new Map<string, number>()

  for (const win of windows) {
    const connName = win.connName || ''
    const count = nameCounts.get(connName) || 1
    const idx = (nameIndexes.get(connName) || 0) + 1
    nameIndexes.set(connName, idx)

    let title: string
    if (!connName) {
      // No connection: only number when more than one window is open so a lone
      // window keeps the clean "Data Peek" title.
      title = count > 1 ? `Data Peek — ${idx}` : 'Data Peek'
    } else if (count > 1) {
      title = `Data Peek — ${connName} — ${idx}`
    } else {
      title = `Data Peek — ${connName}`
    }

    titles.set(win.id, title)
  }

  return titles
}

/**
 * Pick which window should be brought to the foreground on a dock/taskbar click.
 *
 * `focusOrder` is least-recently → most-recently focused. We walk it from the
 * back so the genuinely active window wins. If nothing in the focus history is
 * still alive (e.g. the focused window was closed), we fall back to the most
 * recently created window rather than the first one — focusing the *first*
 * window was the original bug (issue #195).
 *
 * @returns the id to focus, or null when no windows are open.
 */
export function pickFocusTarget(focusOrder: number[], aliveIds: number[]): number | null {
  const alive = new Set(aliveIds)

  for (let i = focusOrder.length - 1; i >= 0; i--) {
    const id = focusOrder[i]
    if (alive.has(id)) {
      return id
    }
  }

  // Fall back to the most recently opened window.
  return aliveIds.length > 0 ? aliveIds[aliveIds.length - 1] : null
}
