# Feature Batch Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 new features to data-peek: Column Statistics, Data Masking, CSV Import, Data Generator, DB Notifications, and Connection Health Monitor.

**Architecture:** Vertical slices — each feature built end-to-end (types → IPC → adapter → store → UI) before moving to the next. Features 3 & 4 share a batch insert module. Features 4, 5, 6 add new tab types.

**Tech Stack:** Electron IPC, Zustand stores, React components, PostgreSQL/MySQL/MSSQL adapters, papaparse (CSV), @faker-js/faker (data gen)

**Spec:** `docs/superpowers/specs/2026-03-13-feature-batch-design.md`

---

## Critical Implementation Notes

**Adapter pattern**: Every adapter method MUST follow the existing pattern: create a new `Client` per call with SSH tunnel support, wrap in `try/finally`, call `client.end()` and `closeTunnel()` in finally. Never use `this.getClient()` — it does not exist. See `PostgresAdapter.query()` for the reference pattern.

**Preload event subscriptions**: There is no `subscribeToEvent` helper. Use the existing pattern from `preload/index.ts`:
```typescript
onSomeEvent: (callback: (data: SomeType) => void): (() => void) => {
  const handler = (_: unknown, data: SomeType): void => callback(data)
  ipcRenderer.on('channel-name', handler)
  return () => ipcRenderer.removeListener('channel-name', handler)
}
```

**New tab types**: Each new tab type needs:
1. Add to `TabType` union (line 22 of `tab-store.ts`)
2. Define a tab interface extending `BaseTab` (e.g. `interface DataGeneratorTab extends BaseTab { type: 'data-generator'; schema: string; tableName?: string }`)
3. Add to `Tab` union type (line 83: `export type Tab = QueryTab | ... | DataGeneratorTab`)
4. Update ALL guard clauses that check `tab.type === 'erd' || tab.type === 'table-designer'` to also include the new type
5. Add to `PersistedTab` handling if the tab should survive app restart

**Tab container file**: The tab content rendering switch lives in `apps/desktop/src/renderer/src/components/tab-container.tsx`. New tab types need a case added there.

**Sidebar nav file**: The sidebar navigation is in `apps/desktop/src/renderer/src/components/app-sidebar.tsx`. New nav items go there.

**MySQL/MSSQL adapters**: Follow the same SSH tunnel + try/finally pattern as PostgreSQL. MySQL uses `mysql2` client, MSSQL uses `mssql` client — check existing methods in each adapter for the exact connection pattern.

---

## File Structure

### Feature 1: Column Statistics
| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `packages/shared/src/index.ts` | Add `ColumnStats`, `ColumnStatsRequest` types |
| Create | `apps/desktop/src/main/ipc/column-stats-handlers.ts` | IPC handler for `db:column-stats` |
| Modify | `apps/desktop/src/main/db-adapter.ts:55-99` | Add `getColumnStats()` to `DatabaseAdapter` interface |
| Modify | `apps/desktop/src/main/adapters/postgres-adapter.ts` | Implement `getColumnStats()` |
| Modify | `apps/desktop/src/main/adapters/mysql-adapter.ts` | Implement `getColumnStats()` |
| Modify | `apps/desktop/src/main/adapters/mssql-adapter.ts` | Implement `getColumnStats()` |
| Modify | `apps/desktop/src/main/ipc/index.ts:29-64` | Register column-stats handlers |
| Modify | `apps/desktop/src/preload/index.ts:78-132` | Add `db.columnStats()` to bridge |
| Create | `apps/desktop/src/renderer/src/stores/column-stats-store.ts` | Cache + UI state |
| Create | `apps/desktop/src/renderer/src/components/column-stats-panel.tsx` | Right sidebar UI |
| Modify | `apps/desktop/src/renderer/src/components/data-table.tsx:196-228` | Add stats trigger to header |

### Feature 2: Data Masking
| Action | File | Responsibility |
|--------|------|---------------|
| Create | `apps/desktop/src/renderer/src/stores/masking-store.ts` | Mask state + auto-rules |
| Create | `apps/desktop/src/renderer/src/components/masking-toolbar.tsx` | Toolbar indicator/toggle |
| Modify | `apps/desktop/src/renderer/src/components/data-table.tsx` | Apply blur CSS to masked cols |
| Modify | `apps/desktop/src/renderer/src/components/editable-data-table.tsx` | Apply blur CSS |
| Modify | `apps/desktop/src/renderer/src/lib/export.ts:30-48` | Intercept masked cols on export |

### Feature 3: CSV Import
| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `packages/shared/src/index.ts` | Add CSV import types |
| Create | `apps/desktop/src/main/batch-insert.ts` | Shared batch insert logic |
| Create | `apps/desktop/src/main/ipc/import-handlers.ts` | IPC handlers for import |
| Modify | `apps/desktop/src/main/db-adapter.ts` | Add `importBatch()` to interface |
| Modify | `apps/desktop/src/main/adapters/postgres-adapter.ts` | Implement `importBatch()` |
| Modify | `apps/desktop/src/main/adapters/mysql-adapter.ts` | Implement `importBatch()` |
| Modify | `apps/desktop/src/main/adapters/mssql-adapter.ts` | Implement `importBatch()` |
| Modify | `apps/desktop/src/main/ipc/index.ts` | Register import handlers |
| Modify | `apps/desktop/src/preload/index.ts` | Add `db.importCsv()` to bridge |
| Create | `apps/desktop/src/renderer/src/stores/import-store.ts` | Import state + progress |
| Create | `apps/desktop/src/renderer/src/components/csv-import-dialog.tsx` | Multi-step dialog |

### Feature 4: Data Generator
| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `packages/shared/src/index.ts` | Add data gen types |
| Create | `apps/desktop/src/main/data-generator.ts` | Faker + heuristics + FK resolution |
| Create | `apps/desktop/src/main/ipc/data-gen-handlers.ts` | IPC handlers |
| Modify | `apps/desktop/src/main/ipc/index.ts` | Register data-gen handlers |
| Modify | `apps/desktop/src/preload/index.ts` | Add `db.generateData()` to bridge |
| Create | `apps/desktop/src/renderer/src/stores/data-gen-store.ts` | Tab state + column configs |
| Create | `apps/desktop/src/renderer/src/components/data-generator.tsx` | Tab UI |
| Modify | `apps/desktop/src/renderer/src/stores/tab-store.ts:22` | Add `'data-generator'` type |

### Feature 5: DB Notifications
| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `packages/shared/src/index.ts` | Add notification types |
| Create | `apps/desktop/src/main/pg-notification-listener.ts` | Dedicated pg.Client manager |
| Create | `apps/desktop/src/main/ipc/pg-notify-handlers.ts` | IPC handlers |
| Modify | `apps/desktop/src/main/ipc/index.ts` | Register pg-notify handlers |
| Modify | `apps/desktop/src/preload/index.ts` | Add `pgNotify.*` namespace |
| Create | `apps/desktop/src/renderer/src/stores/pg-notification-store.ts` | Events + channels + stats |
| Create | `apps/desktop/src/renderer/src/components/pg-notifications-panel.tsx` | Tab UI |
| Modify | `apps/desktop/src/renderer/src/stores/tab-store.ts` | Add `'pg-notifications'` type |

### Feature 6: Health Monitor
| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `packages/shared/src/index.ts` | Add health monitor types |
| Create | `apps/desktop/src/main/ipc/health-handlers.ts` | IPC handlers for 4 stat queries + kill |
| Modify | `apps/desktop/src/main/db-adapter.ts` | Add diagnostic methods to interface |
| Modify | `apps/desktop/src/main/adapters/postgres-adapter.ts` | Implement diagnostics |
| Modify | `apps/desktop/src/main/adapters/mysql-adapter.ts` | Implement diagnostics |
| Modify | `apps/desktop/src/main/adapters/mssql-adapter.ts` | Implement diagnostics |
| Modify | `apps/desktop/src/main/ipc/index.ts` | Register health handlers |
| Modify | `apps/desktop/src/preload/index.ts` | Add health namespace to bridge |
| Create | `apps/desktop/src/renderer/src/stores/health-store.ts` | Stats state + refresh config |
| Create | `apps/desktop/src/renderer/src/components/health-monitor.tsx` | Dashboard tab UI |
| Modify | `apps/desktop/src/renderer/src/stores/tab-store.ts` | Add `'health-monitor'` type |

---

## Chunk 1: Column Statistics

### Task 1.1: Shared Types

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add ColumnStats types to shared package**

Add at end of file:

```typescript
export interface ColumnStatsRequest {
  schema: string
  table: string
  column: string
  dataType: string
}

export type ColumnStatsType = 'numeric' | 'text' | 'datetime' | 'boolean' | 'other'

export interface HistogramBucket {
  min: number
  max: number
  count: number
}

export interface CommonValue {
  value: string | null
  count: number
  percentage: number
}

export interface ColumnStats {
  column: string
  dataType: string
  statsType: ColumnStatsType
  totalRows: number
  nullCount: number
  nullPercentage: number
  distinctCount: number
  distinctPercentage: number
  min?: string | number | null
  max?: string | number | null
  avg?: number | null
  median?: number | null
  stdDev?: number | null
  minLength?: number | null
  maxLength?: number | null
  avgLength?: number | null
  histogram?: HistogramBucket[]
  commonValues?: CommonValue[]
  trueCount?: number
  falseCount?: number
}
```

- [ ] **Step 2: Run typecheck to verify types compile**

Run: `cd apps/desktop && pnpm typecheck:node`
Expected: PASS (no errors from new types)

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add ColumnStats types"
```

### Task 1.2: DatabaseAdapter Interface Extension

**Files:**
- Modify: `apps/desktop/src/main/db-adapter.ts:55-99`

- [ ] **Step 1: Add getColumnStats to DatabaseAdapter interface**

After `getTypes` method (line 98), add:

```typescript
  getColumnStats(
    config: ConnectionConfig,
    schema: string,
    table: string,
    column: string,
    dataType: string
  ): Promise<ColumnStats>
```

Import `ColumnStats` from `@shared/index`.

- [ ] **Step 2: Run typecheck — expect failures in adapters**

Run: `cd apps/desktop && pnpm typecheck:node`
Expected: FAIL — all 3 adapters missing `getColumnStats`

- [ ] **Step 3: Add stub implementations to all adapters**

In each adapter (`postgres-adapter.ts`, `mysql-adapter.ts`, `mssql-adapter.ts`), add a stub method at the end of the class:

```typescript
async getColumnStats(
  config: ConnectionConfig,
  schema: string,
  table: string,
  column: string,
  dataType: string
): Promise<ColumnStats> {
  throw new Error('getColumnStats not implemented')
}
```

- [ ] **Step 4: Run typecheck — should pass**

Run: `cd apps/desktop && pnpm typecheck:node`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/db-adapter.ts apps/desktop/src/main/adapters/
git commit -m "feat(adapters): add getColumnStats to DatabaseAdapter interface"
```

### Task 1.3: PostgreSQL Column Stats Implementation

**Files:**
- Modify: `apps/desktop/src/main/adapters/postgres-adapter.ts`

- [ ] **Step 1: Replace stub with real PostgreSQL implementation**

Replace the `getColumnStats` stub in `PostgresAdapter` with the real implementation. **Important**: Follow the existing adapter pattern — create a new `Client` per call, connect, run queries in try/finally, then `client.end()` and `closeTunnel()`. Example from existing `query()` method:

```typescript
async getColumnStats(
  config: ConnectionConfig,
  schema: string,
  table: string,
  column: string,
  dataType: string
): Promise<ColumnStats> {
  let tunnelSession: TunnelSession | null = null
  if (config.ssh) {
    tunnelSession = await createTunnel(config)
  }
  const tunnelOverrides = tunnelSession
    ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
    : undefined
  const client = new Client(buildClientConfig(config, tunnelOverrides))

  try {
    await client.connect()
    const quotedTable = `"${schema}"."${table}"`
    const quotedCol = `"${column}"`

  const statsType = this.classifyColumnType(dataType)

  const baseQuery = `
    SELECT
      COUNT(*) as total_rows,
      COUNT(*) - COUNT(${quotedCol}) as null_count,
      COUNT(DISTINCT ${quotedCol}) as distinct_count
    FROM ${quotedTable}
  `
  const baseResult = await client.query(baseQuery)
  const base = baseResult.rows[0]
  const totalRows = parseInt(base.total_rows)
  const nullCount = parseInt(base.null_count)
  const distinctCount = parseInt(base.distinct_count)

  const stats: ColumnStats = {
    column,
    dataType,
    statsType,
    totalRows,
    nullCount,
    nullPercentage: totalRows > 0 ? (nullCount / totalRows) * 100 : 0,
    distinctCount,
    distinctPercentage: totalRows > 0 ? (distinctCount / totalRows) * 100 : 0,
  }

  if (statsType === 'numeric') {
    const numQuery = `
      SELECT
        MIN(${quotedCol})::text as min_val,
        MAX(${quotedCol})::text as max_val,
        AVG(${quotedCol}::numeric)::float8 as avg_val,
        STDDEV(${quotedCol}::numeric)::float8 as std_dev
      FROM ${quotedTable}
      WHERE ${quotedCol} IS NOT NULL
    `
    const numResult = await client.query(numQuery)
    const num = numResult.rows[0]
    stats.min = parseFloat(num.min_val)
    stats.max = parseFloat(num.max_val)
    stats.avg = num.avg_val
    stats.stdDev = num.std_dev

    if (totalRows <= 1_000_000) {
      const medianQuery = `
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ${quotedCol}::numeric)::float8 as median
        FROM ${quotedTable}
        WHERE ${quotedCol} IS NOT NULL
      `
      const medianResult = await client.query(medianQuery)
      stats.median = medianResult.rows[0].median
    }

    if (stats.min != null && stats.max != null && stats.min !== stats.max) {
      const histQuery = `
        SELECT
          width_bucket(${quotedCol}::numeric, ${stats.min}, ${stats.max + 0.0001}, 10) as bucket,
          COUNT(*) as count,
          MIN(${quotedCol}::numeric)::float8 as bucket_min,
          MAX(${quotedCol}::numeric)::float8 as bucket_max
        FROM ${quotedTable}
        WHERE ${quotedCol} IS NOT NULL
        GROUP BY bucket
        ORDER BY bucket
      `
      const histResult = await client.query(histQuery)
      stats.histogram = histResult.rows.map((r) => ({
        min: r.bucket_min,
        max: r.bucket_max,
        count: parseInt(r.count),
      }))
    }
  } else if (statsType === 'text') {
    const textQuery = `
      SELECT
        MIN(LENGTH(${quotedCol})) as min_length,
        MAX(LENGTH(${quotedCol})) as max_length,
        AVG(LENGTH(${quotedCol}))::float8 as avg_length
      FROM ${quotedTable}
      WHERE ${quotedCol} IS NOT NULL
    `
    const textResult = await client.query(textQuery)
    const text = textResult.rows[0]
    stats.minLength = parseInt(text.min_length)
    stats.maxLength = parseInt(text.max_length)
    stats.avgLength = text.avg_length
  } else if (statsType === 'datetime') {
    const dateQuery = `
      SELECT
        MIN(${quotedCol})::text as min_val,
        MAX(${quotedCol})::text as max_val
      FROM ${quotedTable}
      WHERE ${quotedCol} IS NOT NULL
    `
    const dateResult = await client.query(dateQuery)
    stats.min = dateResult.rows[0].min_val
    stats.max = dateResult.rows[0].max_val
  } else if (statsType === 'boolean') {
    const boolQuery = `
      SELECT
        COUNT(*) FILTER (WHERE ${quotedCol} = true) as true_count,
        COUNT(*) FILTER (WHERE ${quotedCol} = false) as false_count
      FROM ${quotedTable}
    `
    const boolResult = await client.query(boolQuery)
    stats.trueCount = parseInt(boolResult.rows[0].true_count)
    stats.falseCount = parseInt(boolResult.rows[0].false_count)
  }

  if (statsType !== 'boolean') {
    const commonQuery = `
      SELECT ${quotedCol}::text as value, COUNT(*) as count
      FROM ${quotedTable}
      WHERE ${quotedCol} IS NOT NULL
      GROUP BY ${quotedCol}
      ORDER BY count DESC
      LIMIT 5
    `
    const commonResult = await client.query(commonQuery)
    stats.commonValues = commonResult.rows.map((r) => ({
      value: r.value,
      count: parseInt(r.count),
      percentage: totalRows > 0 ? (parseInt(r.count) / totalRows) * 100 : 0,
    }))
  }

    return stats
  } finally {
    await client.end().catch(() => {})
    closeTunnel(tunnelSession)
  }
}

// Add this as a private method inside the PostgresAdapter class:
private classifyColumnType(dataType: string): ColumnStatsType {
  const dt = dataType.toLowerCase()
  if (/^(smallint|integer|bigint|decimal|numeric|real|double|float|serial|smallserial|bigserial|int|tinyint|mediumint|money)/.test(dt)) return 'numeric'
  if (/^(bool)/.test(dt)) return 'boolean'
  if (/^(date|time|timestamp|interval|datetime)/.test(dt)) return 'datetime'
  if (/^(char|varchar|text|citext|name|bpchar|nchar|nvarchar|ntext)/.test(dt)) return 'text'
  return 'other'
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck:node`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main/adapters/postgres-adapter.ts
git commit -m "feat(postgres): implement getColumnStats with histogram and common values"
```

### Task 1.4: MySQL and MSSQL Column Stats Implementations

**Files:**
- Modify: `apps/desktop/src/main/adapters/mysql-adapter.ts`
- Modify: `apps/desktop/src/main/adapters/mssql-adapter.ts`

- [ ] **Step 1: Implement MySQL getColumnStats**

Replace stub in `MysqlAdapter`. Same pattern as PostgreSQL but with MySQL syntax:
- Use `COUNT(DISTINCT col)` (same)
- No `width_bucket` — use `CASE WHEN` with computed ranges for histogram
- No `percentile_cont` — skip median
- Use `CHAR_LENGTH()` instead of `LENGTH()` for text stats
- Use backtick quoting instead of double-quote

- [ ] **Step 2: Implement MSSQL getColumnStats**

Replace stub in `MssqlAdapter`. Same pattern but with MSSQL syntax:
- Use `COUNT(DISTINCT col)` (same)
- Use `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY col) OVER()` for median
- Use `LEN()` for text stats
- Use `[bracket]` quoting

- [ ] **Step 3: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck:node`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/adapters/mysql-adapter.ts apps/desktop/src/main/adapters/mssql-adapter.ts
git commit -m "feat(mysql,mssql): implement getColumnStats"
```

### Task 1.5: IPC Handler + Preload Bridge

**Files:**
- Create: `apps/desktop/src/main/ipc/column-stats-handlers.ts`
- Modify: `apps/desktop/src/main/ipc/index.ts:29-64`
- Modify: `apps/desktop/src/preload/index.ts`

- [ ] **Step 1: Create column-stats IPC handler**

```typescript
import { ipcMain } from 'electron'
import { getAdapter } from '../db-adapter'
import type { ConnectionConfig, ColumnStatsRequest } from '@shared/index'

export function registerColumnStatsHandlers(): void {
  ipcMain.handle(
    'db:column-stats',
    async (_, config: ConnectionConfig, request: ColumnStatsRequest) => {
      try {
        const adapter = getAdapter(config)
        const stats = await adapter.getColumnStats(
          config,
          request.schema,
          request.table,
          request.column,
          request.dataType || 'text'
        )
        return { success: true, data: stats }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )
}
```

- [ ] **Step 2: Register in ipc/index.ts**

Import and call `registerColumnStatsHandlers()` inside `registerAllHandlers()`.

- [ ] **Step 3: Add to preload bridge**

In the `db` namespace of the api object (around line 132), add:

```typescript
columnStats(config: ConnectionConfig, request: ColumnStatsRequest) {
  return ipcRenderer.invoke('db:column-stats', config, request) as Promise<IpcResponse<ColumnStats>>
}
```

Add `ColumnStats` and `ColumnStatsRequest` to imports from `@shared/index`.

- [ ] **Step 4: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc/column-stats-handlers.ts apps/desktop/src/main/ipc/index.ts apps/desktop/src/preload/index.ts
git commit -m "feat(ipc): add column-stats handler and preload bridge"
```

### Task 1.6: Zustand Store

**Files:**
- Create: `apps/desktop/src/renderer/src/stores/column-stats-store.ts`
- Modify: `apps/desktop/src/renderer/src/stores/index.ts`

- [ ] **Step 1: Create column-stats store**

```typescript
import { create } from 'zustand'
import type { ColumnStats } from '@shared/index'

interface ColumnStatsState {
  stats: Map<string, ColumnStats>
  isLoading: boolean
  error: string | null
  selectedColumn: string | null
  isPanelOpen: boolean

  fetchStats: (
    connectionId: string,
    schema: string,
    table: string,
    column: string,
    dataType: string
  ) => Promise<void>
  selectColumn: (column: string | null) => void
  openPanel: () => void
  closePanel: () => void
  clearCache: () => void
}

function cacheKey(connectionId: string, schema: string, table: string, column: string): string {
  return `${connectionId}:${schema}:${table}:${column}`
}

export const useColumnStatsStore = create<ColumnStatsState>((set, get) => ({
  stats: new Map(),
  isLoading: false,
  error: null,
  selectedColumn: null,
  isPanelOpen: false,

  fetchStats: async (connectionId, schema, table, column, dataType) => {
    const key = cacheKey(connectionId, schema, table, column)
    if (get().stats.has(key)) {
      set({ selectedColumn: column, isPanelOpen: true, error: null })
      return
    }

    set({ isLoading: true, error: null, selectedColumn: column, isPanelOpen: true })
    try {
      const result = await window.api.db.columnStats(
        { id: connectionId } as any,
        { schema, table, column, dataType }
      )
      if (result.success && result.data) {
        const newStats = new Map(get().stats)
        newStats.set(key, result.data)
        set({ stats: newStats, isLoading: false })
      } else {
        set({ error: result.error || 'Failed to fetch stats', isLoading: false })
      }
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  selectColumn: (column) => set({ selectedColumn: column }),
  openPanel: () => set({ isPanelOpen: true }),
  closePanel: () => set({ isPanelOpen: false, selectedColumn: null }),
  clearCache: () => set({ stats: new Map() }),
}))
```

- [ ] **Step 2: Export from stores/index.ts**

Add `export * from './column-stats-store'` to `apps/desktop/src/renderer/src/stores/index.ts`.

- [ ] **Step 3: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck:web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/stores/column-stats-store.ts apps/desktop/src/renderer/src/stores/index.ts
git commit -m "feat(store): add column-stats store with caching"
```

### Task 1.7: Column Stats Panel UI

**Files:**
- Create: `apps/desktop/src/renderer/src/components/column-stats-panel.tsx`

- [ ] **Step 1: Create the sidebar panel component**

Build a right sidebar panel that:
- Shows stats for the selected column at the top
- Renders histogram as div-based bars for numeric columns
- Shows common values as a list with percentage bars
- Shows boolean distribution as colored bar segments
- Has a close button and column name header
- Uses existing UI primitives (ScrollArea, Badge, Button from shadcn)
- Matches the existing app theme (dark/light via CSS variables)

Key structure:
```tsx
export function ColumnStatsPanel() {
  const { stats, isLoading, error, selectedColumn, isPanelOpen, closePanel } = useColumnStatsStore()
  const { activeConnectionId, schemas } = useConnectionStore()
  // ... render sidebar with stats
}
```

The panel should be conditionally rendered in the main layout when `isPanelOpen` is true, positioned absolutely on the right side of the table area.

- [ ] **Step 2: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck:web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/column-stats-panel.tsx
git commit -m "feat(ui): add column stats sidebar panel"
```

### Task 1.8: Integrate Stats Trigger in Data Table

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/data-table.tsx:196-228`

- [ ] **Step 1: Add "Column Statistics" to column header context menu**

In the column header rendering area (around line 196-228), add a context menu item or button that calls `useColumnStatsStore().fetchStats()` with the column info. The trigger should appear in the existing column header interaction (right-click or dropdown).

- [ ] **Step 2: Mount ColumnStatsPanel in the table layout**

Import and render `<ColumnStatsPanel />` in the parent component that wraps the data table, positioned as a right sidebar overlay.

- [ ] **Step 3: Run typecheck and lint**

Run: `cd apps/desktop && pnpm typecheck:web && pnpm lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/components/data-table.tsx apps/desktop/src/renderer/src/components/
git commit -m "feat(ui): integrate column stats trigger in data table header"
```

---

## Chunk 2: Data Masking

### Task 2.1: Masking Store

**Files:**
- Create: `apps/desktop/src/renderer/src/stores/masking-store.ts`
- Modify: `apps/desktop/src/renderer/src/stores/index.ts`

- [ ] **Step 1: Create masking store**

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AutoMaskRule {
  id: string
  pattern: string
  enabled: boolean
}

const DEFAULT_RULES: AutoMaskRule[] = [
  { id: 'email', pattern: 'email', enabled: true },
  { id: 'password', pattern: 'password|passwd|pwd', enabled: true },
  { id: 'ssn', pattern: 'ssn|social_security', enabled: true },
  { id: 'token', pattern: 'token|secret|api_key|apikey', enabled: true },
  { id: 'phone', pattern: 'phone|mobile|cell', enabled: false },
  { id: 'address', pattern: 'address|street', enabled: false },
]

interface MaskingState {
  maskedColumns: Record<string, Set<string>>
  autoMaskRules: AutoMaskRule[]
  hoverToPeek: boolean
  autoMaskEnabled: boolean

  maskColumn: (tabId: string, columnName: string) => void
  unmaskColumn: (tabId: string, columnName: string) => void
  toggleColumnMask: (tabId: string, columnName: string) => void
  unmaskAll: (tabId: string) => void
  isColumnMasked: (tabId: string, columnName: string) => boolean
  getMaskedColumnsForTab: (tabId: string) => Set<string>
  getEffectiveMaskedColumns: (tabId: string, allColumns: string[]) => Set<string>
  updateAutoMaskRule: (id: string, updates: Partial<AutoMaskRule>) => void
  addAutoMaskRule: (pattern: string) => void
  removeAutoMaskRule: (id: string) => void
  setHoverToPeek: (enabled: boolean) => void
  setAutoMaskEnabled: (enabled: boolean) => void
}

export const useMaskingStore = create<MaskingState>()(
  persist(
    (set, get) => ({
      maskedColumns: {},
      autoMaskRules: DEFAULT_RULES,
      hoverToPeek: true,
      autoMaskEnabled: false,

      maskColumn: (tabId, columnName) => {
        const current = get().maskedColumns
        const tabSet = new Set(current[tabId] || [])
        tabSet.add(columnName)
        set({ maskedColumns: { ...current, [tabId]: tabSet } })
      },

      unmaskColumn: (tabId, columnName) => {
        const current = get().maskedColumns
        const tabSet = new Set(current[tabId] || [])
        tabSet.delete(columnName)
        set({ maskedColumns: { ...current, [tabId]: tabSet } })
      },

      toggleColumnMask: (tabId, columnName) => {
        if (get().isColumnMasked(tabId, columnName)) {
          get().unmaskColumn(tabId, columnName)
        } else {
          get().maskColumn(tabId, columnName)
        }
      },

      unmaskAll: (tabId) => {
        const current = get().maskedColumns
        set({ maskedColumns: { ...current, [tabId]: new Set() } })
      },

      isColumnMasked: (tabId, columnName) => {
        const tabSet = get().maskedColumns[tabId]
        if (tabSet?.has(columnName)) return true
        return get().autoMaskEnabled && get().autoMaskRules.some(
          (rule) => rule.enabled && new RegExp(rule.pattern, 'i').test(columnName)
        )
      },

      getMaskedColumnsForTab: (tabId) => get().maskedColumns[tabId] || new Set(),

      getEffectiveMaskedColumns: (tabId, allColumns) => {
        const result = new Set<string>(get().maskedColumns[tabId] || [])
        if (get().autoMaskEnabled) {
          for (const col of allColumns) {
            for (const rule of get().autoMaskRules) {
              if (rule.enabled && new RegExp(rule.pattern, 'i').test(col)) {
                result.add(col)
              }
            }
          }
        }
        return result
      },

      updateAutoMaskRule: (id, updates) => {
        set({
          autoMaskRules: get().autoMaskRules.map((r) =>
            r.id === id ? { ...r, ...updates } : r
          ),
        })
      },

      addAutoMaskRule: (pattern) => {
        set({
          autoMaskRules: [
            ...get().autoMaskRules,
            { id: crypto.randomUUID(), pattern, enabled: true },
          ],
        })
      },

      removeAutoMaskRule: (id) => {
        set({ autoMaskRules: get().autoMaskRules.filter((r) => r.id !== id) })
      },

      setHoverToPeek: (enabled) => set({ hoverToPeek: enabled }),
      setAutoMaskEnabled: (enabled) => set({ autoMaskEnabled: enabled }),
    }),
    {
      name: 'data-peek-masking',
      partialize: (state) => ({
        autoMaskRules: state.autoMaskRules,
        hoverToPeek: state.hoverToPeek,
        autoMaskEnabled: state.autoMaskEnabled,
      }),
    }
  )
)
```

- [ ] **Step 2: Export from stores/index.ts**

Add `export * from './masking-store'`.

- [ ] **Step 3: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck:web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/stores/masking-store.ts apps/desktop/src/renderer/src/stores/index.ts
git commit -m "feat(store): add masking store with auto-mask rules"
```

### Task 2.2: Masking Toolbar Component

**Files:**
- Create: `apps/desktop/src/renderer/src/components/masking-toolbar.tsx`

- [ ] **Step 1: Create toolbar indicator/toggle**

Build a small toolbar component that:
- Shows "N columns masked" badge when any columns are masked
- Toggle button to unmask all
- Dropdown to manage auto-mask rules (enable/disable, add pattern)
- Integrates into the existing edit toolbar area

- [ ] **Step 2: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck:web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/masking-toolbar.tsx
git commit -m "feat(ui): add masking toolbar indicator"
```

### Task 2.3: Apply Blur to Data Tables

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/data-table.tsx`
- Modify: `apps/desktop/src/renderer/src/components/editable-data-table.tsx`

- [ ] **Step 1: Add blur CSS and context menu to data-table.tsx**

In cell rendering, check `useMaskingStore().isColumnMasked(tabId, columnName)`. If masked:
- Apply `style={{ filter: 'blur(5px)', userSelect: 'none' }}` to cell content
- Add 🔒 icon to column header
- Add "Mask Column" / "Unmask Column" to column header context menu
- If `hoverToPeek` enabled, add `onMouseEnter` with Alt key check to temporarily remove blur

- [ ] **Step 2: Apply same blur logic to editable-data-table.tsx**

Same approach — check masking state, apply blur, prevent editing of masked cells.

- [ ] **Step 3: Run typecheck and lint**

Run: `cd apps/desktop && pnpm typecheck:web && pnpm lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/components/data-table.tsx apps/desktop/src/renderer/src/components/editable-data-table.tsx
git commit -m "feat(ui): apply blur effect to masked columns in data tables"
```

### Task 2.4: Export Safety

**Files:**
- Modify: `apps/desktop/src/renderer/src/lib/export.ts:30-48`

- [ ] **Step 1: Add masked column interception to export call sites**

Find where `exportToCSV` and `exportToJSON` are called (likely in tab-query-editor or a toolbar). Before passing data to export functions, check masking state. If any columns are masked:

1. Show confirmation dialog: "Some columns are masked. Export with '[MASKED]' values?"
2. If confirmed, clone the rows and replace masked column values with `'[MASKED]'`
3. Pass modified data to export function

The export functions themselves (`exportToCSV`, `exportToJSON` in `export.ts`) remain unchanged.

- [ ] **Step 2: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck:web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/
git commit -m "feat(export): replace masked column values with [MASKED] on export"
```

---

## Chunk 3: CSV Import

### Task 3.1: Shared Types + Dependency

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add CSV import types**

```typescript
export interface CsvColumnMapping {
  csvColumn: string
  tableColumn: string | null
  inferredType?: string
}

export interface CsvImportOptions {
  batchSize: number
  onConflict: 'error' | 'skip' | 'update'
  truncateFirst: boolean
  useTransaction: boolean
  useCopy: boolean
}

export interface CsvImportRequest {
  schema: string
  table: string
  columns: string[]
  mappings: CsvColumnMapping[]
  options: CsvImportOptions
  createTable: boolean
  tableDefinition?: {
    columns: Array<{ name: string; dataType: string; isNullable: boolean }>
  }
}

export interface CsvImportProgress {
  phase: 'preparing' | 'importing' | 'complete' | 'error'
  rowsImported: number
  totalRows: number
  currentBatch: number
  totalBatches: number
  error?: string
}

export interface CsvImportResult {
  success: boolean
  rowsImported: number
  rowsSkipped: number
  rowsFailed: number
  error?: string
  durationMs: number
}

export interface BatchInsertOptions {
  schema: string
  table: string
  columns: string[]
  onConflict: 'error' | 'skip' | 'update'
  primaryKeyColumns?: string[]
}

export interface BatchInsertResult {
  rowsInserted: number
  rowsSkipped: number
  rowsFailed: number
}
```

- [ ] **Step 2: Install papaparse in desktop app**

Run: `cd apps/desktop && pnpm add papaparse && pnpm add -D @types/papaparse`

- [ ] **Step 3: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/index.ts apps/desktop/package.json pnpm-lock.yaml
git commit -m "feat(shared): add CSV import types and install papaparse"
```

### Task 3.2: Batch Insert Module

**Files:**
- Create: `apps/desktop/src/main/batch-insert.ts`

- [ ] **Step 1: Create shared batch insert module**

This module is used by both CSV Import and Data Generator (Feature 4).

```typescript
import type { DatabaseAdapter } from './db-adapter'
import type { ConnectionConfig, BatchInsertOptions, BatchInsertResult } from '@shared/index'

export async function batchInsert(
  adapter: DatabaseAdapter,
  config: ConnectionConfig,
  rows: unknown[][],
  options: BatchInsertOptions,
  batchSize: number,
  onProgress?: (inserted: number, total: number) => void
): Promise<BatchInsertResult> {
  let rowsInserted = 0
  let rowsSkipped = 0
  let rowsFailed = 0

  const totalRows = rows.length
  const batches = Math.ceil(totalRows / batchSize)

  for (let i = 0; i < batches; i++) {
    const batchRows = rows.slice(i * batchSize, (i + 1) * batchSize)
    const placeholders = batchRows.map((row, rowIdx) => {
      const rowPlaceholders = row.map((_, colIdx) => `$${rowIdx * row.length + colIdx + 1}`)
      return `(${rowPlaceholders.join(', ')})`
    })

    const values = batchRows.flat()
    const quotedCols = options.columns.map((c) => `"${c}"`).join(', ')
    const quotedTable = `"${options.schema}"."${options.table}"`

    let sql = `INSERT INTO ${quotedTable} (${quotedCols}) VALUES ${placeholders.join(', ')}`

    if (options.onConflict === 'skip') {
      sql += ' ON CONFLICT DO NOTHING'
    } else if (options.onConflict === 'update' && options.primaryKeyColumns?.length) {
      const pkCols = options.primaryKeyColumns.map((c) => `"${c}"`).join(', ')
      const updateCols = options.columns
        .filter((c) => !options.primaryKeyColumns!.includes(c))
        .map((c) => `"${c}" = EXCLUDED."${c}"`)
        .join(', ')
      if (updateCols) {
        sql += ` ON CONFLICT (${pkCols}) DO UPDATE SET ${updateCols}`
      }
    }

    try {
      const result = await adapter.execute(config, sql, values)
      rowsInserted += result.rowCount || batchRows.length
    } catch (error) {
      if (options.onConflict === 'error') throw error
      rowsFailed += batchRows.length
    }

    onProgress?.(rowsInserted + rowsSkipped + rowsFailed, totalRows)
  }

  return { rowsInserted, rowsSkipped, rowsFailed }
}
```

Note: This is the PostgreSQL-style parameterized query. MySQL and MSSQL adapters will need adapter-specific overrides in `importBatch()`. The `batchInsert` function provides the orchestration; the actual SQL building should be adapter-aware. For the initial implementation, use this for PostgreSQL and adapt per adapter.

- [ ] **Step 2: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck:node`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main/batch-insert.ts
git commit -m "feat(core): add shared batch insert module"
```

### Task 3.3: Import IPC Handler + Preload

**Files:**
- Create: `apps/desktop/src/main/ipc/import-handlers.ts`
- Modify: `apps/desktop/src/main/ipc/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`

- [ ] **Step 1: Create import handler**

Handle `db:import-csv` — receives connection config, CSV rows in batches, import options. Uses `batchInsert()`. Reports progress via `event.sender.send('db:import-progress', progress)`.

Handle `db:import-cancel` — sets a cancellation flag checked between batches.

Optionally handle `db:create-table-from-csv` — generates and executes CREATE TABLE DDL using the existing `ddl-builder.ts` before import.

- [ ] **Step 2: Register in ipc/index.ts**

Import and call `registerImportHandlers()`.

- [ ] **Step 3: Add to preload bridge**

Add to `db` namespace:
```typescript
importCsv(config, request, rows) { return ipcRenderer.invoke('db:import-csv', config, request, rows) }
cancelImport() { return ipcRenderer.invoke('db:import-cancel') }
onImportProgress: (callback: (progress: CsvImportProgress) => void): (() => void) => {
    const handler = (_: unknown, progress: CsvImportProgress): void => callback(progress)
    ipcRenderer.on('db:import-progress', handler)
    return () => ipcRenderer.removeListener('db:import-progress', handler)
  }
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc/import-handlers.ts apps/desktop/src/main/ipc/index.ts apps/desktop/src/preload/index.ts
git commit -m "feat(ipc): add CSV import handlers with progress and cancel"
```

### Task 3.4: Import Store

**Files:**
- Create: `apps/desktop/src/renderer/src/stores/import-store.ts`
- Modify: `apps/desktop/src/renderer/src/stores/index.ts`

- [ ] **Step 1: Create import store**

State: `step` (1-5), `file` (parsed CSV data), `targetTable`, `createNewTable`, `columnMappings`, `importOptions`, `progress`, `result`, `isImporting`, `error`.

Actions: `setFile()`, `setTargetTable()`, `setMapping()`, `autoMapColumns()`, `startImport()`, `cancelImport()`, `reset()`.

`autoMapColumns()` matches CSV headers to table columns by case-insensitive name comparison.

- [ ] **Step 2: Export from stores/index.ts**

- [ ] **Step 3: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck:web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/stores/import-store.ts apps/desktop/src/renderer/src/stores/index.ts
git commit -m "feat(store): add CSV import store with auto-mapping"
```

### Task 3.5: CSV Import Dialog UI

**Files:**
- Create: `apps/desktop/src/renderer/src/components/csv-import-dialog.tsx`

- [ ] **Step 1: Build multi-step import dialog**

A sheet/dialog with 5 steps:

1. File selection — drag-and-drop zone + file picker button. On file select, parse with papaparse and show 10-row preview table.
2. Target selection — select existing table or toggle "Create new table" with inferred column names/types.
3. Column mapping — two-column layout with dropdowns. Auto-mapped columns pre-filled. Unmapped shown in yellow. Type mismatch warnings.
4. Options — batch size selector, conflict strategy radio, truncate toggle, transaction toggle, COPY toggle (Postgres only).
5. Execute — SQL preview for first 3 rows, start button, progress bar, cancel button, result summary.

Use existing shadcn components: Dialog/Sheet, Select, Button, Progress, Table, Badge.

- [ ] **Step 2: Add trigger to schema explorer context menu**

Add "Import CSV" to table right-click context menu in schema-explorer.

- [ ] **Step 3: Run typecheck and lint**

Run: `cd apps/desktop && pnpm typecheck:web && pnpm lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/src/components/csv-import-dialog.tsx apps/desktop/src/renderer/src/components/schema-explorer.tsx
git commit -m "feat(ui): add multi-step CSV import dialog"
```

---

## Chunk 4: Data Generator

### Task 4.1: Types + Dependency

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add data generator types**

```typescript
export type GeneratorType =
  | 'auto-increment'
  | 'uuid'
  | 'faker'
  | 'random-int'
  | 'random-float'
  | 'random-boolean'
  | 'random-date'
  | 'random-enum'
  | 'fk-reference'
  | 'fixed'
  | 'null'
  | 'expression'

export interface ColumnGenerator {
  columnName: string
  dataType: string
  generatorType: GeneratorType
  fakerMethod?: string
  fixedValue?: string
  minValue?: number
  maxValue?: number
  enumValues?: string[]
  nullPercentage: number
  skip: boolean
  fkTable?: string
  fkColumn?: string
}

export interface DataGenConfig {
  schema: string
  table: string
  rowCount: number
  seed?: number
  columns: ColumnGenerator[]
  batchSize: number
}

export interface DataGenProgress {
  phase: 'generating' | 'inserting' | 'complete' | 'error'
  rowsGenerated: number
  rowsInserted: number
  totalRows: number
  error?: string
}

export interface DataGenResult {
  success: boolean
  rowsInserted: number
  durationMs: number
  error?: string
}
```

- [ ] **Step 2: Install faker in desktop app (main process)**

Run: `cd apps/desktop && pnpm add @faker-js/faker`

- [ ] **Step 3: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/index.ts apps/desktop/package.json pnpm-lock.yaml
git commit -m "feat(shared): add data generator types and install faker"
```

### Task 4.2: Generator Engine

**Files:**
- Create: `apps/desktop/src/main/data-generator.ts`

- [ ] **Step 1: Create data generator module**

Responsibilities:
- `generateRows(config: DataGenConfig, fkData: Map<string, unknown[]>): unknown[][]` — generates rows in memory using Faker
- `getHeuristicGenerator(columnName: string, dataType: string): Partial<ColumnGenerator>` — auto-detects generator based on column name/type patterns
- `resolveFK(adapter, config, fkTable, fkColumn)` — fetches existing IDs for FK references

Heuristics map:
```typescript
const HEURISTICS: Array<{ pattern: RegExp; dataType?: RegExp; generator: Partial<ColumnGenerator> }> = [
  { pattern: /^email$/i, generator: { generatorType: 'faker', fakerMethod: 'internet.email' } },
  { pattern: /^(first_?name|fname)$/i, generator: { generatorType: 'faker', fakerMethod: 'person.firstName' } },
  { pattern: /^(last_?name|lname|surname)$/i, generator: { generatorType: 'faker', fakerMethod: 'person.lastName' } },
  { pattern: /^(name|full_?name)$/i, generator: { generatorType: 'faker', fakerMethod: 'person.fullName' } },
  { pattern: /^(phone|mobile|cell)$/i, generator: { generatorType: 'faker', fakerMethod: 'phone.number' } },
  { pattern: /^(address|street)$/i, generator: { generatorType: 'faker', fakerMethod: 'location.streetAddress' } },
  { pattern: /^(city)$/i, generator: { generatorType: 'faker', fakerMethod: 'location.city' } },
  { pattern: /^(country)$/i, generator: { generatorType: 'faker', fakerMethod: 'location.country' } },
  { pattern: /^(zip|postal)$/i, generator: { generatorType: 'faker', fakerMethod: 'location.zipCode' } },
  { pattern: /^(url|website|homepage)$/i, generator: { generatorType: 'faker', fakerMethod: 'internet.url' } },
  { pattern: /^(avatar|image|photo)$/i, generator: { generatorType: 'faker', fakerMethod: 'image.avatar' } },
  { pattern: /^(bio|description|about|summary)$/i, generator: { generatorType: 'faker', fakerMethod: 'lorem.paragraph' } },
  { pattern: /^(title|subject|headline)$/i, generator: { generatorType: 'faker', fakerMethod: 'lorem.sentence' } },
  { pattern: /^(company|organization)$/i, generator: { generatorType: 'faker', fakerMethod: 'company.name' } },
  { pattern: /^(created|updated|deleted)_?(at|on|date)?$/i, generator: { generatorType: 'faker', fakerMethod: 'date.recent' } },
  { pattern: /^(uuid|guid)$/i, generator: { generatorType: 'uuid' } },
]
```

Use `import { faker } from '@faker-js/faker/locale/en'` for tree-shaking.

- [ ] **Step 2: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck:node`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main/data-generator.ts
git commit -m "feat(core): add data generator engine with heuristics and FK support"
```

### Task 4.3: IPC Handler + Preload

**Files:**
- Create: `apps/desktop/src/main/ipc/data-gen-handlers.ts`
- Modify: `apps/desktop/src/main/ipc/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`

- [ ] **Step 1: Create data-gen handler**

Handle `db:generate-data` — receives DataGenConfig, generates rows via data-generator module, inserts via `batchInsert()`, reports progress via `event.sender.send('db:generate-progress', progress)`.

Handle `db:generate-cancel` — cancellation flag.

Handle `db:generate-preview` — generates 5 rows and returns them without inserting.

- [ ] **Step 2: Register in ipc/index.ts**

- [ ] **Step 3: Add to preload bridge**

```typescript
generateData(config, genConfig) { return ipcRenderer.invoke('db:generate-data', config, genConfig) }
cancelGenerate() { return ipcRenderer.invoke('db:generate-cancel') }
generatePreview(config, genConfig) { return ipcRenderer.invoke('db:generate-preview', config, genConfig) }
onGenerateProgress: (callback: (progress: DataGenProgress) => void): (() => void) => {
    const handler = (_: unknown, progress: DataGenProgress): void => callback(progress)
    ipcRenderer.on('db:generate-progress', handler)
    return () => ipcRenderer.removeListener('db:generate-progress', handler)
  }
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc/data-gen-handlers.ts apps/desktop/src/main/ipc/index.ts apps/desktop/src/preload/index.ts
git commit -m "feat(ipc): add data generator handlers with preview and cancel"
```

### Task 4.4: Store + Tab Type

**Files:**
- Create: `apps/desktop/src/renderer/src/stores/data-gen-store.ts`
- Modify: `apps/desktop/src/renderer/src/stores/tab-store.ts:22`
- Modify: `apps/desktop/src/renderer/src/stores/index.ts`

- [ ] **Step 1: Create data-gen store**

State per tab: `config` (DataGenConfig), `columnGenerators` (auto-populated from schema), `previewRows`, `progress`, `isGenerating`, `error`.

Actions: `initForTable(tabId, schema, table, columns, foreignKeys)`, `updateGenerator(tabId, columnName, updates)`, `startGenerate(tabId)`, `cancelGenerate(tabId)`, `fetchPreview(tabId)`.

`initForTable` should auto-populate generators using the heuristics from the data-generator module (call a new IPC `db:generate-heuristics` or compute in renderer from column info).

- [ ] **Step 2: Add 'data-generator' to TabType and Tab union**

In `tab-store.ts`:

1. Extend `TabType` (line 22):
```typescript
type TabType = 'query' | 'table-preview' | 'erd' | 'table-designer' | 'data-generator'
```

2. Add new interface after `TableDesignerTab` (around line 81):
```typescript
export interface DataGeneratorTab extends BaseTab {
  type: 'data-generator'
  schemaName: string
  tableName?: string
}
```

3. Update `Tab` union (line 83):
```typescript
export type Tab = QueryTab | TablePreviewTab | ERDTab | TableDesignerTab | DataGeneratorTab
```

4. Search for ALL guard clauses containing `'erd' || 'table-designer'` or `=== 'erd'` and add `'data-generator'` where appropriate (these exclude non-query tabs from query-specific logic like pagination, execution, dirty detection).

- [ ] **Step 3: Export from stores/index.ts**

- [ ] **Step 4: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck:web`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/stores/data-gen-store.ts apps/desktop/src/renderer/src/stores/tab-store.ts apps/desktop/src/renderer/src/stores/index.ts
git commit -m "feat(store): add data-gen store and register tab type"
```

### Task 4.5: Data Generator Tab UI

**Files:**
- Create: `apps/desktop/src/renderer/src/components/data-generator.tsx`

- [ ] **Step 1: Build data generator tab component**

Three sections:
1. Header: table selector, row count input, seed input, Generate/Cancel buttons
2. Column config table: for each column show name, type, generator dropdown, options (min/max/enum/FK), null % slider, skip checkbox
3. Preview/Results area: preview table showing 5 sample rows, SQL preview, progress bar during generation, result summary

Generator dropdown options per column type:
- Serial/auto-increment → auto-increment (skip by default)
- UUID → uuid
- FK columns → fk-reference (auto-detected)
- Enum → random-enum (values from schema)
- Otherwise → heuristic match or manual faker method picker

- [ ] **Step 2: Register tab rendering in tab-container**

In the tab container/router that renders tab content by type, add a case for `'data-generator'` that renders `<DataGenerator tabId={tab.id} />`.

- [ ] **Step 3: Add trigger to schema explorer**

Right-click table → "Generate Data" opens a new data-generator tab.

- [ ] **Step 4: Run typecheck and lint**

Run: `cd apps/desktop && pnpm typecheck:web && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/components/data-generator.tsx apps/desktop/src/renderer/src/components/
git commit -m "feat(ui): add data generator tab with column config and preview"
```

---

## Chunk 5: Database Notifications (PostgreSQL)

### Task 5.1: Types

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add notification types**

```typescript
export interface PgNotificationEvent {
  id: string
  connectionId: string
  channel: string
  payload: string
  receivedAt: number
}

export interface PgNotificationChannel {
  name: string
  isListening: boolean
  eventCount: number
  lastEventAt?: number
}

export interface PgNotificationStats {
  eventsPerSecond: number
  totalEvents: number
  avgPayloadSize: number
  connectedSince?: number
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): add PostgreSQL notification types"
```

### Task 5.2: Notification Listener

**Files:**
- Create: `apps/desktop/src/main/pg-notification-listener.ts`

- [ ] **Step 1: Create dedicated pg.Client manager**

Responsibilities:
- Create a separate `pg.Client` (not from pool) for LISTEN
- `subscribe(connectionId, config, channel)` — sends `LISTEN "channel"`
- `unsubscribe(connectionId, channel)` — sends `UNLISTEN "channel"`
- `send(connectionId, config, channel, payload)` — sends `NOTIFY "channel", 'payload'` (uses adapter's query, not the listener client)
- Forward `notification` events to all windows via `BrowserWindow.getAllWindows()`
- Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- Re-subscribe all channels on reconnect
- Persist events to better-sqlite3 (create `pg_notification_events` table)
- Cap at 10,000 events per connection (delete oldest on insert)
- Cleanup: disconnect client when connection is removed or app closes

Key implementation detail: one listener client per connectionId. Store in a `Map<string, { client: pg.Client, channels: Set<string> }>`.

- [ ] **Step 2: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck:node`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main/pg-notification-listener.ts
git commit -m "feat(core): add PostgreSQL notification listener with reconnect"
```

### Task 5.3: IPC Handler + Preload

**Files:**
- Create: `apps/desktop/src/main/ipc/pg-notify-handlers.ts`
- Modify: `apps/desktop/src/main/ipc/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`

- [ ] **Step 1: Create pg-notify handler**

IPC channels:
- `pg-notify:subscribe` — calls listener.subscribe()
- `pg-notify:unsubscribe` — calls listener.unsubscribe()
- `pg-notify:send` — calls listener.send()
- `pg-notify:get-channels` — returns active channels
- `pg-notify:get-history` — queries SQLite for persisted events
- `pg-notify:clear-history` — deletes from SQLite
- `pg-notify:event` — push event (registered by listener, not handler)

- [ ] **Step 2: Register in ipc/index.ts**

- [ ] **Step 3: Add `pgNotify` namespace to preload**

```typescript
pgNotify: {
  subscribe(connectionId, channel) { ... },
  unsubscribe(connectionId, channel) { ... },
  send(connectionId, channel, payload) { ... },
  getChannels(connectionId) { ... },
  getHistory(connectionId, limit?) { ... },
  clearHistory(connectionId) { ... },
  onEvent: (callback: (event: PgNotificationEvent) => void): (() => void) => {
    const handler = (_: unknown, event: PgNotificationEvent): void => callback(event)
    ipcRenderer.on('pg-notify:event', handler)
    return () => ipcRenderer.removeListener('pg-notify:event', handler)
  },
}
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc/pg-notify-handlers.ts apps/desktop/src/main/ipc/index.ts apps/desktop/src/preload/index.ts
git commit -m "feat(ipc): add pg-notify handlers and preload bridge"
```

### Task 5.4: Store + Tab Type

**Files:**
- Create: `apps/desktop/src/renderer/src/stores/pg-notification-store.ts`
- Modify: `apps/desktop/src/renderer/src/stores/tab-store.ts`
- Modify: `apps/desktop/src/renderer/src/stores/index.ts`

- [ ] **Step 1: Create pg-notification store**

State: `channels` (Map of channel name → PgNotificationChannel), `events` (array, capped at 1000 in memory), `stats`, `isConnected`, `filter` (channel filter, search text).

Actions: `subscribe(channel)`, `unsubscribe(channel)`, `sendNotification(channel, payload)`, `loadHistory()`, `clearHistory()`, `setFilter()`, `clearEvents()`.

On mount, register `window.api.pgNotify.onEvent()` listener to push events into state.

- [ ] **Step 2: Add 'pg-notifications' to TabType and Tab union**

In `tab-store.ts`:
1. Add `'pg-notifications'` to `TabType` union
2. Add interface:
```typescript
export interface PgNotificationsTab extends BaseTab {
  type: 'pg-notifications'
}
```
3. Add `PgNotificationsTab` to `Tab` union
4. Add `'pg-notifications'` to all guard clauses that exclude non-query tab types (search for `'data-generator'` which was added in Task 4.4 — add alongside it)

- [ ] **Step 3: Export from stores/index.ts**

- [ ] **Step 4: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck:web`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/stores/pg-notification-store.ts apps/desktop/src/renderer/src/stores/tab-store.ts apps/desktop/src/renderer/src/stores/index.ts
git commit -m "feat(store): add pg-notification store and register tab type"
```

### Task 5.5: Notifications Tab UI

**Files:**
- Create: `apps/desktop/src/renderer/src/components/pg-notifications-panel.tsx`

- [ ] **Step 1: Build notifications tab component**

Three sections:
1. Channel bar: text input + Listen button, active channels as pills with X, recent channels
2. Event log: scrollable list, each event shows timestamp/channel/payload. Filter by channel dropdown, search input. Expand on click for full payload. Copy button. Clear all button. Auto-scroll to bottom on new events.
3. Send panel: collapsible, channel dropdown, payload textarea with JSON detection, Send button, recent payloads list

Stats sidebar (toggle via button): events/sec gauge, total count, avg payload size.

Only render when connected to a PostgreSQL database (check `connectionConfig.dbType === 'postgresql'`).

- [ ] **Step 2: Register tab rendering**

Add case for `'pg-notifications'` in tab container.

- [ ] **Step 3: Add sidebar nav item**

Add "Notifications" to sidebar nav, visible only for PostgreSQL connections. Clicking opens a new pg-notifications tab.

- [ ] **Step 4: Run typecheck and lint**

Run: `cd apps/desktop && pnpm typecheck:web && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/components/pg-notifications-panel.tsx apps/desktop/src/renderer/src/components/
git commit -m "feat(ui): add PostgreSQL notifications tab with live event log"
```

---

## Chunk 6: Connection Health Monitor

### Task 6.1: Types + Interface Extension

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/desktop/src/main/db-adapter.ts`

- [ ] **Step 1: Add health monitor types**

```typescript
export interface ActiveQuery {
  pid: number
  user: string
  database: string
  state: string
  duration: string
  durationMs: number
  query: string
  waitEvent?: string
  applicationName?: string
}

export interface TableSizeInfo {
  schema: string
  table: string
  rowCountEstimate: number
  dataSize: string
  dataSizeBytes: number
  indexSize: string
  indexSizeBytes: number
  totalSize: string
  totalSizeBytes: number
}

export interface CacheStats {
  bufferCacheHitRatio: number
  indexHitRatio: number
  tableCacheDetails?: Array<{
    table: string
    hitRatio: number
    seqScans: number
    indexScans: number
  }>
}

export interface LockInfo {
  blockedPid: number
  blockedUser: string
  blockedQuery: string
  blockingPid: number
  blockingUser: string
  blockingQuery: string
  lockType: string
  relation?: string
  waitDuration: string
  waitDurationMs: number
}

export interface DatabaseSizeInfo {
  totalSize: string
  totalSizeBytes: number
}
```

- [ ] **Step 2: Add diagnostic methods to DatabaseAdapter interface**

After `getColumnStats` in the interface, add:

```typescript
  getActiveQueries(config: ConnectionConfig): Promise<ActiveQuery[]>
  getTableSizes(config: ConnectionConfig, schema?: string): Promise<{ dbSize: DatabaseSizeInfo; tables: TableSizeInfo[] }>
  getCacheStats(config: ConnectionConfig): Promise<CacheStats>
  getLocks(config: ConnectionConfig): Promise<LockInfo[]>
  killQuery(config: ConnectionConfig, pid: number): Promise<{ success: boolean; error?: string }>
```

- [ ] **Step 3: Add stubs to all adapters**

Add `throw new Error('not implemented')` stubs for all 5 methods in each adapter.

- [ ] **Step 4: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck:node`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts apps/desktop/src/main/db-adapter.ts apps/desktop/src/main/adapters/
git commit -m "feat(shared): add health monitor types and interface methods"
```

### Task 6.2: PostgreSQL Diagnostic Implementations

**Files:**
- Modify: `apps/desktop/src/main/adapters/postgres-adapter.ts`

- [ ] **Step 1: Implement getActiveQueries**

Query `pg_stat_activity`:
```sql
SELECT pid, usename as user, datname as database, state,
  EXTRACT(EPOCH FROM (now() - query_start))::float8 as duration_ms,
  to_char(now() - query_start, 'HH24:MI:SS') as duration,
  query, wait_event, application_name
FROM pg_stat_activity
WHERE state != 'idle' AND pid != pg_backend_pid()
ORDER BY query_start ASC
```

- [ ] **Step 2: Implement getTableSizes**

Query `pg_total_relation_size`:
```sql
SELECT schemaname as schema, relname as table,
  n_live_tup as row_count_estimate,
  pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname))) as total_size,
  pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname)) as total_size_bytes,
  pg_size_pretty(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname))) as data_size,
  pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname)) as data_size_bytes,
  pg_size_pretty(pg_indexes_size(quote_ident(schemaname) || '.' || quote_ident(relname))) as index_size,
  pg_indexes_size(quote_ident(schemaname) || '.' || quote_ident(relname)) as index_size_bytes
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname)) DESC
```

Database total:
```sql
SELECT pg_size_pretty(pg_database_size(current_database())) as total_size,
  pg_database_size(current_database()) as total_size_bytes
```

- [ ] **Step 3: Implement getCacheStats**

```sql
SELECT
  CASE WHEN (heap_blks_hit + heap_blks_read) > 0
    THEN heap_blks_hit::float / (heap_blks_hit + heap_blks_read) * 100
    ELSE 100 END as buffer_hit_ratio,
  CASE WHEN (idx_blks_hit + idx_blks_read) > 0
    THEN idx_blks_hit::float / (idx_blks_hit + idx_blks_read) * 100
    ELSE 100 END as index_hit_ratio
FROM (
  SELECT SUM(heap_blks_hit) as heap_blks_hit, SUM(heap_blks_read) as heap_blks_read,
    SUM(idx_blks_hit) as idx_blks_hit, SUM(idx_blks_read) as idx_blks_read
  FROM pg_statio_user_tables
) t
```

- [ ] **Step 4: Implement getLocks**

```sql
SELECT
  blocked.pid as blocked_pid,
  blocked_activity.usename as blocked_user,
  blocked_activity.query as blocked_query,
  blocking.pid as blocking_pid,
  blocking_activity.usename as blocking_user,
  blocking_activity.query as blocking_query,
  blocked.locktype as lock_type,
  blocked.relation::regclass::text as relation,
  to_char(now() - blocked_activity.query_start, 'HH24:MI:SS') as wait_duration,
  EXTRACT(EPOCH FROM (now() - blocked_activity.query_start))::float8 * 1000 as wait_duration_ms
FROM pg_locks blocked
JOIN pg_stat_activity blocked_activity ON blocked.pid = blocked_activity.pid
JOIN pg_locks blocking ON blocked.locktype = blocking.locktype
  AND blocked.database IS NOT DISTINCT FROM blocking.database
  AND blocked.relation IS NOT DISTINCT FROM blocking.relation
  AND blocked.page IS NOT DISTINCT FROM blocking.page
  AND blocked.tuple IS NOT DISTINCT FROM blocking.tuple
  AND blocked.pid != blocking.pid
JOIN pg_stat_activity blocking_activity ON blocking.pid = blocking_activity.pid
WHERE NOT blocked.granted
```

- [ ] **Step 5: Implement killQuery**

Follow the standard adapter connection pattern (`new Client` + `try/finally` + `closeTunnel`):
```typescript
async killQuery(config: ConnectionConfig, pid: number) {
  let tunnelSession: TunnelSession | null = null
  if (config.ssh) { tunnelSession = await createTunnel(config) }
  const tunnelOverrides = tunnelSession ? { host: tunnelSession.localHost, port: tunnelSession.localPort } : undefined
  const client = new Client(buildClientConfig(config, tunnelOverrides))
  try {
    await client.connect()
    const result = await client.query('SELECT pg_cancel_backend($1)', [pid])
    return { success: result.rows[0]?.pg_cancel_backend === true }
  } finally {
    await client.end().catch(() => {})
    closeTunnel(tunnelSession)
  }
}
```

- [ ] **Step 6: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck:node`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/main/adapters/postgres-adapter.ts
git commit -m "feat(postgres): implement health monitor diagnostic queries"
```

### Task 6.3: MySQL and MSSQL Diagnostic Implementations

**Files:**
- Modify: `apps/desktop/src/main/adapters/mysql-adapter.ts`
- Modify: `apps/desktop/src/main/adapters/mssql-adapter.ts`

- [ ] **Step 1: Implement MySQL diagnostics**

- `getActiveQueries`: `SHOW PROCESSLIST` or `SELECT * FROM information_schema.processlist`
- `getTableSizes`: `SELECT table_name, data_length, index_length FROM information_schema.tables`
- `getCacheStats`: `SHOW STATUS LIKE 'Innodb_buffer_pool_read%'` and calculate ratio
- `getLocks`: `SELECT * FROM performance_schema.data_lock_waits` (MySQL 8+) or `SHOW ENGINE INNODB STATUS`
- `killQuery`: `KILL QUERY <pid>`

- [ ] **Step 2: Implement MSSQL diagnostics**

- `getActiveQueries`: `sys.dm_exec_requests` JOIN `sys.dm_exec_sql_text`
- `getTableSizes`: `sp_spaceused` per table or `sys.dm_db_partition_stats`
- `getCacheStats`: `sys.dm_os_buffer_descriptors` + `sys.dm_db_index_usage_stats`
- `getLocks`: `sys.dm_tran_locks` JOIN `sys.dm_exec_requests`
- `killQuery`: `KILL <pid>`

- [ ] **Step 3: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck:node`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/adapters/mysql-adapter.ts apps/desktop/src/main/adapters/mssql-adapter.ts
git commit -m "feat(mysql,mssql): implement health monitor diagnostics"
```

### Task 6.4: IPC Handler + Preload

**Files:**
- Create: `apps/desktop/src/main/ipc/health-handlers.ts`
- Modify: `apps/desktop/src/main/ipc/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`

- [ ] **Step 1: Create health handlers**

```typescript
ipcMain.handle('db:active-queries', async (_, config) => { ... })
ipcMain.handle('db:table-sizes', async (_, config, schema?) => { ... })
ipcMain.handle('db:cache-stats', async (_, config) => { ... })
ipcMain.handle('db:locks', async (_, config) => { ... })
ipcMain.handle('db:kill-query', async (_, config, pid) => { ... })
```

Each wraps the adapter method in try/catch and returns `IpcResponse<T>`.

- [ ] **Step 2: Register in ipc/index.ts**

- [ ] **Step 3: Add to preload bridge**

Add `health` namespace:
```typescript
health: {
  activeQueries(config) { ... },
  tableSizes(config, schema?) { ... },
  cacheStats(config) { ... },
  locks(config) { ... },
  killQuery(config, pid) { ... },
}
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc/health-handlers.ts apps/desktop/src/main/ipc/index.ts apps/desktop/src/preload/index.ts
git commit -m "feat(ipc): add health monitor handlers and preload bridge"
```

### Task 6.5: Store + Tab Type

**Files:**
- Create: `apps/desktop/src/renderer/src/stores/health-store.ts`
- Modify: `apps/desktop/src/renderer/src/stores/tab-store.ts`
- Modify: `apps/desktop/src/renderer/src/stores/index.ts`

- [ ] **Step 1: Create health store**

State: `activeQueries`, `tableSizes`, `dbSize`, `cacheStats`, `locks`, `refreshInterval` (2s default), `isRefreshing` per card, `errors` per card.

Actions: `fetchActiveQueries()`, `fetchTableSizes()`, `fetchCacheStats()`, `fetchLocks()`, `killQuery(pid)`, `setRefreshInterval(ms)`, `startPolling()`, `stopPolling()`.

Polling: `setInterval` that calls all 4 fetch methods. `stopPolling()` on tab deactivation. `startPolling()` on tab activation.

- [ ] **Step 2: Add 'health-monitor' to TabType and Tab union**

In `tab-store.ts`:
1. Add `'health-monitor'` to `TabType` union
2. Add interface:
```typescript
export interface HealthMonitorTab extends BaseTab {
  type: 'health-monitor'
}
```
3. Add `HealthMonitorTab` to `Tab` union
4. Add `'health-monitor'` to all guard clauses (alongside previously added types)

- [ ] **Step 3: Export from stores/index.ts**

- [ ] **Step 4: Run typecheck**

Run: `cd apps/desktop && pnpm typecheck:web`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/stores/health-store.ts apps/desktop/src/renderer/src/stores/tab-store.ts apps/desktop/src/renderer/src/stores/index.ts
git commit -m "feat(store): add health monitor store with auto-polling"
```

### Task 6.6: Health Monitor Tab UI

**Files:**
- Create: `apps/desktop/src/renderer/src/components/health-monitor.tsx`

- [ ] **Step 1: Build health monitor tab component**

Dashboard grid with 4 cards:

1. **Active Queries card**: Table with PID, user, state, duration, query (truncated). "Kill" button with confirmation dialog per row. Red highlight for queries running > 60s.

2. **Table Sizes card**: Sortable table with name, rows, data/index/total size. Size bar visualization (width proportional to largest). KPI header showing database total size.

3. **Cache Hit Ratios card**: Two large KPI numbers (buffer cache %, index %). Color-coded background: green >99%, yellow 95-99%, red <95%.

4. **Locks card**: Table with blocked/blocking PID, lock type, relation, wait time. "Kill Blocker" button with confirmation. Empty state with green checkmark.

Header: refresh interval dropdown (2s/5s/10s/30s/off), manual refresh button, connection name.

Each card has its own loading spinner and error state.

- [ ] **Step 2: Register tab rendering**

Add case for `'health-monitor'` in tab container.

- [ ] **Step 3: Add trigger**

Right-click connection → "Health Monitor" in connection context menu, or command palette entry. Opens new health-monitor tab.

- [ ] **Step 4: Run typecheck and lint**

Run: `cd apps/desktop && pnpm typecheck:web && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/components/health-monitor.tsx apps/desktop/src/renderer/src/components/
git commit -m "feat(ui): add connection health monitor dashboard tab"
```

---

## Final Integration

### Task 7.1: Full Build Verification

- [ ] **Step 1: Run full typecheck**

Run: `cd apps/desktop && pnpm typecheck`
Expected: PASS with zero errors

- [ ] **Step 2: Run lint**

Run: `cd apps/desktop && pnpm lint`
Expected: PASS

- [ ] **Step 3: Run format**

Run: `cd apps/desktop && pnpm format`

- [ ] **Step 4: Test build**

Run: `cd apps/desktop && pnpm build`
Expected: PASS — app builds for current platform

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: format and verify full build with all 6 features"
```
