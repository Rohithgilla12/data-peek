import { buildQualifiedTableRef, buildSelectQuery } from '@/lib/sql-helpers'
import {
  capQueryHistoryPerConnection,
  resolvePostgresType,
  type QueryHistoryEntry,
  type QueryResult as IpcQueryResult
} from '@data-peek/shared'
import { create } from 'zustand'
import type { Connection, Table } from './connection-store'

export interface QueryHistoryItem {
  id: string
  query: string
  timestamp: Date
  durationMs: number
  rowCount: number
  status: 'success' | 'error'
  connectionId: string
  errorMessage?: string
}

export interface QueryResult {
  columns: { name: string; dataType: string }[]
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
  tableName?: string
}

// History is persisted in the main process (electron-store) so it survives app
// restarts — localStorage in the renderer is evicted by Chromium between launches.
// The persisted form uses numeric timestamps; convert at this boundary.
function toEntry(item: QueryHistoryItem): QueryHistoryEntry {
  return { ...item, timestamp: item.timestamp.getTime() }
}

function fromEntry(entry: QueryHistoryEntry): QueryHistoryItem {
  return { ...entry, timestamp: new Date(entry.timestamp) }
}

interface QueryState {
  // Editor state
  currentQuery: string
  isExecuting: boolean

  // Results
  result: QueryResult | null
  error: string | null

  // History
  history: QueryHistoryItem[]
  isHistoryLoaded: boolean

  // Pagination
  currentPage: number
  pageSize: number

  // Actions
  setCurrentQuery: (query: string) => void
  setIsExecuting: (executing: boolean) => void
  setResult: (result: QueryResult | null) => void
  setError: (error: string | null) => void

  // Load table data (for clicking on tables)
  loadTableData: (schemaName: string, table: Table, connection: Connection) => void

  // Execute a query against the database
  executeQuery: (connection: Connection, query?: string) => Promise<void>

  // Load persisted history from the main process (once)
  loadHistory: () => Promise<void>

  addToHistory: (item: Omit<QueryHistoryItem, 'id' | 'timestamp'>) => void
  clearHistory: () => void
  removeFromHistory: (id: string) => void

  setCurrentPage: (page: number) => void
  setPageSize: (size: number) => void

  // Computed
  getTotalPages: () => number
  getPaginatedRows: () => Record<string, unknown>[]
}

export const useQueryStore = create<QueryState>()((set, get) => ({
  // Initial state
  currentQuery: '',
  isExecuting: false,
  result: null,
  error: null,
  history: [],
  isHistoryLoaded: false,
  currentPage: 1,
  pageSize: 100,

  // Actions
  setCurrentQuery: (query) => set({ currentQuery: query }),
  setIsExecuting: (executing) => set({ isExecuting: executing }),
  setResult: (result) => set({ result, error: null, currentPage: 1 }),
  setError: (error) => set({ error, result: null }),

  loadTableData: (schemaName, table, connection) => {
    const sqlTableRef = buildQualifiedTableRef(schemaName, table.name, connection.dbType)
    const query = buildSelectQuery(sqlTableRef, connection.dbType, { limit: 100 })

    set({ currentQuery: query })

    // Execute the query
    get().executeQuery(connection, query)
  },

  executeQuery: async (connection, queryOverride) => {
    const query = queryOverride ?? get().currentQuery
    if (!query.trim()) return

    set({ isExecuting: true, error: null })

    try {
      const response = await window.api.db.query(connection, query)

      if (response.success && response.data) {
        const data = response.data as IpcQueryResult
        const result: QueryResult = {
          columns: data.fields.map((f) => ({
            name: f.name,
            dataType: resolvePostgresType(f.dataTypeID as number)
          })),
          rows: data.rows,
          rowCount: data.rowCount ?? data.rows.length,
          durationMs: data.durationMs
        }

        set({ isExecuting: false, result, error: null })
        get().addToHistory({
          query,
          durationMs: data.durationMs,
          rowCount: result.rowCount,
          status: 'success',
          connectionId: connection.id
        })
      } else {
        const errorMessage = response.error ?? 'Query execution failed'

        set({ isExecuting: false, result: null, error: errorMessage })
        get().addToHistory({
          query,
          durationMs: 0,
          rowCount: 0,
          status: 'error',
          connectionId: connection.id,
          errorMessage
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      set({
        isExecuting: false,
        result: null,
        error: errorMessage
      })
    }
  },

  loadHistory: async () => {
    if (get().isHistoryLoaded) return

    try {
      const response = await window.api.queryHistory.list()
      if (response.success && response.data) {
        set({ history: response.data.map(fromEntry), isHistoryLoaded: true })
      } else {
        // Mark as loaded anyway so a failed read doesn't block in-session history.
        set({ isHistoryLoaded: true })
      }
    } catch (error) {
      console.error('Failed to load query history:', error)
      set({ isHistoryLoaded: true })
    }
  },

  addToHistory: (item) => {
    const newItem: QueryHistoryItem = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: new Date()
    }

    set((state) => ({
      history: capQueryHistoryPerConnection([newItem, ...state.history])
    }))

    // Persist asynchronously; the in-memory state is the source of truth for the UI.
    window.api.queryHistory.add(toEntry(newItem)).catch((error) => {
      console.error('Failed to persist query history entry:', error)
    })
  },

  clearHistory: () => {
    set({ history: [] })
    window.api.queryHistory.clear().catch((error) => {
      console.error('Failed to clear query history:', error)
    })
  },

  removeFromHistory: (id) => {
    set((state) => ({
      history: state.history.filter((h) => h.id !== id)
    }))
    window.api.queryHistory.remove(id).catch((error) => {
      console.error('Failed to remove query history entry:', error)
    })
  },

  setCurrentPage: (page) => set({ currentPage: page }),
  setPageSize: (size) => set({ pageSize: size, currentPage: 1 }),

  getTotalPages: () => {
    const state = get()
    if (!state.result) return 0
    return Math.ceil(state.result.rowCount / state.pageSize)
  },

  getPaginatedRows: () => {
    const state = get()
    if (!state.result) return []
    const start = (state.currentPage - 1) * state.pageSize
    return state.result.rows.slice(start, start + state.pageSize)
  }
}))
