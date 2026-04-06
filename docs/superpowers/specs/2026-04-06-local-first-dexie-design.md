# Local-First with Dexie + Postgres Sync

## Goal

Make the webapp feel instant by moving user-facing data (saved queries, query history, tabs, UI state) to IndexedDB via Dexie, with background sync to the existing Postgres backend. No new vendors, no new paradigms.

## What Moves to Dexie

| Data | Dexie | Sync to Server | Notes |
|------|-------|---------------|-------|
| Saved queries | Yes | Yes (bidirectional) | Full CRUD locally, background push/pull |
| Query history | Yes | Yes (client-to-server) | Written locally on execute, pushed to server |
| Query tabs/drafts | Yes | No (local only) | Persist SQL drafts across sessions |
| UI state | Yes | No (local only) | Expanded schemas, last connection, sidebar |
| Schema cache | Yes | No (local only) | Cache introspection results, invalidate on reconnect |

## What Stays Server-Only

| Data | Reason |
|------|--------|
| Connections (encrypted credentials) | Security: AES-256-GCM credentials must never touch IndexedDB |
| Query execution | Requires direct TCP to user databases |
| Schema introspection | Requires direct TCP to user databases |
| Usage tracking / billing | Server authoritative for plan enforcement |
| Health monitoring | Real-time server-side queries |
| Dashboards | No UI yet, skip for now |

## Dexie Schema

```typescript
const db = new Dexie(`data-peek-${userId}`)

db.version(1).stores({
  savedQueries: 'id, connectionId, name, updatedAt, _syncStatus',
  queryHistory: 'id, connectionId, status, executedAt, _syncStatus',
  queryTabs: 'id, updatedAt',
  uiState: 'key',
  schemaCache: 'connectionId, cachedAt',
})
```

Database is scoped per Clerk userId to prevent cross-user contamination on shared browsers.

### Sync status field

Every synced record carries `_syncStatus: 'synced' | 'pending' | 'deleted'`.

- `pending`: created or updated locally, not yet pushed to server
- `deleted`: marked for deletion locally, not yet deleted on server
- `synced`: in sync with server

## Sync Strategy

### Background SyncManager

A single `SyncManager` class runs as a background service, mounted once in a `<SyncProvider>`.

**Trigger cadence:**
- Every 30 seconds on an interval
- On window focus (`visibilitychange` event)
- Manually callable via `syncNow()`

**Sync cycle:**
1. **Push**: find all Dexie records with `_syncStatus: 'pending'` or `'deleted'`, send to server via existing tRPC mutations, mark `synced` (or remove if deleted)
2. **Pull**: fetch server records with `updatedAt` > `lastSyncAt`, upsert into Dexie with `_syncStatus: 'synced'`

**Conflict resolution:** Last-write-wins based on `updatedAt`. Adequate for user preferences and saved queries where concurrent edits across devices are rare.

### Initial sync (first-time migration)

On first load: detect empty Dexie + existing server data. Pull everything from server into Dexie. One-time operation. Show brief "Syncing your data..." indicator.

### Browser data cleared

If user clears IndexedDB, next app load detects empty Dexie and re-pulls from server. No data loss.

## Hooks Layer

New hooks replace direct tRPC calls in components:

```typescript
useSavedQueries(connectionId?) -> { queries, create, update, delete }
useQueryHistory(connectionId?, status?) -> { history, delete, clearAll }
useQueryTabs() -> { tabs, activeTabId, addTab, removeTab, updateSql, setActive }
useUiState(key) -> { value, set }
```

All read from Dexie via `useLiveQuery`. All writes go to Dexie with `_syncStatus: 'pending'`. Components never call tRPC directly for these data types.

## Component Migration

| Component | Before | After |
|-----------|--------|-------|
| `saved-queries-panel.tsx` | `trpc.savedQueries.list.useQuery()` | `useSavedQueries()` |
| `save-query-dialog.tsx` | `trpc.savedQueries.create.useMutation()` | `useSavedQueries().create` |
| `query-history-panel.tsx` | `trpc.history.list.useQuery()` | `useQueryHistory()` |
| `page.tsx` (execute) | `trpc.queries.execute` + manual history refetch | `trpc.queries.execute` stays, result auto-writes to Dexie history |
| `schema-explorer.tsx` | `trpc.schema.getSchemas` | Same call, cache result in Dexie `schemaCache` |

## Stores to Delete

| Store | Replacement |
|-------|-------------|
| `stores/query-store.ts` | `useQueryTabs()` backed by Dexie `queryTabs` table |
| `stores/schema-store.ts` | `useUiState()` + Dexie `schemaCache` table |

## tRPC Router Changes

Existing routers stay as-is but need minor additions to support sync pull:

- `savedQueries.list` — add optional `updatedSince: Date` filter for incremental pull
- `history.list` — add optional `executedSince: Date` filter for incremental pull
- Add `savedQueries.bulkSync` mutation — accepts array of pending creates/updates/deletes in one round-trip (optimization, can start without this)

These routers become the sync API rather than the primary read path. The following routers are still called directly from UI (not through Dexie):

- `queries.execute` / `queries.cancel` / `queries.explain` / `queries.executeEdit`
- `connections.*`
- `schema.getSchemas`
- `health.*`
- `columnStats.get`
- `usage.current`

## Error Handling

**Sync failures:** Records stay `pending` in Dexie. Next cycle retries. After extended offline, show subtle "changes not synced" indicator.

**Auth expiry:** SyncManager pauses on `UNAUTHORIZED` from tRPC. Resumes after Clerk re-auth.

**Quota enforcement:** Server rejects creates that exceed plan limits during sync push. Dexie record marked `_syncStatus: 'error'`, surfaced to user with option to upgrade or delete.

**Query history recording:** On query execution response (success or error), component writes history entry to Dexie immediately. SyncManager pushes to server later. History appears in panel instantly.

## New Dependencies

- `dexie` — IndexedDB wrapper
- `dexie-react-hooks` — `useLiveQuery` for reactive reads

## Files to Create

```
src/lib/dexie.ts              — Dexie database definition
src/lib/sync-manager.ts       — SyncManager class
src/components/sync-provider.tsx — React provider that mounts SyncManager
src/hooks/use-saved-queries.ts
src/hooks/use-query-history.ts
src/hooks/use-query-tabs.ts
src/hooks/use-ui-state.ts
```

## Files to Modify

```
src/app/(app)/layout.tsx       — wrap with <SyncProvider>
src/components/saved-queries/saved-queries-panel.tsx
src/components/query/save-query-dialog.tsx
src/components/history/query-history-panel.tsx
src/components/schema-explorer/schema-explorer.tsx
src/app/(app)/page.tsx
```

## Files to Delete

```
src/stores/query-store.ts
src/stores/schema-store.ts
```
