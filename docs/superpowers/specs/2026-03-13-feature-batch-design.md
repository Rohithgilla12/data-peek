# Feature Batch Design: 6 New Features for data-peek

**Date:** 2026-03-13
**Approach:** Vertical slices — each feature built end-to-end before moving to the next
**Build order:** Column Statistics → Data Masking → CSV Import → Data Generator → DB Notifications → Health Monitor

---

## Feature 1: Column Statistics

**Purpose:** One-click data profiling per column — min, max, nulls, distinct, distribution.

**UI:** Right sidebar panel that slides in over the table (similar to FK panel stack). Shows stats for the clicked column at top, scrollable list of all columns below.

**Trigger:** Right-click column header → "Column Statistics", keyboard shortcut, or column header dropdown button.

**Stats by column type:**
- All types: total rows, null count (%), distinct count (%)
- Numeric: min, max, avg, std dev, histogram (10 buckets). Median via `percentile_cont(0.5)` only for tables under 1M rows; skipped with a note for larger tables.
- Text: min/max length, avg length, top 5 most common values
- Date/Time: min, max, range, most common values
- Boolean: true/false/null distribution

**Architecture:**
1. User clicks column → renderer sends IPC `db:column-stats` with connection, schema, table, column
2. Main process runs a single aggregate SQL query per adapter (COUNT, MIN, MAX, AVG, COUNT(DISTINCT), etc.)
3. For histogram/distribution, a second query with `width_bucket()` (Postgres) or equivalent
4. Results cached in `column-stats-store.ts` keyed by `connectionId:schema:table:column`
5. Sidebar renders stats; histogram as simple div-based bar chart (no charting library)

**New files:**
- `packages/shared/src/index.ts` — add `ColumnStats`, `ColumnStatsRequest` types
- `src/main/ipc/column-stats-handlers.ts` — IPC handler
- `src/main/adapters/` — add `getColumnStats()` to `DatabaseAdapter` interface
- `src/renderer/src/stores/column-stats-store.ts` — cache + UI state
- `src/renderer/src/components/column-stats-panel.tsx` — sidebar UI

**Modified files:**
- `src/main/db-adapter.ts` — add `getColumnStats()` to `DatabaseAdapter` interface
- `src/main/adapters/postgres-adapter.ts` — implement `getColumnStats()`
- `src/main/adapters/mysql-adapter.ts` — implement `getColumnStats()`
- `src/main/adapters/mssql-adapter.ts` — implement `getColumnStats()`
- `src/main/ipc/index.ts` — register column-stats handlers in `registerAllHandlers()`
- `src/preload/index.ts` — add `db.columnStats()` to preload bridge
- `src/renderer/src/components/data-table.tsx` — add column stats trigger to header context menu

---

## Feature 2: Data Masking

**Purpose:** Blur sensitive columns in query results for demos, screenshots, and pair programming.

**UI:**
- CSS `filter: blur(5px)` + `user-select: none` on masked cells
- 🔒 icon in column header for masked columns
- Hover-to-peek: hold `Alt` + hover to temporarily reveal a cell (configurable in settings)
- Toolbar indicator: "3 columns masked" with toggle to unmask all

**Trigger:** Right-click column header → "Mask Column", toggle in column stats sidebar, or command palette "Mask all sensitive columns".

**Masking layers:**
- Manual masks: user explicitly masks a column (per-tab `Set<columnName>`)
- Auto-mask rules: pattern-based rules persisted in settings (e.g. columns matching `/email|password|ssn|token|secret|key/i` auto-mask). User-configurable.

**Export safety:**
- When exporting with masked columns, show confirmation dialog
- Masked columns in exports get literal `"[MASKED]"` string values, not real data
- Export interception: at the call site before passing data to export functions, clone rows and replace masked column values with `"[MASKED]"`. Export functions themselves remain unchanged.
- This applies to CSV, JSON, and Excel exports

**Architecture:** Renderer-only feature — no IPC, no main process changes, no adapter changes.

**New files:**
- `src/renderer/src/stores/masking-store.ts` — mask state per tab + auto-rules in settings
- `src/renderer/src/components/masking-toolbar.tsx` — toolbar indicator/toggle

**Modified files:**
- `src/renderer/src/components/data-table.tsx` — apply blur CSS to masked columns, add "Mask Column" to header context menu
- `src/renderer/src/components/editable-data-table.tsx` — apply blur CSS
- Call sites for export functions (in tab-query-editor or wherever export is triggered) — intercept and replace masked values before passing to export utils

---

## Feature 3: CSV Import

**Purpose:** Import CSV files into existing or new database tables with full control over mapping, batching, and conflict handling.

**UI:** Multi-step dialog (sheet/modal) with 5 steps:

1. **File Selection** — file picker or drag-and-drop zone. Parse with `papaparse`. Preview first 10 rows.
2. **Target Selection** — dropdown for existing table or "Create New Table" with inferred schema.
3. **Column Mapping** — CSV columns (left) mapped to table columns (right) via dropdowns. Auto-map by header name match (case-insensitive). Type mismatch warnings inline.
4. **Import Options** — batch size (100/500/1000/5000), conflict strategy (error/skip/update via ON CONFLICT), truncate before import, transaction wrapping. PostgreSQL: option to use COPY.
5. **Preview & Execute** — show generated SQL for first few rows. Progress bar with row count/total. Cancel button. Completion summary.

**Trigger:** Right-click table → "Import CSV", command palette, or drag-and-drop `.csv` onto table view.

**File size limits:** Max 100MB via IPC batching. For larger files, stream rows in chunks of `batchSize` and send each batch as a separate IPC call to avoid serialization pressure. Show warning for files over 50MB.

**Type inference for new tables:**
- All integers → `integer` (or `bigint` if > 2^31)
- Decimals → `numeric`
- ISO dates → `timestamp`
- `true`/`false` → `boolean`
- Everything else → `text`
- Nullable if any nulls/empty found in first 100 rows

**Architecture:**
1. CSV parsing in renderer (papaparse, streaming mode for large files)
2. Renderer sends parsed rows in batches to main via IPC `db:import-csv` — one IPC call per batch to control memory
3. Main process adapter builds INSERT statements (or COPY for Postgres) in batches within transaction
4. Progress reported via IPC push events `db:import-progress` (via `webContents.send`)
5. For "Create New Table", generates DDL via existing `ddl-builder.ts`, executes first, then imports
6. Cancellation: renderer sends `db:import-cancel` IPC, main process stops after current batch completes

**Shared batch insert interface** (reused by Feature 4):
```typescript
interface BatchInsertOptions {
  connectionConfig: ConnectionConfig
  schema: string
  table: string
  columns: string[]
  rows: unknown[][]
  batchSize: number
  onConflict: 'error' | 'skip' | 'update'
  onProgress: (inserted: number, total: number) => void
}

function batchInsert(adapter: DatabaseAdapter, options: BatchInsertOptions): Promise<BatchInsertResult>
```
This lives in `src/main/batch-insert.ts` and is used by both CSV Import and Data Generator.

**New files:**
- `packages/shared/src/index.ts` — add `CsvImportRequest`, `CsvImportProgress`, `CsvImportResult`, `CsvColumnMapping`, `CsvImportOptions` types
- `src/main/ipc/import-handlers.ts` — IPC handlers for import + progress + cancel
- `src/main/batch-insert.ts` — shared batch insert logic (used by Features 3 & 4)
- `src/renderer/src/components/csv-import-dialog.tsx` — multi-step dialog
- `src/renderer/src/stores/import-store.ts` — import state, progress, column mappings

**Modified files:**
- `src/main/ipc/index.ts` — register import handlers
- `src/preload/index.ts` — add `db.importCsv()`, `db.cancelImport()` to preload bridge

**Adapter additions:** `importBatch()` method added to `DatabaseAdapter` interface. Postgres uses COPY FROM STDIN, MySQL uses batch INSERT, MSSQL uses bulk insert.

**New dependency:** `papaparse` (renderer runtime dependency, not devDependency)

---

## Feature 4: Data Generator

**Purpose:** Generate realistic fake data for testing, aware of schema structure and foreign key relationships.

**UI:** Dedicated tab (type `data-generator`) with three sections:

1. **Table Selection & Config** — pick target table (or multiple for FK-aware generation). Row count input (1–10,000). Seed input for reproducible output.
2. **Column Configuration** — table listing each column:
   - Column name + data type (from schema cache)
   - Generator dropdown — auto-selected by name/type heuristics (e.g. `email` column → `faker.internet.email`, `created_at` → `faker.date.recent`, enum columns → random from actual values)
   - Custom override: regex pattern, fixed value, or expression
   - Nullable toggle with null percentage slider
   - Skip toggle for auto-increment/serial columns
3. **Preview & Execute** — preview 5 rows. Show INSERT SQL. Progress bar. Cancel button. Summary.

**FK-aware generation:**
- FK columns pull existing IDs from referenced table (`SELECT id FROM ref_table LIMIT 1000`)
- When generating across multiple tables, user orders the sequence (parent first)

**Heuristics engine:** Simple map of `{ columnNamePattern: RegExp, dataType: string } → fakerMethod`. Users override any auto-detected generator.

**Architecture:**
1. Schema info read from connection store cache (columns, FKs, enums)
2. Generation runs in main process (Faker in Node) via IPC `db:generate-data`
3. Rows generated in memory, inserted via shared `batchInsert()` from `src/main/batch-insert.ts` (Feature 3)
4. Progress via IPC push events `db:generate-progress`
5. Cancellation: `db:generate-cancel` IPC, stops after current batch

**New files:**
- `packages/shared/src/index.ts` — add `DataGenConfig`, `ColumnGenerator`, `DataGenResult` types
- `src/main/ipc/data-gen-handlers.ts` — IPC handler
- `src/main/data-generator.ts` — Faker integration, FK resolution, heuristics engine
- `src/renderer/src/stores/data-gen-store.ts` — tab state, column generator configs
- `src/renderer/src/components/data-generator.tsx` — tab UI

**Modified files:**
- `src/main/ipc/index.ts` — register data-gen handlers
- `src/preload/index.ts` — add `db.generateData()`, `db.cancelGenerate()` to preload bridge
- `src/renderer/src/stores/tab-store.ts` — add `'data-generator'` tab type, update guard clauses that check tab type

**New dependency:** `@faker-js/faker` (main process dependency). Use tree-shakeable locale-specific import (`import { faker } from '@faker-js/faker/locale/en'`) to reduce bundle size from ~6MB to ~2MB.

---

## Feature 5: Database Notifications (PostgreSQL)

**Purpose:** Full pub/sub dashboard for PostgreSQL LISTEN/NOTIFY — subscribe, send, persist, monitor.

**UI:** Dedicated tab (type `pg-notifications`) with three sections:

1. **Channel Management Bar** — input to subscribe + "Listen" button. Active channels as dismissible pills. Recent channels for quick re-subscribe.
2. **Event Log** — real-time scrolling log:
   - Timestamp, channel, payload (JSON syntax highlighted if valid JSON)
   - Filter by channel, search payload text
   - Click to expand, copy payload, clear log
   - Event count badge per channel
3. **Send Panel** — collapsible bottom section:
   - Channel dropdown (from active subscriptions), payload textarea (JSON formatting), send button, recent payloads

**Stats sidebar (toggleable):** Events/sec (rolling 60s), total per channel, avg payload size, connection uptime.

**Architecture — dedicated connection:**
1. LISTEN requires a connection that stays open (can't use query pool)
2. Main process creates separate `pg.Client` for LISTEN on first subscription
3. Client forwards `notification` events to all windows via `BrowserWindow.getAllWindows().forEach(w => w.webContents.send(...))` — same pattern used by dashboard refresh broadcasts
4. Auto-reconnect with exponential backoff on disconnect, re-subscribes all channels
5. Event history persisted in `better-sqlite3` local storage, capped at 10,000 events per connection. Schema: `CREATE TABLE pg_notification_events (id INTEGER PRIMARY KEY, connection_id TEXT, channel TEXT, payload TEXT, received_at INTEGER)`

**IPC channels:** Prefixed with `pg-notify:` to avoid collision with existing UI notification system.
- `pg-notify:subscribe(connectionId, channel)` — LISTEN
- `pg-notify:unsubscribe(connectionId, channel)` — UNLISTEN
- `pg-notify:send(connectionId, channel, payload)` — NOTIFY
- `pg-notify:get-channels(connectionId)` — list active
- `pg-notify:get-history(connectionId, limit)` — fetch persisted
- `pg-notify:clear-history(connectionId)` — purge
- `pg-notify:event` — push from main → renderer via `webContents.send`

**PostgreSQL only.** Feature hidden for non-PG connections in sidebar nav.

**New files:**
- `packages/shared/src/index.ts` — add `PgNotificationEvent`, `PgNotificationChannel`, `PgNotificationStats` types
- `src/main/ipc/pg-notify-handlers.ts` — IPC handlers
- `src/main/pg-notification-listener.ts` — dedicated pg.Client manager, reconnect, event forwarding
- `src/renderer/src/stores/pg-notification-store.ts` — events, channels, stats, history
- `src/renderer/src/components/pg-notifications-panel.tsx` — tab UI

**Modified files:**
- `src/main/ipc/index.ts` — register pg-notify handlers
- `src/preload/index.ts` — add `pgNotify.*` namespace to preload bridge
- `src/renderer/src/stores/tab-store.ts` — add `'pg-notifications'` tab type, update guard clauses

---

## Feature 6: Connection Health Monitor

**Purpose:** Dashboard showing active queries, table sizes, cache performance, and lock contention.

**UI:** Dedicated tab (type `health-monitor`) with 4 cards in a dashboard grid:

1. **Active Queries** — table from `pg_stat_activity` / `SHOW PROCESSLIST` / `sys.dm_exec_requests`:
   - PID, user, database, state, duration, query text (truncated, expandable)
   - Sorted by duration (longest first)
   - "Kill Query" button per row with confirmation dialog ("Terminate process {pid}? This will cancel the running query.")
   - Auto-refresh every 2s when visible

2. **Database & Table Sizes** — sortable table:
   - Table name, row count estimate, data size, index size, total size
   - Visual size bar proportional to largest
   - Database total as KPI card at top

3. **Cache Hit Ratios** — KPI cards with color-coded gauges:
   - Buffer cache hit ratio (green >99%, yellow 95-99%, red <95%)
   - Index hit ratio (index scans vs sequential scans)
   - Adapter-specific queries for each database

4. **Locks & Blocking** — table:
   - Blocked PID, blocking PID, lock type, relation, wait duration
   - "Kill Blocker" action with confirmation dialog
   - Empty state: green checkmark "No blocking locks"

**Auto-refresh:** Configurable (2s/5s/10s/30s/off) via dropdown in tab header. Each card refreshes independently. Manual refresh per card. Polling stops when tab is not active.

**Architecture:**
1. Each card maps to one IPC call running a diagnostic SQL query
2. `getActiveQueries()`, `getTableSizes()`, `getCacheStats()`, `getLocks()` added to `DatabaseAdapter` interface
3. Renderer polls on configured interval via `setInterval`, clears on tab deactivation
4. Kill query via new `db:kill-query(connectionId, pid)` IPC with confirmation required in renderer

**Multi-database:** All 4 cards work across PostgreSQL, MySQL, MSSQL with adapter-specific SQL. Cache stats less detailed for MySQL/MSSQL.

**New files:**
- `packages/shared/src/index.ts` — add `ActiveQuery`, `TableSizeInfo`, `CacheStats`, `LockInfo` types
- `src/main/ipc/health-handlers.ts` — IPC handlers for 4 stat queries + kill
- `src/renderer/src/stores/health-store.ts` — stats state, refresh config
- `src/renderer/src/components/health-monitor.tsx` — dashboard tab UI

**Modified files:**
- `src/main/db-adapter.ts` — add diagnostic methods to `DatabaseAdapter` interface
- `src/main/adapters/postgres-adapter.ts` — implement diagnostic queries
- `src/main/adapters/mysql-adapter.ts` — implement diagnostic queries
- `src/main/adapters/mssql-adapter.ts` — implement diagnostic queries
- `src/main/ipc/index.ts` — register health handlers
- `src/preload/index.ts` — add `db.activeQueries()`, `db.tableSizes()`, `db.cacheStats()`, `db.locks()`, `db.killQuery()` to preload bridge
- `src/renderer/src/stores/tab-store.ts` — add `'health-monitor'` tab type, update guard clauses

---

## Cross-Cutting Concerns

**New tab types to register (with guard clause updates in tab-store.ts):**
- `'data-generator'` (Feature 4)
- `'pg-notifications'` (Feature 5)
- `'health-monitor'` (Feature 6)

All guard clauses in `tab-store.ts` that check `tab.type === 'erd' || tab.type === 'table-designer'` must be updated to also exclude these new types from query-specific logic (pagination, dirty detection, execution, etc.).

**Preload bridge updates:** Every feature with IPC (1, 3, 4, 5, 6) requires additions to `src/preload/index.ts` and the `Api` type.

**IPC handler registration:** Every feature's handler file must be imported and called in `src/main/ipc/index.ts` → `registerAllHandlers()`.

**Shared batch insert:** `src/main/batch-insert.ts` is built in Feature 3 and reused in Feature 4. Defined interface above in Feature 3.

**Multi-window broadcasting:** Features 3, 4, 5, and 6 use IPC push events. Use `BrowserWindow.getAllWindows()` pattern consistent with existing dashboard refresh broadcasts.

**No breaking changes** to existing interfaces or behavior. All features are additive. New methods on `DatabaseAdapter` are additions only.
