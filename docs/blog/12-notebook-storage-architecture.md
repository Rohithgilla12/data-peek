---
title: "Designing Local-First Storage for SQL Notebooks with SQLite"
published: false
description: "Why I chose SQLite over JSON files for notebook storage, how I designed the schema, and the tradeoffs involved in storing pinned query results as JSON columns."
tags: sqlite, electron, architecture, typescript
series: "Building data-peek"
cover_image:
---

# Designing Local-First Storage for SQL Notebooks with SQLite

data-peek already uses SQLite for connection configs, query history, and saved queries — all managed through `better-sqlite3` in the Electron main process. When I added notebooks, I had a choice: extend the existing database, or give notebooks their own file.

I went with a separate file: `notebooks.db`. Here's the full reasoning, and the design decisions that followed.

## Why Not electron-store?

The simple path would have been `electron-store`, which is what I use for most app settings. It persists JSON to disk, handles serialization automatically, and has a clean API. For most features it's fine.

Notebooks don't fit the JSON file model for three reasons:

**Relational data.** A notebook has many cells, and operations on cells need to not clobber the whole notebook. With JSON files, every cell edit rewrites the entire notebook object. With SQLite, `UPDATE notebook_cells SET content = ? WHERE id = ?` touches one row.

**Large pinned results.** A pinned query result can be thousands of rows. Storing that inside a JSON file means deserializing the entire notebook on load just to render the title. With SQLite, pinned results are a column in `notebook_cells` — they're fetched only when needed.

**Individual cell writes.** The auto-save pattern I wanted — debounced 500ms writes per cell — doesn't compose well with a JSON file. If two cells are being edited simultaneously (or close in time), the writes race. With SQLite and individual `UPDATE` statements, concurrent cell writes are serialized by the database without data loss.

## The Schema

Two tables, intentionally simple:

```sql
CREATE TABLE IF NOT EXISTS notebooks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  folder TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notebook_cells (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('sql', 'markdown')),
  content TEXT NOT NULL DEFAULT '',
  pinned_result TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notebook_cells_notebook_id
  ON notebook_cells(notebook_id);
CREATE INDEX IF NOT EXISTS idx_notebooks_updated_at
  ON notebooks(updated_at DESC);
```

A few decisions worth explaining:

**IDs as TEXT UUIDs.** I'm using `randomUUID()` from Node's built-in `crypto` module. This keeps IDs stable across duplication and future sync scenarios — integer auto-increment IDs would collide when merging notebooks from two machines.

**`order_index` as a float.** Not explicitly in the schema (it's `INTEGER DEFAULT 0`), but in practice I use fractional values to insert cells between existing ones without renumbering. When you insert after index 3 and before index 4, the new cell gets `order = 3.5`. This avoids a full reindex on every insertion. The `reorderCells` operation normalizes all indices back to integers using a transaction.

**`updated_at` on notebooks.** This gets bumped by `touchNotebook()` on every cell mutation. The notebook list is sorted by `updated_at DESC`, so recently-edited notebooks float to the top without reading cell data.

**`ON DELETE CASCADE`.** Deleting a notebook deletes all its cells atomically. I chose the database constraint over application-level cleanup to prevent orphaned cells if the app crashes mid-delete.

## Pinned Results as JSON

The `pinned_result` column is `TEXT` — a serialized JSON blob. The `PinnedResult` type:

```typescript
interface PinnedResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  executedAt: number
  durationMs: number
  error: string | null
}
```

I considered a separate `pinned_results` table. The argument for it: you could index by `executed_at`, store large result sets more efficiently with compression, and keep the cells table lean.

I went with the JSON column for three reasons:

1. **Query simplicity.** `SELECT * FROM notebook_cells WHERE notebook_id = ?` gives me everything in one query. A join would add complexity without any practical benefit for the access patterns I have.

2. **Notebook portability.** The `.dpnb` export format includes pinned results inline. Having them in a separate table would require a join on export, and the mismatch between storage shape and export shape would create more conversion code.

3. **Result sets are bounded.** The cell renders at most 100 rows in the UI (`MAX_DISPLAY_ROWS = 100`). The export Markdown table caps at 50. So while pinned results can hold more, the practical size is bounded.

The tradeoff: if `pinned_result` JSON is corrupt (truncated write, manual editing), parsing fails silently and returns null. The `parsePinnedResult` function handles this:

```typescript
function parsePinnedResult(raw: string): PinnedResult | null {
  try {
    return JSON.parse(raw) as PinnedResult
  } catch {
    log.warn('Corrupt pinned_result JSON, falling back to null')
    return null
  }
}
```

The notebook still opens and works — you just lose the pinned result. Given that pinned results are non-critical (you can always re-run the query), silent fallback is the right behavior.

## Transactions for Reorder and Duplicate

Two operations require transactions: cell reordering and notebook duplication.

**Reordering** updates `order_index` for every cell in a notebook. Without a transaction, a crash midway through leaves cells with inconsistent ordering. The transaction wraps the entire batch update:

```typescript
reorderCells(notebookId: string, orderedIds: string[]): void {
  const reorderInTransaction = this.db.transaction(() => {
    for (let i = 0; i < orderedIds.length; i++) {
      this.db
        .prepare('UPDATE notebook_cells SET order_index = ? WHERE id = ? AND notebook_id = ?')
        .run(i, orderedIds[i], notebookId)
    }
    this.touchNotebook(notebookId)
  })
  reorderInTransaction()
}
```

**Duplication** creates a new notebook row and copies every cell row atomically:

```typescript
const duplicateInTransaction = this.db.transaction(() => {
  const newNotebookId = randomUUID()
  // INSERT new notebook...
  for (const cell of original.cells) {
    const newCellId = randomUUID()
    // INSERT new cell with new IDs...
  }
  return newNotebookId
})
const newId = duplicateInTransaction()
```

`better-sqlite3` exposes `db.transaction()` as a higher-order function that wraps any function in an implicit `BEGIN`/`COMMIT` with automatic rollback on throw. It's synchronous (no `await`), which matches the rest of `better-sqlite3`'s API style.

## WAL Mode

The database is opened with `PRAGMA journal_mode = WAL`. WAL (Write-Ahead Logging) allows readers to proceed concurrently with a writer without blocking. In Electron, this matters because:

The main process handles all database writes via IPC. When a user is editing a cell (generating 500ms debounced writes), and simultaneously the app is loading schema data or running a query in another tab, the concurrent access is safe. In default journal mode, writes would acquire an exclusive lock that blocks all readers.

```typescript
constructor(userDataPath: string) {
  const dbPath = join(userDataPath, 'notebooks.db')
  this.db = new Database(dbPath)
  this.db.pragma('journal_mode = WAL')
  this.db.pragma('foreign_keys = ON')
  this.init()
}
```

I also enable `foreign_keys = ON` explicitly. SQLite doesn't enforce foreign keys by default — you have to opt in per connection. With it enabled, deleting a notebook cascades to its cells at the database level.

## The Thin Tab + Rich Store Pattern

The tab system in data-peek stores minimal state per tab. A notebook tab holds only a `notebookId` and a `connectionId`:

```typescript
interface NotebookTab {
  id: string
  type: 'notebook'
  notebookId: string
  connectionId: string | null
  label: string
}
```

When the tab renders, it calls `loadNotebook(notebookId)` which fetches the full `NotebookWithCells` from IPC and drops it into the Zustand store. All cell state, loading state, and save state live in `notebook-store.ts`.

This keeps the tab serialization small (tabs are persisted to electron-store for session restore), and means multiple tabs could theoretically share the same store state — though in practice you'd only have one notebook open at a time per ID.

## How Auto-Save Works

The auto-save flow is split into two operations: an optimistic in-memory update and a debounced IPC write.

When a user types in a cell:

1. `updateCellContent(cellId, content)` fires immediately — a synchronous Zustand mutation that updates the in-memory cell. The UI reflects the change instantly.

2. A 500ms debounce timer is started. If the user keeps typing, the timer resets.

3. When the timer fires, `flushCellContent(cellId, content)` calls `window.api.notebooks.updateCell` via IPC. The main process runs `UPDATE notebook_cells SET content = ? WHERE id = ?`.

4. On success, `lastSavedAt` is updated in the store. The header shows "Saved 3s ago".

```typescript
const handleContentChange = useCallback(
  (value: string) => {
    updateCellContent(cell.id, value)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      flushCellContent(cell.id, value)
    }, 500)
  },
  [cell.id, updateCellContent, flushCellContent]
)
```

The debounce ref is per-cell (stored on the cell component via `useRef`), so editing multiple cells in quick succession doesn't collapse into a single write — each cell manages its own timer.

## The Export Format

The `.dpnb` format is designed to be portable and git-friendly:

```typescript
export function exportAsDpnb(notebook: NotebookWithCells): string {
  const file: DpnbFile = {
    version: 1,
    title: notebook.title,
    folder: notebook.folder,
    cells: notebook.cells.map((cell) => ({
      type: cell.type,
      content: cell.content,
      ...(cell.pinnedResult !== null ? { pinnedResult: cell.pinnedResult } : {})
    }))
  }
  return JSON.stringify(file, null, 2)
}
```

The `version: 1` field is there for forward compatibility. If I change the format, the importer can detect which version it's reading and apply a migration.

Connection information is intentionally excluded from exports. A `.dpnb` file contains queries and documentation, not credentials. When you import a notebook, you choose which connection to bind it to.

The Markdown export is a second format for sharing outside data-peek. It renders pinned results as pipe tables:

```
# Daily Checks

## Active Users

```sql
SELECT COUNT(*) FROM events WHERE ...
```

| count |
| --- |
| 1234 |

*Last run: 2024-01-01T00:00:00.000Z (12ms, 1 rows)*
```

This makes notebooks useful even for people who don't have data-peek installed.
