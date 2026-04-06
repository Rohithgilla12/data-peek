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

    const pending = await db.savedQueries.where('_syncStatus').equals('pending').toArray()

    const deleted = await db.savedQueries.where('_syncStatus').equals('deleted').toArray()

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

    const pending = await db.queryHistory.where('_syncStatus').equals('pending').toArray()

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
