# Keyboard Shortcuts

data-peek is designed for keyboard-first workflows. This guide covers all available shortcuts to help you work faster without reaching for your mouse.

> **Note:** On macOS, use `Cmd` (⌘). On Windows/Linux, use `Ctrl`.

---

## Quick Reference

### Most Used Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Enter` | Execute current query |
| `↑` `↓` `←` `→` | Move between result cells |
| `Enter` | Open the focused cell's inspector |
| `Cmd/Ctrl + C` | Copy the focused cell |
| `Cmd/Ctrl + S` | Save pending changes (in edit mode) |
| `Cmd/Ctrl + K` | Open command palette |
| `Cmd/Ctrl + T` | New query tab |
| `Cmd/Ctrl + W` | Close current tab |
| `Escape` | Close inspector / Exit edit mode / Cancel |

---

## Tab Management

Navigate and manage query tabs without using the mouse.

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + T` | Create new query tab |
| `Cmd/Ctrl + W` | Close current tab |
| `Cmd/Ctrl + 1-9` | Switch to tab 1-9 |
| `Cmd/Ctrl + Alt + →` | Switch to next tab |
| `Cmd/Ctrl + Alt + ←` | Switch to previous tab |

---

## Connection Management

Quickly switch between database connections.

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + P` | Open connection picker |
| `Cmd/Ctrl + Shift + 1-9` | Switch to connection 1-9 |

**Tip:** Connections are numbered in the order they appear in your sidebar.

---

## Query Editor

Execute, format, and manage your SQL queries.

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Enter` | Execute current query |
| `Shift + Alt + F` | Format SQL query |
| `Cmd/Ctrl + K` | Clear query results |
| `Cmd/Ctrl + Shift + W` | Toggle Watch Mode |
| `Cmd/Ctrl + Shift + H` | Toggle Time Machine run history |

### Monaco Editor Shortcuts

The query editor uses Monaco (the VS Code editor), so standard editor shortcuts work:

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Cmd/Ctrl + C` | Copy |
| `Cmd/Ctrl + V` | Paste |
| `Cmd/Ctrl + A` | Select all |
| `Cmd/Ctrl + F` | Find in editor |
| `Cmd/Ctrl + D` | Select next occurrence |
| `Alt + Up/Down` | Move line up/down |
| `Cmd/Ctrl + /` | Toggle line comment |

---

## Result Grid

Navigate query results entirely from the keyboard. The grid activates when virtualization kicks in (result row count > 50); smaller results use native browser focus.

### Cell Navigation

| Shortcut | Action |
|----------|--------|
| `↑` `↓` `←` `→` | Move focus between cells |
| `Home` | First cell in the current row |
| `End` | Last cell in the current row |
| `Cmd/Ctrl + Home` | First cell of the result |
| `Cmd/Ctrl + End` | Last cell of the result |
| `PageUp` / `PageDown` | Jump 20 rows |
| `Click` | Focus the clicked cell |

### Cell Inspector

Press `Enter` on a focused cell to open the inspector. It shows the full untruncated value, column type, char/byte counts, and a follow-foreign-key action when available.

| Shortcut | Action |
|----------|--------|
| `Enter` | Open the inspector for the focused cell |
| `↑` `↓` `←` `→` | Scrub between cells while the inspector is open |
| `Cmd/Ctrl + C` | Copy the focused cell's value |
| `Escape` | Close the inspector and return focus to the grid |

---

## Data Editing

Edit table data efficiently with keyboard shortcuts.

| Shortcut | Action | When Available |
|----------|--------|----------------|
| `Cmd/Ctrl + S` | Save all pending changes | Edit mode with unsaved changes |
| `Cmd/Ctrl + Shift + Z` | Discard all changes | Edit mode with unsaved changes |
| `Cmd/Ctrl + Shift + I` | Add new row (with form) | Viewing an editable table |
| `Escape` | Exit edit mode | Edit mode (not editing a cell) |

### Cell Editing

| Shortcut | Action |
|----------|--------|
| `Click` | Start editing a cell (enters edit mode) |
| `Enter` | Save cell and move to next row |
| `Tab` | Save cell and move to next column |
| `Escape` | Cancel cell edit |

### Foreign Key Navigation

| Shortcut | Action |
|----------|--------|
| `Click` on FK value | Open related record in side panel |
| `Cmd/Ctrl + Click` on FK value | Open related record in new tab |

---

## Sidebar & Navigation

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + B` | Toggle sidebar visibility |
| `Cmd/Ctrl + K` | Open command palette |

---

## AI Assistant

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + I` | Toggle AI assistant panel |

---

## View Menu

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Shift + S` | Open saved queries |

---

## Command Palette

The command palette (`Cmd/Ctrl + K`) provides quick access to all commands:

| Action | How to Access |
|--------|---------------|
| Execute query | Type "execute" or "run" |
| Format SQL | Type "format" |
| Switch connection | Type connection name |
| Change theme | Type "theme" |
| Open settings | Type "settings" |

**Navigation:**
- `↑` / `↓` - Navigate commands
- `Enter` - Execute selected command
- `Escape` - Close palette
- `Backspace` - Go back (when search is empty)

---

## Dashboard Mode

When viewing a dashboard, single-key shortcuts work (without modifiers):

| Key | Action |
|-----|--------|
| `R` | Refresh all widgets |
| `E` | Toggle edit mode |
| `N` or `A` | Add new widget |
| `Escape` | Exit edit mode |

---

## Settings

To view all keyboard shortcuts within the app:

1. Open **Settings** (`Cmd/Ctrl + ,` or via menu)
2. Scroll to **Keyboard Shortcuts** section

---

## Tips for Mouseless Workflow

### 1. Use the Command Palette

`Cmd/Ctrl + K` is your best friend. It provides fuzzy search access to:
- All commands
- Connections
- Saved queries
- Theme switching
- Settings

### 2. Tab Navigation Pattern

A typical workflow:
1. `Cmd/Ctrl + T` - New tab
2. Type your query
3. `Cmd/Ctrl + Enter` - Execute
4. Review results
5. `Cmd/Ctrl + W` - Close tab when done

### 3. Data Editing Pattern

1. Click a table in the sidebar
2. Click any cell to enter edit mode
3. Make your changes (arrow keys, Tab, Enter)
4. `Cmd/Ctrl + S` - Save all changes
5. `Escape` - Exit edit mode

### 4. Connection Switching

For projects with multiple databases:
- Use `Cmd/Ctrl + Shift + 1-9` for quick switching
- Or `Cmd/Ctrl + P` to search connections by name

---

## Platform-Specific Notes

### macOS

- Uses `Cmd` (⌘) as the primary modifier
- `Ctrl` key is reserved for system shortcuts
- `Option` (⌥) used for alternate actions

### Windows / Linux

- Uses `Ctrl` as the primary modifier
- `Alt` used for alternate actions
- Window management shortcuts may conflict with system shortcuts

---

## Customizing Shortcuts

Currently, keyboard shortcuts are not customizable. This feature is planned for a future release.

If you have specific shortcut requests, please [open an issue](https://github.com/Rohithgilla12/data-peek/issues).

---

## Troubleshooting

### Shortcuts Not Working?

1. **Check focus** - Make sure data-peek is the active window
2. **Check context** - Some shortcuts only work in specific contexts (e.g., edit mode)
3. **Check for conflicts** - Other apps or system shortcuts may intercept keys
4. **Check the menu bar** - The menu shows available shortcuts and their current state

### Monaco Editor Shortcuts Conflicting?

The SQL editor (Monaco) has its own shortcuts that take priority when the editor is focused. If you need to trigger an app shortcut while editing:
1. Click outside the editor first
2. Or use the menu bar

---

*Last updated: January 2026*
