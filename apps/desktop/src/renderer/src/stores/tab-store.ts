import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { QueryResult } from './query-store'
import type { StatementResult } from '@data-peek/shared'
import {
  buildQualifiedTableRef,
  buildFullyQualifiedTableRef,
  buildSelectQuery,
  quoteIdentifier
} from '@/lib/sql-helpers'
import { useConnectionStore } from './connection-store'
import { useSettingsStore } from './settings-store'
import { useEditStore } from './edit-store'

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
export type TabType =
  | 'query'
  | 'table-preview'
  | 'erd'
  | 'table-designer'
  | 'data-generator'
  | 'pg-notifications'
  | 'health-monitor'
  | 'schema-intel'
  | 'notebook'

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
  // Server-side pagination fields
  totalRowCount: number | null // Total rows in table (for pagination)
  tableRef: string // Table reference for building queries (e.g., "schema.table")
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

// Data Generator tab
export interface DataGeneratorTab extends BaseTab {
  type: 'data-generator'
  schemaName: string
  tableName?: string
}

// PostgreSQL Notifications tab
export interface PgNotificationsTab extends BaseTab {
  type: 'pg-notifications'
}

// Health Monitor tab
export interface HealthMonitorTab extends BaseTab {
  type: 'health-monitor'
}

// Schema Intel / diagnostics tab
export interface SchemaIntelTab extends BaseTab {
  type: 'schema-intel'
}

// Notebook tab
export interface NotebookTab extends BaseTab {
  type: 'notebook'
  notebookId: string
}

export type Tab =
  | QueryTab
  | TablePreviewTab
  | ERDTab
  | TableDesignerTab
  | DataGeneratorTab
  | PgNotificationsTab
  | HealthMonitorTab
  | SchemaIntelTab
  | NotebookTab

export type ExecutableTab = QueryTab | TablePreviewTab

export function isExecutableTab(tab: Tab): tab is ExecutableTab {
  return tab.type === 'query' || tab.type === 'table-preview'
}

function mapTab(tabs: Tab[], id: string, updater: (t: Tab) => Tab): Tab[] {
  const idx = tabs.findIndex((t) => t.id === id)
  if (idx === -1) return tabs
  const updated = updater(tabs[idx])
  if (updated === tabs[idx]) return tabs
  const next = tabs.slice()
  next[idx] = updated
  return next
}

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
  notebookId?: string
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
  createDataGeneratorTab: (connectionId: string, schemaName: string, tableName?: string) => string
  createPgNotificationsTab: (connectionId: string) => string
  createHealthMonitorTab: (connectionId: string) => string
  createSchemaIntelTab: (connectionId: string) => string
  createNotebookTab: (connectionId: string, notebookId: string, title: string) => string
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

  // Server-side pagination for table previews
  setTablePreviewTotalCount: (tabId: string, count: number) => void
  updateTablePreviewPagination: (tabId: string, page: number, pageSize: number) => void

  // Pinning
  pinTab: (tabId: string) => void
  unpinTab: (tabId: string) => void

  // Reordering
  reorderTabs: (startIndex: number, endIndex: number) => void

  // Tab title
  renameTab: (tabId: string, title: string) => void

  // Connection sync
  syncActiveTabWithConnection: (connectionId: string | null) => void

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
  findDataGeneratorTab: (
    connectionId: string,
    schemaName: string,
    tableName?: string
  ) => Tab | undefined
  findPgNotificationsTab: (connectionId: string) => Tab | undefined
  findHealthMonitorTab: (connectionId: string) => Tab | undefined
  findSchemaIntelTab: (connectionId: string) => Tab | undefined
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

        // Get default page size from settings
        const pageSize = useSettingsStore.getState().defaultPageSize

        const tableRef = buildFullyQualifiedTableRef(schemaName, tableName, dbType)
        const sqlTableRef = buildQualifiedTableRef(schemaName, tableName, dbType)
        const query = buildSelectQuery(sqlTableRef, dbType, { limit: pageSize })

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
          pageSize,
          totalRowCount: null,
          tableRef
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

        const sqlTableRef = buildQualifiedTableRef(schema, table, dbType)

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

        const quotedColumn = quoteIdentifier(column, dbType)
        const whereClause = `WHERE ${quotedColumn} = ${formattedValue}`
        const query = buildSelectQuery(sqlTableRef, dbType, { where: whereClause, limit: 100 })

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

      createDataGeneratorTab: (connectionId, schemaName, tableName) => {
        const id = crypto.randomUUID()
        const tabs = get().tabs
        const maxOrder = tabs.length > 0 ? Math.max(...tabs.map((t) => t.order)) : -1
        const title = tableName ? `Generate: ${tableName}` : 'Data Generator'

        const newTab: DataGeneratorTab = {
          id,
          type: 'data-generator',
          title,
          isPinned: false,
          connectionId,
          createdAt: Date.now(),
          order: maxOrder + 1,
          schemaName,
          tableName
        }

        set((state) => ({
          tabs: [...state.tabs, newTab],
          activeTabId: id
        }))

        return id
      },

      createPgNotificationsTab: (connectionId) => {
        const existing = get().tabs.find(
          (t) => t.type === 'pg-notifications' && t.connectionId === connectionId
        )
        if (existing) {
          set({ activeTabId: existing.id })
          return existing.id
        }

        const id = crypto.randomUUID()
        const tabs = get().tabs
        const maxOrder = tabs.length > 0 ? Math.max(...tabs.map((t) => t.order)) : -1

        const newTab: PgNotificationsTab = {
          id,
          type: 'pg-notifications',
          title: 'Notifications',
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

      createHealthMonitorTab: (connectionId) => {
        const existing = get().tabs.find(
          (t) => t.type === 'health-monitor' && t.connectionId === connectionId
        )
        if (existing) {
          set({ activeTabId: existing.id })
          return existing.id
        }

        const id = crypto.randomUUID()
        const tabs = get().tabs
        const maxOrder = tabs.length > 0 ? Math.max(...tabs.map((t) => t.order)) : -1

        const newTab: HealthMonitorTab = {
          id,
          type: 'health-monitor',
          title: 'Health Monitor',
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

      createSchemaIntelTab: (connectionId) => {
        const existing = get().tabs.find(
          (t) => t.type === 'schema-intel' && t.connectionId === connectionId
        )
        if (existing) {
          set({ activeTabId: existing.id })
          return existing.id
        }

        const id = crypto.randomUUID()
        const tabs = get().tabs
        const maxOrder = tabs.length > 0 ? Math.max(...tabs.map((t) => t.order)) : -1

        const newTab: SchemaIntelTab = {
          id,
          type: 'schema-intel',
          title: 'Schema Intel',
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

      createNotebookTab: (connectionId, notebookId, title) => {
        const existingTab = get().tabs.find(
          (t) => t.type === 'notebook' && (t as NotebookTab).notebookId === notebookId
        )
        if (existingTab) {
          set({ activeTabId: existingTab.id })
          return existingTab.id
        }

        const id = crypto.randomUUID()
        const tab: NotebookTab = {
          id,
          type: 'notebook',
          title,
          isPinned: false,
          connectionId,
          createdAt: Date.now(),
          order: get().tabs.length,
          notebookId
        }
        set((state) => ({
          tabs: [...state.tabs, tab],
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
        // Pending inline edits are captured against the *previous* result rows. Once the
        // result changes, those snapshots no longer correspond to anything onscreen and
        // committing them would target rows the user never saw — drop them defensively.
        useEditStore.getState().clearPendingChanges(tabId)
        set((state) => ({
          tabs: state.tabs.map((t) => {
            if (t.id !== tabId) return t
            // For table-preview with server-side pagination, preserve currentPage
            const preservePage = t.type === 'table-preview' && t.totalRowCount != null
            return { ...t, result, error, currentPage: preservePage ? t.currentPage : 1 }
          })
        }))
      },

      updateTabMultiResult: (tabId, multiResult, error) => {
        useEditStore.getState().clearPendingChanges(tabId)
        set((state) => ({
          tabs: state.tabs.map((t) => {
            if (t.id !== tabId) return t
            // For table-preview with server-side pagination, preserve currentPage
            const preservePage = t.type === 'table-preview' && t.totalRowCount != null
            return {
              ...t,
              multiResult,
              error,
              currentPage: preservePage ? t.currentPage : 1,
              activeResultIndex: preservePage ? t.activeResultIndex : 0,
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
          })
        }))
      },

      setActiveResultIndex: (tabId, index) => {
        // Pending edits are captured against the previously active statement; switching to
        // a different statement (potentially a different table) would otherwise let those
        // edits commit with the wrong context.
        useEditStore.getState().clearPendingChanges(tabId)
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
        set((state) => {
          const tabs = mapTab(state.tabs, tabId, (t) => {
            if (!isExecutableTab(t)) return t
            const newExecutionId =
              executionId !== undefined ? executionId : isExecuting ? t.executionId : null
            if (t.isExecuting === isExecuting && t.executionId === newExecutionId) return t
            return { ...t, isExecuting, executionId: newExecutionId }
          })
          return tabs === state.tabs ? {} : { tabs }
        })
      },

      markTabSaved: (tabId) => {
        set((state) => {
          const tabs = mapTab(state.tabs, tabId, (t) => {
            if (!isExecutableTab(t)) return t
            if (t.savedQuery === t.query) return t
            return { ...t, savedQuery: t.query }
          })
          return tabs === state.tabs ? {} : { tabs }
        })
      },

      setTabPage: (tabId, page) => {
        set((state) => {
          const tabs = mapTab(state.tabs, tabId, (t) => {
            if (!isExecutableTab(t) || t.currentPage === page) return t
            return { ...t, currentPage: page }
          })
          return tabs === state.tabs ? {} : { tabs }
        })
      },

      setTabPageSize: (tabId, size) => {
        set((state) => {
          const tabs = mapTab(state.tabs, tabId, (t) => {
            if (!isExecutableTab(t) || (t.pageSize === size && t.currentPage === 1)) return t
            return { ...t, pageSize: size, currentPage: 1 }
          })
          return tabs === state.tabs ? {} : { tabs }
        })
      },

      setTablePreviewTotalCount: (tabId, count) => {
        set((state) => {
          const tabs = mapTab(state.tabs, tabId, (t) => {
            if (t.type !== 'table-preview' || t.totalRowCount === count) return t
            return { ...t, totalRowCount: count }
          })
          return tabs === state.tabs ? {} : { tabs }
        })
      },

      updateTablePreviewPagination: (tabId, page, pageSize) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab || tab.type !== 'table-preview') return

        // Get connection to determine database type
        const connection = useConnectionStore
          .getState()
          .connections.find((c) => c.id === tab.connectionId)
        const dbType = connection?.dbType

        // Build new query with updated pagination
        const offset = (page - 1) * pageSize
        const sqlTableRef = buildQualifiedTableRef(tab.schemaName, tab.tableName, dbType)
        const query = buildSelectQuery(sqlTableRef, dbType, { limit: pageSize, offset })

        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId && t.type === 'table-preview'
              ? { ...t, currentPage: page, pageSize, query, savedQuery: query }
              : t
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

      syncActiveTabWithConnection: (connectionId) => {
        const activeTab = get().getActiveTab()
        if (!activeTab) return

        // Only sync query tabs (not table-preview, erd, or table-designer)
        // Table previews are tied to specific tables in specific databases
        // ERD and table designer are also database-specific
        if (activeTab.type !== 'query') return

        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === activeTab.id ? { ...t, connectionId } : t))
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
        if (!tab || !isExecutableTab(tab)) return false
        return tab.query !== tab.savedQuery
      },

      getTabPaginatedRows: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab || !isExecutableTab(tab) || !tab.result) return []
        const start = (tab.currentPage - 1) * tab.pageSize
        return tab.result.rows.slice(start, start + tab.pageSize)
      },

      getTabTotalPages: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab || !isExecutableTab(tab) || !tab.result) return 0
        return Math.ceil(tab.result.rowCount / tab.pageSize)
      },

      getActiveStatementResult: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab || !isExecutableTab(tab) || !tab.multiResult?.statements) return undefined
        return tab.multiResult.statements[tab.activeResultIndex]
      },

      getAllStatementResults: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab || !isExecutableTab(tab)) return []
        return tab.multiResult?.statements ?? []
      },

      getActiveResultPaginatedRows: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab || !isExecutableTab(tab)) return []
        const statement = tab.multiResult?.statements?.[tab.activeResultIndex]
        if (!statement) return []
        const start = (tab.currentPage - 1) * tab.pageSize
        return statement.rows.slice(start, start + tab.pageSize)
      },

      getActiveResultTotalPages: (tabId) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab || !isExecutableTab(tab)) return 0
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
      },

      findDataGeneratorTab: (connectionId, schemaName, tableName) => {
        return get().tabs.find(
          (t) =>
            t.type === 'data-generator' &&
            t.connectionId === connectionId &&
            (t as DataGeneratorTab).schemaName === schemaName &&
            (tableName
              ? (t as DataGeneratorTab).tableName === tableName
              : !(t as DataGeneratorTab).tableName)
        )
      },

      findPgNotificationsTab: (connectionId) => {
        return get().tabs.find(
          (t) => t.type === 'pg-notifications' && t.connectionId === connectionId
        )
      },

      findHealthMonitorTab: (connectionId) => {
        return get().tabs.find(
          (t) => t.type === 'health-monitor' && t.connectionId === connectionId
        )
      },

      findSchemaIntelTab: (connectionId) => {
        return get().tabs.find(
          (t) => t.type === 'schema-intel' && t.connectionId === connectionId
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

            if (t.type === 'data-generator') {
              return {
                ...base,
                schemaName: t.schemaName,
                tableName: t.tableName
              }
            }

            if (t.type === 'pg-notifications') {
              return base
            }

            if (t.type === 'health-monitor') {
              return base
            }

            if (t.type === 'schema-intel') {
              return base
            }

            if (t.type === 'notebook') {
              return {
                ...base,
                notebookId: t.notebookId
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

            // Data generator tabs
            if (t.type === 'data-generator') {
              const persisted = t as unknown as PersistedTab
              return {
                ...t,
                type: 'data-generator' as const,
                createdAt: Date.now(),
                schemaName: persisted.schemaName ?? 'public',
                tableName: persisted.tableName
              } as DataGeneratorTab
            }

            // PG Notifications tabs
            if (t.type === 'pg-notifications') {
              return {
                ...t,
                type: 'pg-notifications' as const,
                createdAt: Date.now()
              } as PgNotificationsTab
            }

            // Health Monitor tabs
            if (t.type === 'health-monitor') {
              return {
                ...t,
                type: 'health-monitor' as const,
                createdAt: Date.now()
              } as HealthMonitorTab
            }

            // Schema Intel tabs
            if (t.type === 'schema-intel') {
              return {
                ...t,
                type: 'schema-intel' as const,
                createdAt: Date.now()
              } as SchemaIntelTab
            }

            // Notebook tabs
            if (t.type === 'notebook') {
              const persisted = t as unknown as PersistedTab
              return {
                ...t,
                type: 'notebook' as const,
                createdAt: Date.now(),
                notebookId: persisted.notebookId || ''
              } as NotebookTab
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
              const schemaName = (t as unknown as TablePreviewTab).schemaName ?? ''
              const tableName = (t as unknown as TablePreviewTab).tableName ?? ''
              const tableRef = buildFullyQualifiedTableRef(schemaName, tableName, undefined)
              return {
                ...base,
                type: 'table-preview' as const,
                schemaName,
                tableName,
                totalRowCount: null,
                tableRef
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
