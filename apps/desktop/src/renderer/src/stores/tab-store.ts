import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { QueryResult } from './query-store'
import type { StatementResult } from '@data-peek/shared'
import { buildSelectQuery } from '@/lib/sql-helpers'
import { useConnectionStore } from './connection-store'

/**
 * Extended QueryResult with multi-statement support
 */
export interface MultiQueryResult {
  /** Array of statement results (for multiple statements) */
  statements: StatementResult[]
  /** Total execution time */
  totalDurationMs: number
  /** Number of statements */
  statementCount: number
}

// Tab type discriminator
export type TabType = 'query' | 'table-preview' | 'erd' | 'table-designer'

// Base tab interface
interface BaseTab {
  id: string
  type: TabType
  title: string
  isPinned: boolean
  connectionId: string | null
  createdAt: number
  order: number
}

// Query tab specific state
export interface QueryTab extends BaseTab {
  type: 'query'
  query: string
  savedQuery: string // Last saved/executed query for dirty detection
  result: QueryResult | null // Legacy single result (for backward compatibility)
  multiResult: MultiQueryResult | null // Multi-statement results
  activeResultIndex: number // Index of currently displayed result set
  error: string | null
  isExecuting: boolean
  executionId: string | null // ID for cancellation support
  currentPage: number
  pageSize: number
}

// Table preview tab
export interface TablePreviewTab extends BaseTab {
  type: 'table-preview'
  schemaName: string
  tableName: string
  query: string
  savedQuery: string
  result: QueryResult | null // Legacy single result
  multiResult: MultiQueryResult | null // Multi-statement results
  activeResultIndex: number // Index of currently displayed result set
  error: string | null
  isExecuting: boolean
  executionId: string | null // ID for cancellation support
  currentPage: number
  pageSize: number
}

// ERD visualization tab
export interface ERDTab extends BaseTab {
  type: 'erd'
}

// Table Designer tab (create/edit table)
export interface TableDesignerTab extends BaseTab {
  type: 'table-designer'
  schemaName: string
  tableName?: string // undefined for new table
  mode: 'create' | 'edit'
}

export type Tab = QueryTab | TablePreviewTab | ERDTab | TableDesignerTab

// Persisted tab data (minimal for storage)
interface PersistedTab {
  id: string
  type: TabType
  title: string
  isPinned: boolean
  connectionId: string | null
  order: number
  query?: string
  schemaName?: string
  tableName?: string
  mode?: 'create' | 'edit'
}

interface TabState {
  // Tab collection
  tabs: Tab[]
  activeTabId: string | null

  // Actions
  createQueryTab: (connectionId: string | null, initialQuery?: string) => string
  createTablePreviewTab: (connectionId: string, schemaName: string, tableName: string) => string
  createForeignKeyTab: (
    connectionId: string,
    schema: string,
    table: string,
    column: string,
    value: unknown
  ) => string
  createERDTab: (connectionId: string) => string
  createTableDesignerTab: (connectionId: string, schemaName: string, tableName?: string) => string
  closeTab: (tabId: string) => void
  closeAllTabs: () => void
  closeOtherTabs: (tabId: string) => void
  closeTabsToRight: (tabId: string) => void

  setActiveTab: (tabId: string) => void
  updateTabQuery: (tabId: string, query: string) => void
  updateTabResult: (tabId: string, result: QueryResult | null, error: string | null) => void
  updateTabMultiResult: (
    tabId: string,
    multiResult: MultiQueryResult | null,
    error: string | null
  ) => void
  setActiveResultIndex: (tabId: string, index: number) => void
  updateTabExecuting: (tabId: string, isExecuting: boolean, executionId?: string | null) => void
  markTabSaved: (tabId: string) => void

  // Pagination per tab
  setTabPage: (tabId: string, page: number) => void
  setTabPageSize: (tabId: string, size: number) => void

  // Pinning
  pinTab: (tabId: string) => void
  unpinTab: (tabId: string) => void

  // Reordering
  reorderTabs: (startIndex: number, endIndex: number) => void

  // Tab title
  renameTab: (tabId: string, title: string) => void

  // Computed helpers
  getTab: (tabId: string) => Tab | undefined
  getActiveTab: () => Tab | undefined
  getPinnedTabs: () => Tab[]
  getUnpinnedTabs: () => Tab[]
  isTabDirty: (tabId: string) => boolean
  getTabPaginatedRows: (tabId: string) => Record<string, unknown>[]
  getTabTotalPages: (tabId: string) => number
  /** Get the currently active result set for a tab (multi-statement support) */
  getActiveStatementResult: (tabId: string) => StatementResult | undefined
  /** Get all statement results for a tab (multi-statement support) */
  getAllStatementResults: (tabId: string) => StatementResult[]
  /** Get paginated rows for the active result set (multi-statement support) */
  getActiveResultPaginatedRows: (tabId: string) => Record<string, unknown>[]
  /** Get total pages for the active result set (multi-statement support) */
  getActiveResultTotalPages: (tabId: string) => number
  findTablePreviewTab: (
    connectionId: string,
    schemaName: string,
    tableName: string
  ) => Tab | undefined
  findERDTab: (connectionId: string) => Tab | undefined
  findTableDesignerTab: (
    connectionId: string,
    schemaName: string,
    tableName?: string
  ) => Tab | undefined
}

export const useTabStore = create<TabState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      createQueryTab: (connectionId, initialQuery = '') => {
        const id = crypto.randomUUID()
        const tabs = get().tabs
        const maxOrder = tabs.length > 0 ? Math.max(...tabs.map((t) => t.order)) : -1

        const newTab: QueryTab = {
          id,
          type: 'query',
          title: 'New Query',
          isPinned: false,
          connectionId,
          createdAt: Date.now(),
          order: maxOrder + 1,
          query: initialQuery,
          savedQuery: initialQuery,
          result: null,
          multiResult: null,
          activeResultIndex: 0,
          error: null,
          isExecuting: false,
          executionId: null,
          currentPage: 1,
          pageSize: 100
        }

        set((state) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: id
        }))

        return id
      },

      createTablePreviewTab: (connectionId, schemaName, tableName) => {
        // Always create a new tab (no deduplication per user preference)
        const id = crypto.randomUUID()
        const tabs = get().tabs
        const maxOrder = tabs.length > 0 ? Math.max(...tabs.map((t) => t.order)) : -1

        // Get connection to determine database type
        const connection = useConnectionStore
          .getState()
          .connections.find((c) => c.id === connectionId)
        const dbType = connection?.dbType

        // Build table reference (handle MSSQL's dbo schema)
        const defaultSchema = dbType === 'mssql' ? 'dbo' : 'public'
        const tableRef = schemaName === defaultSchema ? tableName : `${schemaName}.${tableName}`
        const query = buildSelectQuery(tableRef, dbType, { limit: 100 })

        const newTab: TablePreviewTab = {
          id,
          type: 'table-preview',
          title: tableName,
          isPinned: false,
          connectionId,
          createdAt: Date.now(),
          order: maxOrder + 1,
          schemaName,
          tableName,
          query,
          savedQuery: query,
          result: null,
          multiResult: null,
          activeResultIndex: 0,
          error: null,
          isExecuting: false,
          executionId: null,
          currentPage: 1,
          pageSize: 100
        }

        set((state) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: id
        }))

        return id
      },

      createForeignKeyTab: (connectionId, schema, table, column, value) => {
        const id = crypto.randomUUID()
        const tabs = get().tabs
        const maxOrder = tabs.length > 0 ? Math.max(...tabs.map((t) => t.order)) : -1

        // Get connection to determine database type
        const connection = useConnectionStore
          .getState()
          .connections.find((c) => c.id === connectionId)
        const dbType = connection?.dbType

        // Build table reference (handle MSSQL's dbo schema)
        const defaultSchema = dbType === 'mssql' ? 'dbo' : 'public'
        const tableRef = schema === defaultSchema ? table : `${schema}.${table}`

        // Format value for SQL - handle strings, numbers, nulls
        let formattedValue: string
        if (value === null || value === undefined) {
          formattedValue = 'NULL'
        } else if (typeof value === 'string') {
          // Escape single quotes for SQL safety
          formattedValue = `'${value.replace(/'/g, "''")}'`
        } else {
          formattedValue = String(value)
        }

        // Use bracket quoting for MSSQL, double quotes for others
        const quotedColumn = dbType === 'mssql' ? `[${column}]` : `"${column}"`
        const whereClause = `WHERE ${quotedColumn} = ${formattedValue}`
        const query = buildSelectQuery(tableRef, dbType, { where: whereClause, limit: 100 })

        const newTab: QueryTab = {
          id,
          type: 'query',
          title: `${table} → ${column}`,
          isPinned: false,
          connectionId,
          createdAt: Date.now(),
          order: maxOrder + 1,
          query,
          savedQuery: query,
          result: null,
          multiResult: null,
          activeResultIndex: 0,
          error: null,
          isExecuting: false,
          executionId: null,
          currentPage: 1,
          pageSize: 100
        }

        set((state) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: id
        }))

        return id
      },

      createERDTab: (connectionId) => {
        // Check if ERD tab already exists for this connection
        const existingTab = get().tabs.find(
          (t) => t.type === 'erd' && t.connectionId === connectionId
        )
        if (existingTab) {
          set({ activeTabId: existingTab.id })
          return existingTab.id
        }

        const id = crypto.randomUUID()
        const tabs = get().tabs
        const maxOrder = tabs.length > 0 ? Math.max(...tabs.map((t) => t.order)) : -1

        const newTab: ERDTab = {
          id,
          type: 'erd',
          title: 'ERD Diagram',
          isPinned: false,
          connectionId,
          createdAt: Date.now(),
          order: maxOrder + 1
        }

        set((state) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: id
        }))

        return id
      },

      createTableDesignerTab: (connectionId, schemaName, tableName) => {
        // For edit mode, check if tab already exists
        if (tableName) {
          const existingTab = get().tabs.find(
            (t) =>
              t.type === 'table-designer' &&
              t.connectionId === connectionId &&
              (t as TableDesignerTab).schemaName === schemaName &&
              (t as TableDesignerTab).tableName === tableName
          )
          if (existingTab) {
            set({ activeTabId: existingTab.id })
            return existingTab.id
          }
        }

        const id = crypto.randomUUID()
        const tabs = get().tabs
        const maxOrder = tabs.length > 0 ? Math.max(...tabs.map((t) => t.order)) : -1
        const mode = tableName ? 'edit' : 'create'
        const title = tableName ? `Edit: ${tableName}` : 'New Table'

        const newTab: TableDesignerTab = {
          id,
          type: 'table-designer',
          title,
          isPinned: false,
          connectionId,
          createdAt: Date.now(),
          order: maxOrder + 1,
          schemaName,
          tableName,
          mode
        }

        set((state) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: id
        }))

        return id
      },

      closeTab: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab || tab.isPinned) return

        set((state) => {
          const newTabs = state.tabs.filter((t) => t.id !== tabId)
          let newActiveId = state.activeTabId

          if (state.activeTabId === tabId) {
            // Select adjacent tab
            const closedIndex = state.tabs.findIndex((t) => t.id === tabId)
            newActiveId = newTabs[closedIndex]?.id ?? newTabs[closedIndex - 1]?.id ?? null
          }

          return { tabs: newTabs, activeTabId: newActiveId }
        })
      },

      closeAllTabs: () => {
        set((state) => {
          // Keep pinned tabs
          const pinnedTabs = state.tabs.filter((t) => t.isPinned)
          return {
            tabs: pinnedTabs,
            activeTabId: pinnedTabs[0]?.id ?? null
          }
        })
      },

      closeOtherTabs: (tabId) => {
        set((state) => {
          // Keep the specified tab and all pinned tabs
          const keptTabs = state.tabs.filter((t) => t.id === tabId || t.isPinned)
          return {
            tabs: keptTabs,
            activeTabId: tabId
          }
        })
      },

      closeTabsToRight: (tabId) => {
        set((state) => {
          const tabIndex = state.tabs.findIndex((t) => t.id === tabId)
          if (tabIndex === -1) return state

          const keptTabs = state.tabs.filter((t, i) => i <= tabIndex || t.isPinned)
          return {
            tabs: keptTabs,
            activeTabId: state.activeTabId
          }
        })
      },

      setActiveTab: (tabId) => {
        set({ activeTabId: tabId })
      },

      updateTabQuery: (tabId, query) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, query } : t))
        }))
      },

      updateTabResult: (tabId, result, error) => {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId ? { ...t, result, error, currentPage: 1 } : t
          )
        }))
      },

      updateTabMultiResult: (tabId, multiResult, error) => {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  multiResult,
                  error,
                  currentPage: 1,
                  activeResultIndex: 0,
                  // Also update legacy result field for backward compatibility
                  result: multiResult?.statements?.[0]
                    ? {
                        columns: multiResult.statements[0].fields.map((f) => ({
                          name: f.name,
                          dataType: f.dataType
                        })),
                        rows: multiResult.statements[0].rows,
                        rowCount: multiResult.statements[0].rowCount,
                        durationMs: multiResult.totalDurationMs
                      }
                    : null
                }
              : t
          )
        }))
      },

      setActiveResultIndex: (tabId, index) => {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  activeResultIndex: index,
                  currentPage: 1 // Reset pagination when switching result sets
                }
              : t
          )
        }))
      },

      updateTabExecuting: (tabId, isExecuting, executionId?: string | null) => {
        set((state) => ({
          tabs: state.tabs.map((t) => {
            if (t.id !== tabId) return t
            // ERD and TableDesigner tabs don't have executionId
            if (t.type === 'erd' || t.type === 'table-designer') return t
            // Only update executionId if provided, otherwise clear it when not executing
            const currentExecutionId = t.executionId
            const newExecutionId =
              executionId !== undefined ? executionId : isExecuting ? currentExecutionId : null
            return { ...t, isExecuting, executionId: newExecutionId }
          })
        }))
      },

      markTabSaved: (tabId) => {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId && t.type !== 'erd' && t.type !== 'table-designer'
              ? { ...t, savedQuery: t.query }
              : t
          )
        }))
      },

      setTabPage: (tabId, page) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, currentPage: page } : t))
        }))
      },

      setTabPageSize: (tabId, size) => {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId ? { ...t, pageSize: size, currentPage: 1 } : t
          )
        }))
      },

      pinTab: (tabId) => {
        set((state) => {
          const updatedTabs = state.tabs.map((t) => (t.id === tabId ? { ...t, isPinned: true } : t))
          // Sort: pinned tabs first, then by order
          return {
            tabs: updatedTabs.sort((a, b) => {
              if (a.isPinned && !b.isPinned) return -1
              if (!a.isPinned && b.isPinned) return 1
              return a.order - b.order
            })
          }
        })
      },

      unpinTab: (tabId) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, isPinned: false } : t))
        }))
      },

      reorderTabs: (startIndex, endIndex) => {
        set((state) => {
          const tabs = [...state.tabs]
          const [removed] = tabs.splice(startIndex, 1)
          tabs.splice(endIndex, 0, removed)

          // Update order values
          return {
            tabs: tabs.map((t, i) => ({ ...t, order: i }))
          }
        })
      },

      renameTab: (tabId, title) => {
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, title } : t))
        }))
      },

      getTab: (tabId) => {
        return get().tabs.find((t) => t.id === tabId)
      },

      getActiveTab: () => {
        const { tabs, activeTabId } = get()
        return tabs.find((t) => t.id === activeTabId)
      },

      getPinnedTabs: () => {
        return get().tabs.filter((t) => t.isPinned)
      },

      getUnpinnedTabs: () => {
        return get().tabs.filter((t) => !t.isPinned)
      },

      isTabDirty: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab) return false
        // ERD and table-designer tabs are never dirty (table-designer uses its own store)
        if (tab.type === 'erd' || tab.type === 'table-designer') return false
        return tab.query !== tab.savedQuery
      },

      getTabPaginatedRows: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab || tab.type === 'erd' || tab.type === 'table-designer') return []
        if (!tab.result) return []
        const start = (tab.currentPage - 1) * tab.pageSize
        return tab.result.rows.slice(start, start + tab.pageSize)
      },

      getTabTotalPages: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab || tab.type === 'erd' || tab.type === 'table-designer') return 0
        if (!tab.result) return 0
        return Math.ceil(tab.result.rowCount / tab.pageSize)
      },

      getActiveStatementResult: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab || tab.type === 'erd' || tab.type === 'table-designer') return undefined
        if (!tab.multiResult?.statements) return undefined
        return tab.multiResult.statements[tab.activeResultIndex]
      },

      getAllStatementResults: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab || tab.type === 'erd' || tab.type === 'table-designer') return []
        return tab.multiResult?.statements ?? []
      },

      getActiveResultPaginatedRows: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab || tab.type === 'erd' || tab.type === 'table-designer') return []
        const statement = tab.multiResult?.statements?.[tab.activeResultIndex]
        if (!statement) return []
        const start = (tab.currentPage - 1) * tab.pageSize
        return statement.rows.slice(start, start + tab.pageSize)
      },

      getActiveResultTotalPages: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab || tab.type === 'erd' || tab.type === 'table-designer') return 0
        const statement = tab.multiResult?.statements?.[tab.activeResultIndex]
        if (!statement) return 0
        return Math.ceil(statement.rowCount / tab.pageSize)
      },

      findTablePreviewTab: (connectionId, schemaName, tableName) => {
        return get().tabs.find(
          (t) =>
            t.type === 'table-preview' &&
            t.connectionId === connectionId &&
            (t as TablePreviewTab).schemaName === schemaName &&
            (t as TablePreviewTab).tableName === tableName
        )
      },

      findERDTab: (connectionId) => {
        return get().tabs.find((t) => t.type === 'erd' && t.connectionId === connectionId)
      },

      findTableDesignerTab: (connectionId, schemaName, tableName) => {
        return get().tabs.find(
          (t) =>
            t.type === 'table-designer' &&
            t.connectionId === connectionId &&
            (t as TableDesignerTab).schemaName === schemaName &&
            (tableName
              ? (t as TableDesignerTab).tableName === tableName
              : !(t as TableDesignerTab).tableName)
        )
      }
    }),
    {
      name: 'data-peek-tabs',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist pinned tabs
        tabs: state.tabs
          .filter((t) => t.isPinned)
          .map((t): PersistedTab => {
            const base: PersistedTab = {
              id: t.id,
              type: t.type,
              title: t.title,
              isPinned: t.isPinned,
              connectionId: t.connectionId,
              order: t.order
            }

            if (t.type === 'erd') {
              return base
            }

            if (t.type === 'table-designer') {
              return {
                ...base,
                schemaName: t.schemaName,
                tableName: t.tableName,
                mode: t.mode
              }
            }

            // query or table-preview tabs
            return {
              ...base,
              query: t.query,
              schemaName: t.type === 'table-preview' ? t.schemaName : undefined,
              tableName: t.type === 'table-preview' ? t.tableName : undefined
            }
          }),
        activeTabId: state.activeTabId
      }),
      onRehydrateStorage: () => (state) => {
        // Restore pinned tabs with full state on app load
        if (state) {
          state.tabs = state.tabs.map((t) => {
            // ERD tabs just need basic properties
            if (t.type === 'erd') {
              return {
                ...t,
                type: 'erd' as const,
                createdAt: Date.now()
              }
            }

            // Table designer tabs
            if (t.type === 'table-designer') {
              const persisted = t as unknown as PersistedTab
              return {
                ...t,
                type: 'table-designer' as const,
                createdAt: Date.now(),
                schemaName: persisted.schemaName ?? 'public',
                tableName: persisted.tableName,
                mode: persisted.mode ?? 'create'
              } as TableDesignerTab
            }

            const base = {
              ...t,
              result: null,
              multiResult: null,
              activeResultIndex: 0,
              error: null,
              isExecuting: false,
              executionId: null,
              savedQuery: (t as unknown as { query?: string }).query ?? '',
              createdAt: Date.now(),
              currentPage: 1,
              pageSize: 100
            }

            if (t.type === 'table-preview') {
              return {
                ...base,
                type: 'table-preview' as const,
                schemaName: (t as unknown as TablePreviewTab).schemaName ?? '',
                tableName: (t as unknown as TablePreviewTab).tableName ?? ''
              }
            }

            return {
              ...base,
              type: 'query' as const
            }
          }) as Tab[]
        }
      }
    }
  )
)
