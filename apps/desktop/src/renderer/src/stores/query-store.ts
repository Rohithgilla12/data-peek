import { buildQualifiedTableRef, buildSelectQuery } from '@/lib/sql-helpers'
import { resolvePostgresType, type QueryResult as IpcQueryResult } from '@data-peek/shared'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
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

interface QueryState {
  // Editor state
  currentQuery: string
  isExecuting: boolean

  // Results
  result: QueryResult | null
  error: string | null

  // History
  history: QueryHistoryItem[]

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

  addToHistory: (item: Omit<QueryHistoryItem, 'id' | 'timestamp'>) => void
  clearHistory: () => void
  removeFromHistory: (id: string) => void

  setCurrentPage: (page: number) => void
  setPageSize: (size: number) => void

  // Computed
  getTotalPages: () => number
  getPaginatedRows: () => Record<string, unknown>[]
}

export const useQueryStore = create<QueryState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentQuery: '',
      isExecuting: false,
      result: null,
      error: null,
      history: [],
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

            const history = get().history
            const newHistoryItem: QueryHistoryItem = {
              id: crypto.randomUUID(),
              query,
              timestamp: new Date(),
              durationMs: data.durationMs,
              rowCount: result.rowCount,
              status: 'success',
              connectionId: connection.id
            }

            set({
              isExecuting: false,
              result,
              error: null,
              history: [newHistoryItem, ...history].slice(0, 100)
            })
          } else {
            const errorMessage = response.error ?? 'Query execution failed'
            const history = get().history
            const newHistoryItem: QueryHistoryItem = {
              id: crypto.randomUUID(),
              query,
              timestamp: new Date(),
              durationMs: 0,
              rowCount: 0,
              status: 'error',
              connectionId: connection.id,
              errorMessage
            }

            set({
              isExecuting: false,
              result: null,
              error: errorMessage,
              history: [newHistoryItem, ...history].slice(0, 100)
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

      addToHistory: (item) =>
        set((state) => ({
          history: [
            {
              ...item,
              id: crypto.randomUUID(),
              timestamp: new Date()
            },
            ...state.history
          ].slice(0, 100)
        })),

      clearHistory: () => set({ history: [] }),

      removeFromHistory: (id) =>
        set((state) => ({
          history: state.history.filter((h) => h.id !== id)
        })),

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
    }),
    {
      name: 'data-peek-query-store',
      storage: createJSONStorage(() => localStorage),
      // Only persist history - results/currentQuery are ephemeral per session.
      partialize: (state) => ({ history: state.history }),
      // Timestamps serialize as ISO strings; rehydrate them back to Date objects.
      merge: (persisted, current) => {
        const p = persisted as { history?: QueryHistoryItem[] } | undefined
        const history = (p?.history ?? []).map((h) => ({
          ...h,
          timestamp: new Date(h.timestamp)
        }))
        return { ...current, history }
      }
    }
  )
)
