# Local-First Dexie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move saved queries, query history, and query tabs to IndexedDB via Dexie for instant UI, with background sync to existing Postgres via tRPC.

**Architecture:** Dexie is the primary read/write layer for client-side data. A SyncManager runs in the background pushing pending local changes to the server and pulling remote changes. Components read via `useLiveQuery` hooks instead of tRPC queries.

**Tech Stack:** Dexie 4.x, dexie-react-hooks, existing tRPC + Drizzle backend

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/lib/dexie.ts` | Dexie database definition, schema, types |
| `src/lib/sync-manager.ts` | Background push/pull sync engine |
| `src/components/sync-provider.tsx` | React provider that mounts SyncManager on auth |
| `src/hooks/use-saved-queries.ts` | CRUD hook reading from Dexie savedQueries table |
| `src/hooks/use-query-history.ts` | CRUD hook reading from Dexie queryHistory table |
| `src/hooks/use-query-tabs.ts` | Tab management hook backed by Dexie queryTabs table |
| `src/hooks/use-ui-state.ts` | Key-value UI state persisted in Dexie |

### Modified files

| File | Change |
|------|--------|
| `src/server/routers/saved-queries.ts` | Add `updatedSince` filter to `list`, add `bulkUpsert` mutation |
| `src/server/routers/history.ts` | Add `executedSince` filter to `list`, add `bulkCreate` mutation |
| `src/app/(app)/layout.tsx` | Wrap with `<SyncProvider>` |
| `src/components/saved-queries/saved-queries-panel.tsx` | Replace tRPC calls with `useSavedQueries()` |
| `src/components/query/save-query-dialog.tsx` | Replace tRPC mutation with `useSavedQueries().create` |
| `src/components/history/query-history-panel.tsx` | Replace tRPC calls with `useQueryHistory()` |
| `src/app/(app)/page.tsx` | Replace `useQueryStore` with `useQueryTabs`, write history to Dexie on execute |
| `src/components/query/tab-container.tsx` | Replace `useQueryStore` with `useQueryTabs` |
| `src/components/query/query-toolbar.tsx` | Replace `useQueryStore` with `useQueryTabs` if used |

### Deleted files

| File | Reason |
|------|--------|
| `src/stores/query-store.ts` | Replaced by `useQueryTabs` hook backed by Dexie |
| `src/stores/schema-store.ts` | Replaced by `useUiState` hook backed by Dexie |

---

## Task 1: Install Dexie and define the database

**Files:**
- Create: `apps/webapp/src/lib/dexie.ts`

- [ ] **Step 1: Install dexie and dexie-react-hooks**

```bash
cd /Users/rohithgilla/github.com/Rohithgilla12/data-peek
pnpm --filter @data-peek/webapp add dexie dexie-react-hooks
```

- [ ] **Step 2: Create Dexie database definition**

Create `apps/webapp/src/lib/dexie.ts`:

```typescript
import Dexie, { type EntityTable } from 'dexie'

export type SyncStatus = 'synced' | 'pending' | 'deleted'

export interface DexieSavedQuery {
  id: string
  connectionId: string
  name: string
  query: string
  description?: string
  category?: string
  tags?: string[]
  usageCount: number
  createdAt: string
  updatedAt: string
  _syncStatus: SyncStatus
}

export interface DexieHistoryEntry {
  id: string
  connectionId: string
  query: string
  status: 'success' | 'error'
  durationMs?: number
  rowCount?: number
  errorMessage?: string
  executedAt: string
  _syncStatus: SyncStatus
}

export interface DexieQueryTab {
  id: string
  title: string
  sql: string
  updatedAt: string
}

export interface DexieUiState {
  key: string
  value: unknown
}

export interface DexieSchemaCache {
  connectionId: string
  schemas: unknown
  cachedAt: string
}

class DataPeekDB extends Dexie {
  savedQueries!: EntityTable<DexieSavedQuery, 'id'>
  queryHistory!: EntityTable<DexieHistoryEntry, 'id'>
  queryTabs!: EntityTable<DexieQueryTab, 'id'>
  uiState!: EntityTable<DexieUiState, 'key'>
  schemaCache!: EntityTable<DexieSchemaCache, 'connectionId'>

  constructor(userId: string) {
    super(`data-peek-${userId}`)
    this.version(1).stores({
      savedQueries: 'id, connectionId, name, updatedAt, _syncStatus',
      queryHistory: 'id, connectionId, status, executedAt, _syncStatus',
      queryTabs: 'id, updatedAt',
      uiState: 'key',
      schemaCache: 'connectionId, cachedAt',
    })
  }
}

let dbInstance: DataPeekDB | null = null

export function getDB(userId: string): DataPeekDB {
  if (!dbInstance || dbInstance.name !== `data-peek-${userId}`) {
    dbInstance?.close()
    dbInstance = new DataPeekDB(userId)
  }
  return dbInstance
}

export function closeDB() {
  dbInstance?.close()
  dbInstance = null
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/rohithgilla/github.com/Rohithgilla12/data-peek
pnpm --filter @data-peek/webapp typecheck
```

Expected: no errors related to dexie.ts

- [ ] **Step 4: Commit**

```bash
git add apps/webapp/src/lib/dexie.ts apps/webapp/package.json pnpm-lock.yaml
git commit -m "feat(webapp): add Dexie database definition for local-first storage"
```

---

## Task 2: Add sync endpoints to tRPC routers

**Files:**
- Modify: `apps/webapp/src/server/routers/saved-queries.ts`
- Modify: `apps/webapp/src/server/routers/history.ts`

- [ ] **Step 1: Add `updatedSince` filter and `bulkUpsert` to saved-queries router**

In `apps/webapp/src/server/routers/saved-queries.ts`, add `updatedSince` to the `list` input and a new `bulkUpsert` mutation:

Add to the `list` input schema (inside the existing `.object()`):

```typescript
updatedSince: z.string().datetime().optional(),
```

Add this filter after the existing conditions array (line ~19):

```typescript
if (input?.updatedSince) {
  conditions.push(
    sql`${savedQueries.updatedAt} > ${new Date(input.updatedSince)}`
  )
}
```

Add the `sql` import — it's already imported from `drizzle-orm` on line 2.

Add a new `bulkUpsert` endpoint after `incrementUsage`:

```typescript
bulkUpsert: protectedProcedure
  .input(
    z.object({
      upserts: z.array(
        z.object({
          id: z.string().uuid(),
          connectionId: z.string().uuid(),
          name: z.string().min(1).max(200),
          query: z.string().min(1),
          description: z.string().optional(),
          category: z.string().optional(),
          tags: z.array(z.string()).optional(),
          usageCount: z.number().int().default(0),
        })
      ),
      deletes: z.array(z.string().uuid()),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const results = []

    for (const item of input.upserts) {
      const existing = await ctx.db.query.savedQueries.findFirst({
        where: and(eq(savedQueries.id, item.id), eq(savedQueries.customerId, ctx.customerId)),
      })

      if (existing) {
        const [updated] = await ctx.db
          .update(savedQueries)
          .set({ ...item, updatedAt: new Date() })
          .where(and(eq(savedQueries.id, item.id), eq(savedQueries.customerId, ctx.customerId)))
          .returning()
        results.push(updated)
      } else {
        const [created] = await ctx.db
          .insert(savedQueries)
          .values({ ...item, customerId: ctx.customerId })
          .returning()
        results.push(created)
      }
    }

    for (const id of input.deletes) {
      await ctx.db
        .delete(savedQueries)
        .where(and(eq(savedQueries.id, id), eq(savedQueries.customerId, ctx.customerId)))
    }

    return { upserted: results, deleted: input.deletes.length }
  }),
```

- [ ] **Step 2: Add `executedSince` filter and `bulkCreate` to history router**

In `apps/webapp/src/server/routers/history.ts`, add `executedSince` to the `list` input:

```typescript
executedSince: z.string().datetime().optional(),
```

Add this filter after the existing conditions (line ~20), adding `sql` to the import from `drizzle-orm`:

```typescript
if (input?.executedSince) {
  conditions.push(
    sql`${queryHistory.executedAt} > ${new Date(input.executedSince)}`
  )
}
```

Add a `bulkCreate` endpoint after `clearAll`:

```typescript
bulkCreate: protectedProcedure
  .input(
    z.object({
      entries: z.array(
        z.object({
          id: z.string().uuid(),
          connectionId: z.string().uuid(),
          query: z.string(),
          status: z.enum(['success', 'error']),
          durationMs: z.number().int().optional(),
          rowCount: z.number().int().optional(),
          errorMessage: z.string().optional(),
          executedAt: z.string().datetime(),
        })
      ),
    })
  )
  .mutation(async ({ ctx, input }) => {
    if (input.entries.length === 0) return { created: 0 }

    const values = input.entries.map((e) => ({
      ...e,
      customerId: ctx.customerId,
      executedAt: new Date(e.executedAt),
    }))

    await ctx.db.insert(queryHistory).values(values).onConflictDoNothing()
    return { created: values.length }
  }),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @data-peek/webapp typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/webapp/src/server/routers/saved-queries.ts apps/webapp/src/server/routers/history.ts
git commit -m "feat(webapp): add sync endpoints to saved-queries and history routers"
```

---

## Task 3: Build the SyncManager

**Files:**
- Create: `apps/webapp/src/lib/sync-manager.ts`

- [ ] **Step 1: Create SyncManager**

Create `apps/webapp/src/lib/sync-manager.ts`:

```typescript
import type { TRPCClient } from '@/lib/trpc-client'
import { getDB, type SyncStatus } from './dexie'

const SYNC_INTERVAL_MS = 30_000
const LAST_SYNC_KEY = 'lastSyncAt'

export class SyncManager {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private isSyncing = false
  private userId: string
  private trpc: TRPCClient

  constructor(userId: string, trpc: TRPCClient) {
    this.userId = userId
    this.trpc = trpc
  }

  start() {
    this.syncNow()
    this.intervalId = setInterval(() => this.syncNow(), SYNC_INTERVAL_MS)

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange)
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange)
    }
  }

  private onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      this.syncNow()
    }
  }

  async syncNow() {
    if (this.isSyncing) return
    this.isSyncing = true

    try {
      await this.pushSavedQueries()
      await this.pushHistory()
      await this.pullSavedQueries()
      await this.pullHistory()
    } catch (err) {
      console.warn('[SyncManager] sync failed:', err)
    } finally {
      this.isSyncing = false
    }
  }

  private async pushSavedQueries() {
    const db = getDB(this.userId)

    const pending = await db.savedQueries
      .where('_syncStatus')
      .equals('pending')
      .toArray()

    const deleted = await db.savedQueries
      .where('_syncStatus')
      .equals('deleted')
      .toArray()

    if (pending.length === 0 && deleted.length === 0) return

    const upserts = pending.map((q) => ({
      id: q.id,
      connectionId: q.connectionId,
      name: q.name,
      query: q.query,
      description: q.description,
      category: q.category,
      tags: q.tags,
      usageCount: q.usageCount,
    }))

    await this.trpc.savedQueries.bulkUpsert.mutate({
      upserts,
      deletes: deleted.map((d) => d.id),
    })

    await db.savedQueries
      .where('_syncStatus')
      .equals('pending')
      .modify({ _syncStatus: 'synced' as SyncStatus })

    const deletedIds = deleted.map((d) => d.id)
    if (deletedIds.length > 0) {
      await db.savedQueries.bulkDelete(deletedIds)
    }
  }

  private async pushHistory() {
    const db = getDB(this.userId)

    const pending = await db.queryHistory
      .where('_syncStatus')
      .equals('pending')
      .toArray()

    if (pending.length === 0) return

    const entries = pending.map((h) => ({
      id: h.id,
      connectionId: h.connectionId,
      query: h.query,
      status: h.status,
      durationMs: h.durationMs,
      rowCount: h.rowCount,
      errorMessage: h.errorMessage,
      executedAt: h.executedAt,
    }))

    await this.trpc.history.bulkCreate.mutate({ entries })

    await db.queryHistory
      .where('_syncStatus')
      .equals('pending')
      .modify({ _syncStatus: 'synced' as SyncStatus })
  }

  private async pullSavedQueries() {
    const db = getDB(this.userId)
    const lastSync = await this.getLastSyncTime('savedQueries')

    const remote = await this.trpc.savedQueries.list.query(
      lastSync ? { updatedSince: lastSync } : undefined
    )

    for (const item of remote) {
      const local = await db.savedQueries.get(item.id)
      if (local && local._syncStatus === 'pending') continue

      await db.savedQueries.put({
        id: item.id,
        connectionId: item.connectionId,
        name: item.name,
        query: item.query,
        description: item.description ?? undefined,
        category: item.category ?? undefined,
        tags: item.tags ?? undefined,
        usageCount: item.usageCount,
        createdAt: new Date(item.createdAt).toISOString(),
        updatedAt: new Date(item.updatedAt).toISOString(),
        _syncStatus: 'synced',
      })
    }

    await this.setLastSyncTime('savedQueries')
  }

  private async pullHistory() {
    const db = getDB(this.userId)
    const lastSync = await this.getLastSyncTime('history')

    const remote = await this.trpc.history.list.query(
      lastSync ? { executedSince: lastSync } : undefined
    )

    for (const item of remote) {
      const exists = await db.queryHistory.get(item.id)
      if (exists) continue

      await db.queryHistory.put({
        id: item.id,
        connectionId: item.connectionId,
        query: item.query,
        status: item.status as 'success' | 'error',
        durationMs: item.durationMs ?? undefined,
        rowCount: item.rowCount ?? undefined,
        errorMessage: item.errorMessage ?? undefined,
        executedAt: new Date(item.executedAt).toISOString(),
        _syncStatus: 'synced',
      })
    }

    await this.setLastSyncTime('history')
  }

  private async getLastSyncTime(table: string): Promise<string | undefined> {
    const db = getDB(this.userId)
    const entry = await db.uiState.get(`${LAST_SYNC_KEY}:${table}`)
    return entry?.value as string | undefined
  }

  private async setLastSyncTime(table: string) {
    const db = getDB(this.userId)
    await db.uiState.put({
      key: `${LAST_SYNC_KEY}:${table}`,
      value: new Date().toISOString(),
    })
  }
}
```

- [ ] **Step 2: Export TRPCClient type from trpc-client**

Check `apps/webapp/src/lib/trpc-client.ts` and ensure it exports a type that the SyncManager can use. The SyncManager needs the vanilla tRPC client (not React hooks). Look at the existing file — it likely creates a `trpc` object. We need to export the type of that client.

Add to the bottom of `apps/webapp/src/lib/trpc-client.ts`:

```typescript
export type TRPCClient = typeof trpc
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @data-peek/webapp typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/webapp/src/lib/sync-manager.ts apps/webapp/src/lib/trpc-client.ts
git commit -m "feat(webapp): add SyncManager for background Dexie-to-Postgres sync"
```

---

## Task 4: Create SyncProvider

**Files:**
- Create: `apps/webapp/src/components/sync-provider.tsx`
- Modify: `apps/webapp/src/app/(app)/layout.tsx`

- [ ] **Step 1: Create SyncProvider component**

Create `apps/webapp/src/components/sync-provider.tsx`:

```typescript
'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'
import { trpc } from '@/lib/trpc-client'
import { SyncManager } from '@/lib/sync-manager'

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth()
  const syncRef = useRef<SyncManager | null>(null)
  const trpcClient = trpc.useUtils().client

  useEffect(() => {
    if (!userId || !trpcClient) return

    const manager = new SyncManager(userId, trpcClient as any)
    syncRef.current = manager
    manager.start()

    return () => {
      manager.stop()
      syncRef.current = null
    }
  }, [userId, trpcClient])

  return <>{children}</>
}
```

- [ ] **Step 2: Add SyncProvider to app layout**

In `apps/webapp/src/app/(app)/layout.tsx`, add the import and wrap children:

Add import:
```typescript
import { SyncProvider } from '@/components/sync-provider'
```

Wrap the content inside the existing `<Suspense>`:

```typescript
<Suspense>
  <SyncProvider>
    <div className="flex h-screen overflow-hidden">
      <UrlSync />
      <CommandPalette />
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <UsageBanner />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  </SyncProvider>
</Suspense>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @data-peek/webapp typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/webapp/src/components/sync-provider.tsx apps/webapp/src/app/\(app\)/layout.tsx
git commit -m "feat(webapp): add SyncProvider to mount background sync on auth"
```

---

## Task 5: Create useSavedQueries hook

**Files:**
- Create: `apps/webapp/src/hooks/use-saved-queries.ts`

- [ ] **Step 1: Create the hook**

Create `apps/webapp/src/hooks/use-saved-queries.ts`:

```typescript
'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '@clerk/nextjs'
import { getDB, type DexieSavedQuery } from '@/lib/dexie'

export function useSavedQueries(connectionId?: string, search?: string) {
  const { userId } = useAuth()

  const queries = useLiveQuery(async () => {
    if (!userId) return []
    const db = getDB(userId)
    let collection = db.savedQueries
      .where('_syncStatus')
      .notEqual('deleted')

    let results = await collection.reverse().sortBy('updatedAt')

    if (connectionId) {
      results = results.filter((q) => q.connectionId === connectionId)
    }

    if (search) {
      const term = search.toLowerCase()
      results = results.filter(
        (q) => q.name.toLowerCase().includes(term) || q.query.toLowerCase().includes(term)
      )
    }

    return results
  }, [userId, connectionId, search])

  const create = async (input: {
    connectionId: string
    name: string
    query: string
    description?: string
    category?: string
    tags?: string[]
  }) => {
    if (!userId) return
    const db = getDB(userId)
    const now = new Date().toISOString()
    await db.savedQueries.add({
      id: crypto.randomUUID(),
      ...input,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
      _syncStatus: 'pending',
    })
  }

  const update = async (id: string, updates: Partial<Pick<DexieSavedQuery, 'name' | 'query' | 'description' | 'category' | 'tags'>>) => {
    if (!userId) return
    const db = getDB(userId)
    await db.savedQueries.update(id, {
      ...updates,
      updatedAt: new Date().toISOString(),
      _syncStatus: 'pending',
    })
  }

  const remove = async (id: string) => {
    if (!userId) return
    const db = getDB(userId)
    const item = await db.savedQueries.get(id)
    if (!item) return

    if (item._syncStatus === 'pending') {
      await db.savedQueries.delete(id)
    } else {
      await db.savedQueries.update(id, { _syncStatus: 'deleted' })
    }
  }

  const incrementUsage = async (id: string) => {
    if (!userId) return
    const db = getDB(userId)
    const item = await db.savedQueries.get(id)
    if (!item) return
    await db.savedQueries.update(id, {
      usageCount: item.usageCount + 1,
      updatedAt: new Date().toISOString(),
      _syncStatus: 'pending',
    })
  }

  return { queries: queries ?? [], create, update, remove, incrementUsage }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @data-peek/webapp typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/webapp/src/hooks/use-saved-queries.ts
git commit -m "feat(webapp): add useSavedQueries hook backed by Dexie"
```

---

## Task 6: Create useQueryHistory hook

**Files:**
- Create: `apps/webapp/src/hooks/use-query-history.ts`

- [ ] **Step 1: Create the hook**

Create `apps/webapp/src/hooks/use-query-history.ts`:

```typescript
'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '@clerk/nextjs'
import { getDB } from '@/lib/dexie'

export function useQueryHistory(connectionId?: string, status?: 'success' | 'error') {
  const { userId } = useAuth()

  const history = useLiveQuery(async () => {
    if (!userId) return []
    const db = getDB(userId)

    let results = await db.queryHistory
      .where('_syncStatus')
      .notEqual('deleted')
      .reverse()
      .sortBy('executedAt')

    if (connectionId) {
      results = results.filter((h) => h.connectionId === connectionId)
    }

    if (status) {
      results = results.filter((h) => h.status === status)
    }

    return results.slice(0, 200)
  }, [userId, connectionId, status])

  const addEntry = async (entry: {
    connectionId: string
    query: string
    status: 'success' | 'error'
    durationMs?: number
    rowCount?: number
    errorMessage?: string
  }) => {
    if (!userId) return
    const db = getDB(userId)
    await db.queryHistory.add({
      id: crypto.randomUUID(),
      ...entry,
      executedAt: new Date().toISOString(),
      _syncStatus: 'pending',
    })
  }

  const remove = async (id: string) => {
    if (!userId) return
    const db = getDB(userId)
    const item = await db.queryHistory.get(id)
    if (!item) return

    if (item._syncStatus === 'pending') {
      await db.queryHistory.delete(id)
    } else {
      await db.queryHistory.update(id, { _syncStatus: 'deleted' })
    }
  }

  const clearAll = async (connectionId?: string) => {
    if (!userId) return
    const db = getDB(userId)

    if (connectionId) {
      const entries = await db.queryHistory
        .where('connectionId')
        .equals(connectionId)
        .toArray()
      for (const entry of entries) {
        if (entry._syncStatus === 'pending') {
          await db.queryHistory.delete(entry.id)
        } else {
          await db.queryHistory.update(entry.id, { _syncStatus: 'deleted' })
        }
      }
    } else {
      const entries = await db.queryHistory.toArray()
      for (const entry of entries) {
        if (entry._syncStatus === 'pending') {
          await db.queryHistory.delete(entry.id)
        } else {
          await db.queryHistory.update(entry.id, { _syncStatus: 'deleted' })
        }
      }
    }
  }

  return { history: history ?? [], addEntry, remove, clearAll }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @data-peek/webapp typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/webapp/src/hooks/use-query-history.ts
git commit -m "feat(webapp): add useQueryHistory hook backed by Dexie"
```

---

## Task 7: Create useQueryTabs hook

**Files:**
- Create: `apps/webapp/src/hooks/use-query-tabs.ts`

- [ ] **Step 1: Create the hook**

Create `apps/webapp/src/hooks/use-query-tabs.ts`:

```typescript
'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useRef, useSyncExternalStore } from 'react'
import { getDB } from '@/lib/dexie'

let activeTabId: string | null = null
const activeTabListeners = new Set<() => void>()

function setActiveTabId(id: string) {
  activeTabId = id
  activeTabListeners.forEach((l) => l())
}

function useActiveTabId() {
  return useSyncExternalStore(
    (cb) => {
      activeTabListeners.add(cb)
      return () => activeTabListeners.delete(cb)
    },
    () => activeTabId,
    () => activeTabId
  )
}

let tabCounter = 1

export function useQueryTabs() {
  const { userId } = useAuth()
  const currentActiveTabId = useActiveTabId()
  const initializedRef = useRef(false)

  const tabs = useLiveQuery(async () => {
    if (!userId) return []
    const db = getDB(userId)
    const all = await db.queryTabs.orderBy('updatedAt').toArray()

    if (all.length === 0 && !initializedRef.current) {
      initializedRef.current = true
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      await db.queryTabs.add({ id, title: `Query ${tabCounter++}`, sql: '', updatedAt: now })
      setActiveTabId(id)
      return db.queryTabs.orderBy('updatedAt').toArray()
    }

    if (!currentActiveTabId && all.length > 0) {
      setActiveTabId(all[all.length - 1].id)
    }

    return all
  }, [userId, currentActiveTabId])

  const addTab = useCallback(async () => {
    if (!userId) return
    const db = getDB(userId)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await db.queryTabs.add({ id, title: `Query ${tabCounter++}`, sql: '', updatedAt: now })
    setActiveTabId(id)
  }, [userId])

  const removeTab = useCallback(async (id: string) => {
    if (!userId) return
    const db = getDB(userId)
    const all = await db.queryTabs.orderBy('updatedAt').toArray()
    if (all.length <= 1) return

    await db.queryTabs.delete(id)
    if (currentActiveTabId === id) {
      const remaining = all.filter((t) => t.id !== id)
      setActiveTabId(remaining[remaining.length - 1].id)
    }
  }, [userId, currentActiveTabId])

  const setActiveTab = useCallback((id: string) => {
    setActiveTabId(id)
  }, [])

  const updateSql = useCallback(async (id: string, sql: string) => {
    if (!userId) return
    const db = getDB(userId)
    await db.queryTabs.update(id, { sql, updatedAt: new Date().toISOString() })
  }, [userId])

  return {
    tabs: tabs ?? [],
    activeTabId: currentActiveTabId ?? '',
    addTab,
    removeTab,
    setActiveTab,
    updateSql,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @data-peek/webapp typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/webapp/src/hooks/use-query-tabs.ts
git commit -m "feat(webapp): add useQueryTabs hook backed by Dexie"
```

---

## Task 8: Create useUiState hook

**Files:**
- Create: `apps/webapp/src/hooks/use-ui-state.ts`

- [ ] **Step 1: Create the hook**

Create `apps/webapp/src/hooks/use-ui-state.ts`:

```typescript
'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '@clerk/nextjs'
import { useCallback } from 'react'
import { getDB } from '@/lib/dexie'

export function useUiState<T>(key: string, defaultValue: T): { value: T; set: (v: T) => Promise<void> } {
  const { userId } = useAuth()

  const entry = useLiveQuery(async () => {
    if (!userId) return undefined
    const db = getDB(userId)
    return db.uiState.get(key)
  }, [userId, key])

  const set = useCallback(async (value: T) => {
    if (!userId) return
    const db = getDB(userId)
    await db.uiState.put({ key, value })
  }, [userId, key])

  return {
    value: (entry?.value as T) ?? defaultValue,
    set,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @data-peek/webapp typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/webapp/src/hooks/use-ui-state.ts
git commit -m "feat(webapp): add useUiState hook for persisted UI preferences"
```

---

## Task 9: Migrate SavedQueriesPanel to Dexie

**Files:**
- Modify: `apps/webapp/src/components/saved-queries/saved-queries-panel.tsx`

- [ ] **Step 1: Replace tRPC with useSavedQueries hook**

Replace the full contents of `apps/webapp/src/components/saved-queries/saved-queries-panel.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Play, Trash2, Search } from 'lucide-react'
import { useSavedQueries } from '@/hooks/use-saved-queries'
import { useConnectionStore } from '@/stores/connection-store'
import { useQueryTabs } from '@/hooks/use-query-tabs'

export function SavedQueriesPanel() {
  const [search, setSearch] = useState('')
  const { activeConnectionId } = useConnectionStore()
  const { activeTabId, updateSql } = useQueryTabs()
  const { queries, remove, incrementUsage } = useSavedQueries(
    activeConnectionId ?? undefined,
    search || undefined
  )

  if (!activeConnectionId) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground">Select a connection first</div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved queries..."
            className="w-full rounded-md border border-border bg-input pl-7 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {queries.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            No saved queries
          </div>
        )}
        {queries.map((q) => (
          <div key={q.id} className="group px-3 py-2 border-b border-border/30 hover:bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground truncate">{q.name}</span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    updateSql(activeTabId, q.query)
                    incrementUsage(q.id)
                  }}
                  className="p-1 rounded text-muted-foreground hover:text-accent"
                  title="Load into editor"
                >
                  <Play className="h-3 w-3" />
                </button>
                <button
                  onClick={() => remove(q.id)}
                  className="p-1 rounded text-muted-foreground hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
            <pre className="mt-1 text-[10px] text-muted-foreground truncate font-mono">
              {q.query}
            </pre>
            {q.description && (
              <p className="mt-0.5 text-[10px] text-muted-foreground/70">{q.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @data-peek/webapp typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/webapp/src/components/saved-queries/saved-queries-panel.tsx
git commit -m "refactor(webapp): migrate SavedQueriesPanel to Dexie via useSavedQueries"
```

---

## Task 10: Migrate SaveQueryDialog to Dexie

**Files:**
- Modify: `apps/webapp/src/components/query/save-query-dialog.tsx`

- [ ] **Step 1: Replace tRPC mutation with useSavedQueries**

Replace the full contents of `apps/webapp/src/components/query/save-query-dialog.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Bookmark, X } from 'lucide-react'
import { trpc } from '@/lib/trpc-client'
import { useConnectionStore } from '@/stores/connection-store'
import { useQueryTabs } from '@/hooks/use-query-tabs'
import { useSavedQueries } from '@/hooks/use-saved-queries'
import { ProBadge } from '@/components/upgrade/pro-badge'

export function SaveQueryDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const { activeConnectionId } = useConnectionStore()
  const { tabs, activeTabId } = useQueryTabs()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const { create } = useSavedQueries()
  const { data: usage } = trpc.usage.current.useQuery()

  if (!open) {
    if (
      usage?.plan === 'free' &&
      (usage?.usage.savedQueriesUsed ?? 0) >= (usage?.limits.savedQueries ?? 10)
    ) {
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Save</span>
          <ProBadge feature="Unlimited Saved Queries" />
        </div>
      )
    }

    return (
      <button
        onClick={() => setOpen(true)}
        disabled={!activeTab?.sql.trim() || !activeConnectionId}
        className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1 text-xs text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors disabled:opacity-50"
        title="Save query"
      >
        <Bookmark className="h-3 w-3" />
        Save
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Query name..."
        className="rounded-md border border-border bg-input px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring w-40"
        autoFocus
      />
      <button
        onClick={async () => {
          if (!activeConnectionId || !activeTab?.sql || !name.trim()) return
          setIsSaving(true)
          await create({
            connectionId: activeConnectionId,
            name: name.trim(),
            query: activeTab.sql,
            description: description || undefined,
          })
          setIsSaving(false)
          setOpen(false)
          setName('')
          setDescription('')
        }}
        disabled={!name.trim() || isSaving}
        className="rounded-md bg-accent px-2 py-1 text-xs text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
      >
        {isSaving ? '...' : 'Save'}
      </button>
      <button
        onClick={() => setOpen(false)}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @data-peek/webapp typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/webapp/src/components/query/save-query-dialog.tsx
git commit -m "refactor(webapp): migrate SaveQueryDialog to Dexie via useSavedQueries"
```

---

## Task 11: Migrate QueryHistoryPanel to Dexie

**Files:**
- Modify: `apps/webapp/src/components/history/query-history-panel.tsx`

- [ ] **Step 1: Replace tRPC with useQueryHistory hook**

Replace the full contents of `apps/webapp/src/components/history/query-history-panel.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Play, Trash2, CheckCircle, XCircle } from 'lucide-react'
import { useQueryHistory } from '@/hooks/use-query-history'
import { useConnectionStore } from '@/stores/connection-store'
import { useQueryTabs } from '@/hooks/use-query-tabs'

function formatRelativeTime(date: Date | string): string {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(date).toLocaleDateString()
}

export function QueryHistoryPanel() {
  const [statusFilter, setStatusFilter] = useState<'success' | 'error' | undefined>()
  const { activeConnectionId } = useConnectionStore()
  const { activeTabId, updateSql } = useQueryTabs()
  const { history, remove } = useQueryHistory(activeConnectionId ?? undefined, statusFilter)

  if (!activeConnectionId) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground">Select a connection first</div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border">
        <button
          onClick={() => setStatusFilter(undefined)}
          className={`rounded px-2 py-0.5 text-[10px] ${!statusFilter ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground'}`}
        >
          All
        </button>
        <button
          onClick={() => setStatusFilter('success')}
          className={`rounded px-2 py-0.5 text-[10px] ${statusFilter === 'success' ? 'bg-success/10 text-success' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Success
        </button>
        <button
          onClick={() => setStatusFilter('error')}
          className={`rounded px-2 py-0.5 text-[10px] ${statusFilter === 'error' ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Errors
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {history.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">No history yet</div>
        )}
        {history.map((entry) => (
          <div
            key={entry.id}
            className={`group px-3 py-2 border-b border-border/30 hover:bg-muted/30 ${
              entry.status === 'error' ? 'border-l-2 border-l-destructive/50' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {entry.status === 'success' ? (
                  <CheckCircle className="h-3 w-3 text-success flex-shrink-0" />
                ) : (
                  <XCircle className="h-3 w-3 text-destructive flex-shrink-0" />
                )}
                <span className="text-[10px] text-muted-foreground">
                  {formatRelativeTime(entry.executedAt)}
                </span>
                {entry.durationMs && (
                  <span className="text-[10px] text-muted-foreground">
                    · {entry.durationMs}ms
                  </span>
                )}
                {entry.rowCount !== null && entry.rowCount !== undefined && entry.status === 'success' && (
                  <span className="text-[10px] text-muted-foreground">
                    · {entry.rowCount} rows
                  </span>
                )}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => updateSql(activeTabId, entry.query)}
                  className="p-1 rounded text-muted-foreground hover:text-accent"
                  title="Load into editor"
                >
                  <Play className="h-3 w-3" />
                </button>
                <button
                  onClick={() => remove(entry.id)}
                  className="p-1 rounded text-muted-foreground hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
            <pre className="mt-1 text-[10px] text-foreground/80 truncate font-mono">
              {entry.query}
            </pre>
            {entry.errorMessage && (
              <p className="mt-1 text-[10px] text-destructive truncate">{entry.errorMessage}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @data-peek/webapp typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/webapp/src/components/history/query-history-panel.tsx
git commit -m "refactor(webapp): migrate QueryHistoryPanel to Dexie via useQueryHistory"
```

---

## Task 12: Migrate page.tsx to useQueryTabs and local history recording

**Files:**
- Modify: `apps/webapp/src/app/(app)/page.tsx`

- [ ] **Step 1: Replace useQueryStore with useQueryTabs and add local history**

This is the main page. The key changes:
1. Replace `useQueryStore` import with `useQueryTabs`
2. Add `useQueryHistory` for recording execution results locally
3. Query results and execution state remain in React state (not Dexie — they're ephemeral)

Replace the imports and state setup at the top of the file. The `useQueryStore` provided `tabs`, `activeTabId`, `updateSql`, `setResults`, `setError`, `setExecuting` — the last three are ephemeral state that should stay in React, not Dexie.

Replace imports:
```typescript
import { useQueryTabs } from '@/hooks/use-query-tabs'
import { useQueryHistory } from '@/hooks/use-query-history'
```

Remove:
```typescript
import { useQueryStore } from '@/stores/query-store'
```

Replace the store destructuring:
```typescript
const { tabs, activeTabId, updateSql, addTab, removeTab, setActiveTab } = useQueryTabs()
const { addEntry: addHistoryEntry } = useQueryHistory()
```

Add React state for ephemeral execution state (results, errors, executing flags) since these don't belong in Dexie:
```typescript
const [tabResults, setTabResults] = useState<Record<string, { rows: Record<string, unknown>[]; fields: QueryField[]; rowCount: number; durationMs: number } | null>>({})
const [tabErrors, setTabErrors] = useState<Record<string, string | null>>({})
const [tabExecuting, setTabExecuting] = useState<Record<string, boolean>>({})
```

Replace the helper calls throughout:
- `setResults(activeTabId, result)` → `setTabResults(prev => ({ ...prev, [activeTabId]: result }))`
- `setError(activeTabId, error)` → `setTabErrors(prev => ({ ...prev, [activeTabId]: error }))`
- `setExecuting(activeTabId, true)` → `setTabExecuting(prev => ({ ...prev, [activeTabId]: true }))`
- `activeTab?.results` → `tabResults[activeTabId]`
- `activeTab?.error` → `tabErrors[activeTabId]`
- `activeTab?.isExecuting` → `tabExecuting[activeTabId]`
- `activeTab?.sql` → `activeTab?.sql` (unchanged, still from Dexie)

In `executeQuery`, after `onSuccess`, add history recording:
```typescript
onSuccess: (result) => {
  if (!controller.signal.aborted) {
    setTabResults(prev => ({ ...prev, [activeTabId]: result }))
    setTabExecuting(prev => ({ ...prev, [activeTabId]: false }))
    addHistoryEntry({
      connectionId: activeConnectionId,
      query: sql,
      status: 'success',
      durationMs: result.durationMs,
      rowCount: result.rowCount,
    })
  }
},
onError: (error) => {
  if (!controller.signal.aborted) {
    setTabErrors(prev => ({ ...prev, [activeTabId]: error.message }))
    setTabExecuting(prev => ({ ...prev, [activeTabId]: false }))
    addHistoryEntry({
      connectionId: activeConnectionId,
      query: sql,
      status: 'error',
      errorMessage: error.message,
    })
  }
},
```

Also update the `useEffect` event listeners — they currently call `useQueryStore.getState()`. Replace with the values from `useQueryTabs`:

```typescript
useEffect(() => {
  function onExecuteEvent() {
    const tab = tabs.find((t) => t.id === activeTabId)
    if (tab?.sql.trim()) executeQuery(tab.sql)
  }
  function onFormatEvent() {
    handleFormat()
  }
  window.addEventListener('datapeek:execute', onExecuteEvent)
  window.addEventListener('datapeek:format', onFormatEvent)
  return () => {
    window.removeEventListener('datapeek:execute', onExecuteEvent)
    window.removeEventListener('datapeek:format', onFormatEvent)
  }
}, [tabs, activeTabId, executeQuery, handleFormat])
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @data-peek/webapp typecheck
```

- [ ] **Step 3: Manual smoke test**

Open the webapp. Verify:
- Tabs persist across page reloads
- Query execution works and records history in the sidebar
- Saved queries appear instantly when created
- No network waterfall for loading saved queries or history on page load

- [ ] **Step 4: Commit**

```bash
git add apps/webapp/src/app/\(app\)/page.tsx
git commit -m "refactor(webapp): migrate QueryPage to Dexie-backed tabs and local history recording"
```

---

## Task 13: Update remaining consumers of useQueryStore

**Files:**
- Modify: `apps/webapp/src/components/query/tab-container.tsx`
- Modify: `apps/webapp/src/components/query/query-toolbar.tsx`
- Check: any other files importing `useQueryStore`

- [ ] **Step 1: Find all remaining useQueryStore imports**

```bash
cd /Users/rohithgilla/github.com/Rohithgilla12/data-peek
grep -rn "useQueryStore" apps/webapp/src/ --include="*.tsx" --include="*.ts"
```

For each file found (likely `tab-container.tsx`, `query-toolbar.tsx`, and possibly the command palette):

Replace:
```typescript
import { useQueryStore } from '@/stores/query-store'
```
With:
```typescript
import { useQueryTabs } from '@/hooks/use-query-tabs'
```

And update the destructuring to match `useQueryTabs` API:
- `useQueryStore()` returns `{ tabs, activeTabId, addTab, removeTab, setActiveTab, updateSql, setResults, setError, setExecuting }`
- `useQueryTabs()` returns `{ tabs, activeTabId, addTab, removeTab, setActiveTab, updateSql }`

For any component that only reads `tabs`/`activeTabId`/`updateSql`, the migration is a direct swap. For components that use `setResults`/`setError`/`setExecuting`, those are now ephemeral state in `page.tsx` — pass them as props or lift state as needed.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @data-peek/webapp typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/webapp/src/components/
git commit -m "refactor(webapp): update all components to use useQueryTabs instead of useQueryStore"
```

---

## Task 14: Delete old stores and clean up

**Files:**
- Delete: `apps/webapp/src/stores/query-store.ts`
- Delete: `apps/webapp/src/stores/schema-store.ts`

- [ ] **Step 1: Verify no remaining imports**

```bash
cd /Users/rohithgilla/github.com/Rohithgilla12/data-peek
grep -rn "query-store\|schema-store" apps/webapp/src/ --include="*.tsx" --include="*.ts"
```

Expected: no results (all consumers migrated in prior tasks).

- [ ] **Step 2: Delete the old stores**

```bash
rm apps/webapp/src/stores/query-store.ts
rm apps/webapp/src/stores/schema-store.ts
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @data-peek/webapp typecheck
```

- [ ] **Step 4: Commit**

```bash
git add -A apps/webapp/src/stores/
git commit -m "chore(webapp): delete query-store and schema-store, replaced by Dexie hooks"
```

---

## Task 15: Final verification and build

- [ ] **Step 1: Full typecheck**

```bash
pnpm --filter @data-peek/webapp typecheck
```

- [ ] **Step 2: Build**

```bash
pnpm --filter @data-peek/webapp build
```

- [ ] **Step 3: Lint**

```bash
pnpm --filter @data-peek/webapp lint
```

- [ ] **Step 4: Manual end-to-end smoke test**

Test the following flows:
1. Open app → tabs load from Dexie (or create initial tab)
2. Write a query → SQL persists across page reload
3. Execute query → results appear, history entry shows in sidebar instantly
4. Save query → appears in saved queries panel instantly
5. Reload page → saved queries and history are still there (Dexie persistence)
6. Wait 30s → check browser network tab for sync requests to tRPC
7. Open in a second browser tab → after sync, saved queries appear there too

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A apps/webapp/
git commit -m "feat(webapp): complete local-first migration to Dexie with background sync"
```
