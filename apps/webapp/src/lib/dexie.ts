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
