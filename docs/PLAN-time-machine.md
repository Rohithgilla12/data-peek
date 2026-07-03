# Time Machine — Implementation Plan

## Overview

Time Machine gives every query a memory. Each successful SELECT run in a query tab is
snapshotted to local disk. A timeline strip above the results grid lets you scrub back through
past runs, view any old result read-only, diff any two runs at cell level, and inspect a single
row's values across time.

The pitch: you run the same query all day — checking a migration, watching a job table,
verifying a fix. Today each run overwrites the last and the previous state is gone. Time Machine
answers "what did this look like an hour ago?", "what changed since I last ran this?", and "when
did this row's status flip?" without you having to set anything up. Watch Mode shows you *live*
change; Time Machine shows you *history*.

No SQL client has this. DataGrip and DBeaver keep query text history; nobody keeps *result*
history. It composes with everything already shipped: the Watch Mode differ and row keying do
the diffing, the sparkline renders the row-count trend, and the notebook's better-sqlite3
storage pattern holds the payloads.

## Scope

In scope:

- Auto-capture on every successful manual run in a query tab, when the query is a
  single-statement pure SELECT (same gate as Watch Mode)
- Timeline strip above the grid: one chip per past run (relative time, row count, duration),
  row-count sparkline, oldest → newest, "Live" pinned at the right
- View any past run read-only in the existing grid, with a clear "viewing the past" banner
- Diff any two runs: cell-level highlights via the Watch decoration overlay + summary counts
- Row history: pick a row, see its values across the last runs (PK-keyed)
- Retention: per-query run cap, per-snapshot row/byte caps, global disk budget, oldest-first
  eviction, incremental vacuum
- Privacy: masked columns are redacted *before* rows leave the renderer; global enable toggle +
  storage usage + "Delete all snapshots" in Settings
- `⌘⇧H` toggle (menu accelerator), command palette entry

Out of scope (MVP cuts):

- Capturing watch ticks, notebook cells, AI-assistant runs, table-preview tabs (page flips share
  a fingerprint and would churn the timeline), or main-process scheduler/dashboard runs
- Diffing a snapshot against the *live* unsaved result (value normalization differs; the latest
  run is itself a snapshot, so "diff vs previous" already covers the real use)
- Rendering removed rows inline in the diff grid (counted in the summary, same trade Watch made)
- Cross-connection timelines (two saved connections to the same physical DB keep separate
  timelines — keyed by connection id)
- Compression, payload dedup between identical runs, export of snapshots

## Design decisions (and why)

1. **Capture in the renderer, at `executeSql`'s success path** (`tab-query-editor.tsx`), not in
   the main-process `db:query` handlers. The handler funnel also carries watch ticks (up to
   4/sec), notebook cells, AI runs, editable-grid refreshes and COUNT queries — all noise. The
   renderer hook fires only for user-initiated runs, already sits behind the stale-execution
   guard, and has three things main never has: the user's typed SQL (pre cross-tab expansion),
   the masking state, and the schema-derived PK keying plan.
2. **Fingerprint is the full normalized-SQL string, not the 32-bit hash.** `hashFingerprint` is
   a Java-style 31-bit hash — collisions would silently merge two queries' histories. The main
   process computes `fingerprintQuery(sql)` (already normalizes literals, so `WHERE id = 1` and
   `WHERE id = 2` share a timeline — desired) and keys runs by
   `(connection_id, fingerprint TEXT)`. The renderer treats the fingerprint as opaque; it always
   sends raw SQL and lets main normalize, so `query-fingerprint.ts` stays in main.
3. **Values are normalized once, at capture.** pg returns `Date` for timestamptz, `Buffer` for
   bytea, strings for numerics. JSON round-tripping would make a rehydrated snapshot disagree
   with a live one on every timestamp cell. Rule: snapshots are only ever diffed against other
   snapshots, and `normalizeValue` maps Date → ISO string, bigint → string, undefined → null,
   Uint8Array → `\x…` hex preview capped at 256 bytes. Deterministic on both sides of any diff.
4. **Columnar payload** (`unknown[][]` + column names once), the `PinnedResult` precedent —
   30–50% smaller than repeating keys per row.
5. **Redact before IPC.** Masking is renderer state and display-only; disk is neither. At
   capture, `getEffectiveMaskedColumns(tabId, columnNames)` is evaluated and masked columns are
   stored as the literal `'[MASKED]'` (the export precedent). Masked-in-both cells therefore
   diff as unchanged.
6. **Enabled by default, with the redaction above + a visible off switch.** Query history
   already persists SQL text (with inline literals) by default; snapshots add result data, which
   is why masked columns never reach disk and Settings shows usage + a wipe button. Flagged in
   the handoff for review.
7. **Storage is a new `time-machine.db`** (better-sqlite3, WAL, `auto_vacuum = INCREMENTAL`
   set at creation), not notebooks.db — independent lifecycle, wipeable without touching
   notebooks. Construction failure degrades to null and the handler group is skipped
   (issue #174 pattern).

## Data model

SQLite, `userData/time-machine.db`:

```sql
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  sql TEXT NOT NULL,               -- user's typed SQL as of this run
  captured_at INTEGER NOT NULL,    -- epoch ms
  duration_ms INTEGER NOT NULL,
  row_count INTEGER NOT NULL,      -- true row count of the run
  stored_row_count INTEGER NOT NULL,
  truncated INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,      -- hash of payload; equal hash = "no change" chip
  key_strategy TEXT NOT NULL,      -- 'primary_key' | 'row_position'
  key_columns TEXT NOT NULL,       -- JSON string[]
  columns TEXT NOT NULL,           -- JSON {name,dataType}[]
  rows TEXT,                       -- JSON unknown[][] (columnar); NULL if over byte cap
  payload_bytes INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_conn_fp_at
  ON runs (connection_id, fingerprint, captured_at DESC);
```

Caps (constants in `packages/shared`):

| Constant | Value | Enforced |
|---|---|---|
| `TM_MAX_SNAPSHOT_ROWS` | 2000 | renderer, at capture (`truncated` flag set) |
| `TM_MAX_SNAPSHOT_PAYLOAD_BYTES` | 6 MB | main, on insert — over cap stores metadata only (`rows = NULL`) |
| `TM_MAX_RUNS_PER_QUERY` | 50 | main, on insert — oldest rows for that (conn, fp) deleted |
| `TM_GLOBAL_BUDGET_BYTES` | 512 MB | main, on insert — oldest rows globally deleted until under |

`PRAGMA incremental_vacuum` runs after any eviction/clear so the file actually shrinks.

## Shared types (`packages/shared/src/index.ts`)

```typescript
export interface TimeMachineRunMeta {
  id: string
  connectionId: string
  fingerprint: string
  sql: string
  capturedAt: number
  durationMs: number
  rowCount: number
  storedRowCount: number
  truncated: boolean
  contentHash: string
  keyStrategy: 'primary_key' | 'row_position'
  keyColumns: string[]
  hasRows: boolean
}

export interface TimeMachineSnapshot extends TimeMachineRunMeta {
  columns: { name: string; dataType: string }[]
  rows: unknown[][]
}

export interface TimeMachineCapturePayload {
  connectionId: string
  sql: string
  capturedAt: number
  durationMs: number
  rowCount: number
  truncated: boolean
  keyStrategy: 'primary_key' | 'row_position'
  keyColumns: string[]
  columns: { name: string; dataType: string }[]
  rows: unknown[][]           // normalized + redacted, capped at TM_MAX_SNAPSHOT_ROWS
}

export interface TimeMachineStats {
  runCount: number
  queryCount: number          // distinct (connection, fingerprint) pairs
  totalBytes: number
  oldestCapturedAt: number | null
}
```

## IPC contract

Channels `time-machine:*`, namespace `window.api.timeMachine`:

| Method | Channel | Notes |
|---|---|---|
| `capture(payload)` | `time-machine:capture` | main fingerprints `payload.sql`, hashes content, inserts, enforces caps; returns `TimeMachineRunMeta` |
| `listRuns(connectionId, sql)` | `time-machine:list-runs` | main fingerprints `sql`; returns `{ fingerprint, runs: TimeMachineRunMeta[] }` newest-first, no payloads |
| `getSnapshot(id)` | `time-machine:get-snapshot` | full payload; error if `rows` is NULL (metadata-only run) |
| `deleteRun(id)` | `time-machine:delete-run` | |
| `clearQuery(connectionId, sql)` | `time-machine:clear-query` | wipe one timeline |
| `clearAll(connectionId?)` | `time-machine:clear-all` | all, or one connection |
| `stats()` | `time-machine:stats` | for Settings |

All return `IpcResponse<T>`; handlers follow the inline try/catch envelope style. Handler group
registered as `registerTimeMachineHandlers(storage: TimeMachineStorage | null)` — skipped with a
log.warn when storage failed to construct.

## Phases

### Phase 1 — shared types + constants
`packages/shared/src/index.ts`: types above + the four `TM_*` constants.

### Phase 2 — main: `TimeMachineStorage`
`apps/desktop/src/main/time-machine-storage.ts`, modeled line-for-line on `NotebookStorage`:
constructor takes `userDataPath`, opens `time-machine.db`, sets WAL + `auto_vacuum`, idempotent
DDL in `init()`. Methods: `insertRun(payload, fingerprint)` (single transaction: insert +
per-query cap + global budget eviction + vacuum), `listRuns`, `getSnapshot`, `deleteRun`,
`clearQuery`, `clearAll`, `stats`, `close`. Content hash: sha256 of the serialized payload
(node:crypto). Tests against a temp dir cover caps, eviction order, metadata-only storage,
and the vacuum call.

### Phase 3 — main: handlers + wiring
`apps/desktop/src/main/ipc/time-machine-handlers.ts` + wiring in `ipc/index.ts`
(`registerAllHandlers` gains a `timeMachineStorage: TimeMachineStorage | null` param) and
`main/index.ts` (try/catch construction next to NotebookStorage). Fingerprinting via existing
`main/lib/query-fingerprint.ts` `fingerprintQuery` (not the weak hash).

### Phase 4 — preload
`preload/index.ts` `timeMachine` block + hand-maintained `preload/index.d.ts` in lockstep, plus
`menu.onToggleTimeMachine`.

### Phase 5 — renderer lib: capture
`apps/desktop/src/renderer/src/lib/time-machine-capture.ts`:

- `normalizeValue(v): unknown` — the canonical serialization (decision 3)
- `toColumnarRows(rows, columnNames, maskedColumns): unknown[][]` — normalize + redact + columnar
- `recordsFromColumnar(columns, rows): Record<string, unknown>[]` — inverse, for the grid/differ
- `buildCapturePayload({...}): TimeMachineCapturePayload | null` — returns null unless: setting
  enabled, tab is a query tab, `gateForWatch(sql).ok`, exactly one data-returning statement.
  Row cap applied here.
- `captureRun(...)` — fire-and-forget `window.api.timeMachine.capture`, then
  `useTimeMachineStore.getState().applyCapture(tabId, meta)`
- `ensureTimeMachineTabListener()` — the watch-scheduler tab-close cleanup pattern, verbatim

Hook: in `tab-query-editor.tsx` `executeSql`, inside the existing `isStillCurrent()` success
block, after `addToHistory`. Key columns reuse the existing watch key-column derivation.

### Phase 6 — renderer store
`apps/desktop/src/renderer/src/stores/time-machine-store.ts`, watch-store shape
(`states: Record<tabId, TabTimeMachineState>`, plain zustand, identity-preserving no-ops):

```typescript
interface TabTimeMachineState {
  open: boolean
  fingerprint: string | null
  runs: TimeMachineRunMeta[]        // newest-first
  selectedRunId: string | null      // null = live
  compareRunId: string | null      // non-null => diff mode (older side)
  snapshot: TimeMachineSnapshot | null
  diff: WatchDiff | null
  isLoading: boolean
  error: string | null
}
```

Actions: `toggleStrip`, `loadRuns` (calls `listRuns` with the tab's current SQL), `selectRun`
(fetch snapshot → view mode), `selectCompare` (fetch both → `computeDiff` with a shared keying
plan: the newer run's plan if both runs' `keyColumns` match, else `row_position`; `fadeMs:
Number.MAX_SAFE_INTEGER`, `carryFromPrevious: null`), `backToLive`, `applyCapture` (prepend when
fingerprint matches), `deleteRun`, `stop(tabId)`.

### Phase 7 — UI
- `components/time-machine/time-machine-button.tsx` — toolbar button (History icon, run-count
  badge), wired via a new `timeMachineSlot` on `EditorToolbar` next to `watchSlot`
- `components/time-machine/time-machine-strip.tsx` — mounts in `query-results.tsx` between the
  multi-statement strip and the grid. `WatchSparkline` (metas → `WatchMetricPoint`) + chip rail,
  oldest → newest, auto-scrolled right, "Live" chip pinned. Click = view; ⌥-click or a per-chip
  "compare" affordance = diff vs selected. Dimmed chips for `contentHash === previous` (no
  change); dot marker for truncated/metadata-only runs.
- Snapshot view: in `query-results.tsx`, when a snapshot is selected render a banner (run time,
  row count, truncation notice, "Back to live") + read-only `DataTable` fed
  `recordsFromColumnar(...)` — bypasses the editable branch entirely.
- Diff view: newer run's rows in read-only `DataTable` + `WatchDecorationOverlay` with the
  computed diff; summary line "+A added · −R removed · C cells changed" in the banner.
- Row history: `components/time-machine/row-history-dialog.tsx` — walks the last ≤10 runs with
  payloads, `deriveRowKey` per run, renders column → value-per-run table (changed values
  accented). Entry points: `RowContextMenu` (non-virtualized) and a History action on the cell
  inspector (both grids, optional prop).

### Phase 8 — shortcut, palette, settings, docs
- `menu.ts`: `CmdOrCtrl+Shift+H` "Toggle Time Machine" in the Query menu →
  `menu:toggle-time-machine`; subscription in `tab-query-editor.tsx` (watch pattern)
- Palette `CommandItem` (keywords: history, snapshot, timeline, diff)
- Settings: `timeMachineEnabled` in `AppSettings` (default true) + Time Machine section in
  `settings-modal.tsx` (toggle, storage usage via `stats()`, "Delete all snapshots")
- Four shortcut display surfaces: menu label, `docs/keyboard-shortcuts.md`, Settings
  ShortcutRow list, palette hint
- `README.md` feature bullet, `notes/time-machine.mdx` blog draft (`published: false`),
  roadmap touch

## Testing

Vitest, following existing suite layout:

- `main/__tests__/time-machine-storage.test.ts` — insert/list/get, per-query cap, global budget
  eviction order, metadata-only over-byte-cap runs, clearQuery/clearAll/stats, temp-dir DB
- `main/__tests__/time-machine-handlers.test.ts` — envelope contract, null-storage degrade
- `renderer/src/lib/__tests__/time-machine-capture.test.ts` — gating matrix (setting off,
  multi-statement, non-SELECT, table-preview), normalization (Date/bigint/Uint8Array/undefined),
  redaction, columnar round-trip, row cap
- `renderer/src/stores/__tests__/time-machine-store.test.ts` — lifecycle, view/compare
  transitions, keying-plan agreement fallback, applyCapture fingerprint mismatch, tab-close stop
- Integration-ish: two persisted payloads → `recordsFromColumnar` → `computeDiff` produces
  expected added/removed/changed sets (Date-normalization regression case included)

Existing 619 tests must stay green; `pnpm typecheck` (node + web) and electron-vite build clean.

## Risks / edge cases handled

- **SQL edited between runs** → new fingerprint → `listRuns` returns the new (possibly empty)
  timeline; strip re-syncs on every load. Old timeline still on disk under the old fingerprint.
- **Connection switched on the tab** → runs keyed by connection id; strip reloads.
- **Stale execution** → capture sits inside the existing `isStillCurrent()` guard.
- **Duplicate row keys / all-null keys** → `deriveRowKey` fallback behavior inherited from
  Watch; keying strategy shown in the diff banner ("diffs by position") when not PK-keyed.
- **Metadata-only runs** (over byte cap) → chip renders with a marker; view/diff disabled with
  a tooltip.
- **better-sqlite3 load failure** → storage null, handlers skipped, button hidden (probe via
  `stats()` failure), app unaffected.
- **Multi-window** → handlers are window-agnostic; timelines keyed by (connection, fingerprint)
  are naturally shared; per-window strips just read the same store.

## Estimated size

~2,300 LoC including tests. Comparable to the Watch Mode MVP night.
