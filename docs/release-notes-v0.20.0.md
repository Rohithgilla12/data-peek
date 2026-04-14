# Release Notes: v0.20.0

This document covers the changes from v0.19.0 to v0.20.0.

---

## SQL Notebooks

SQL Notebooks is a major new feature that brings a Jupyter-style cell-based editor to data-peek. Create documents that mix executable SQL cells and Markdown cells in a single view — the primary use case is team runbooks, like a shared "how to debug stuck payments" guide that actually runs the queries.

---

## What's New

### SQL + Markdown Cells

Notebooks are composed of two cell types:

- **SQL cells** — a Monaco editor with inline results displayed directly below the query. Results show row count, execution duration, and a full scrollable result table.
- **Markdown cells** — rich text with GitHub Flavored Markdown (tables, task lists, strikethrough). Click to edit, click away to render.

Add cells from the toolbar or by hovering between existing cells — a `+` button appears on the dividing line and lets you pick the type.

### Pinned Results

Run a diagnostic query and pin the output. Pinned results persist across sessions in SQLite, so when you reopen a notebook the last known state is always visible — useful for runbooks that track a baseline or show an example of what "broken" looks like.

Pin via the cell overflow menu. An optional notebook-level "Auto-pin results" setting pins every successful run automatically.

### Folders for Organization

Group notebooks into folders from the sidebar. Folders are lightweight — they exist implicitly when any notebook references them. No separate folder management; remove the last notebook from a folder and the folder disappears.

### Export

- **Export as `.dpnb`** — a portable JSON format that includes all cells and pinned results. Reimportable into any data-peek instance. Connection IDs are stripped on export; you pick which connection to bind on import.
- **Export as Markdown** — SQL cells become fenced `sql` code blocks, pinned results become Markdown tables, Markdown cells export as-is. Readable without data-peek.

Import `.dpnb` files from File → Import Notebook, or drag a `.dpnb` file onto the sidebar.

### Duplicate to Connection

Right-click a notebook in the sidebar → "Duplicate to connection..." — pick any of your saved connections. Creates a full copy with all cells and pinned results bound to the new connection. The original is unchanged. Useful for running a production runbook against staging.

### Sidebar Integration

A "Notebooks" section appears below Saved Queries in the sidebar. Each entry shows the notebook title, connected database name, and last-edited timestamp. The existing sidebar search filters notebooks alongside tables and saved queries.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Shift+Enter` | Run cell and move focus to next cell |
| `Cmd+Enter` | Run cell, stay in place |
| `Cmd+Shift+Enter` | Run All (top to bottom, sequential) |
| `Cmd+J` | Move focus to next cell |
| `Cmd+K` | Move focus to previous cell |
| `Enter` | Enter editor mode on focused cell |
| `Escape` | Exit editor, return to cell-level navigation |
| `Cmd+Shift+D` | Delete focused cell |

Execution stops on the first error — if a diagnostic SELECT fails, the UPDATE cells below won't run.

---

## How to Use

### Quick Start

1. Open the Notebooks section in the sidebar and click `+` to create a notebook.
2. Give it a title. The notebook binds to your active connection.
3. Add a Markdown cell to describe what the notebook does.
4. Add a SQL cell and write your query.
5. Press `Shift+Enter` to run and advance — or `Cmd+Enter` to run in place.
6. Pin a result via the cell `...` menu if you want it to persist across sessions.

### Building a Runbook

A typical runbook pattern:

1. Markdown cell — context and prerequisites ("Run this when payments stop processing")
2. SQL cell — diagnostic query ("Show all payments stuck in `processing` state")
3. Markdown cell — what to look for in the results
4. SQL cell — follow-up query or remediation step

Export as `.dpnb` and share with your team. They import it, pick their connection, and the whole runbook is ready to run.

### Running on Multiple Environments

Right-click a notebook → "Duplicate to connection..." to create a version bound to your staging or dev database. Run the same queries against different environments without maintaining separate notebooks.

---

## Technical Notes

- Cell content auto-saves with a 500ms debounce — no save button needed. The toolbar shows "Saved [time ago]".
- Only the focused cell loads a Monaco instance. Unfocused cells render as static `<pre>` elements — notebooks with many cells stay lightweight.
- Result tables use the same virtualized rendering as query tabs. Large result sets don't slow down the notebook.
- Pinned results are capped at 500 rows per cell.
- Run All executes SQL cells sequentially and skips Markdown cells.

---

## Stats Summary

- New tab type: `notebook`
- New IPC namespace: `window.api.notebooks`
- New SQLite tables: `notebooks`, `notebook_cells`
- New stores: `notebook-store.ts`
- New components: `NotebookTab`, `NotebookCell`, `NotebookSidebar`

---

## Upgrade

Download the latest release from the [releases page](https://github.com/Rohithgilla12/data-peek/releases) or the app will auto-update if you have v0.19.x installed.
