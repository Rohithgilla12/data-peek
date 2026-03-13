import { create } from 'zustand'
import type {
  ColumnGenerator,
  DataGenConfig,
  DataGenProgress,
  DataGenResult,
  ConnectionConfig
} from '@shared/index'
import { getHeuristicGenerator } from '@/lib/data-gen-heuristics'

export interface ColumnInfo {
  name: string
  dataType: string
  isNullable: boolean
  isPrimaryKey?: boolean
}

export interface ForeignKeyInfo {
  columnName: string
  referencedTable: string
  referencedColumn: string
}

interface DataGenTabState {
  config: DataGenConfig
  columnGenerators: ColumnGenerator[]
  previewRows: unknown[][] | null
  previewColumns: string[]
  progress: DataGenProgress | null
  isGenerating: boolean
  isPreviewing: boolean
  result: DataGenResult | null
  error: string | null
}

interface DataGenStoreState {
  tabs: Record<string, DataGenTabState>

  initForTable: (
    tabId: string,
    schema: string,
    table: string,
    columns: ColumnInfo[],
    foreignKeys: ForeignKeyInfo[]
  ) => void

  updateGenerator: (
    tabId: string,
    columnName: string,
    updates: Partial<ColumnGenerator>
  ) => void

  updateConfig: (tabId: string, updates: Partial<DataGenConfig>) => void

  startGenerate: (tabId: string, connectionConfig: ConnectionConfig) => Promise<void>
  cancelGenerate: () => Promise<void>
  fetchPreview: (tabId: string, connectionConfig: ConnectionConfig) => Promise<void>

  setProgress: (tabId: string, progress: DataGenProgress) => void
  setResult: (tabId: string, result: DataGenResult) => void
  setError: (tabId: string, error: string) => void
  clearResult: (tabId: string) => void

  getTab: (tabId: string) => DataGenTabState | undefined
  removeTab: (tabId: string) => void
}

function buildDefaultGenerators(
  columns: ColumnInfo[],
  foreignKeys: ForeignKeyInfo[]
): ColumnGenerator[] {
  return columns.map((col): ColumnGenerator => {
    const fk = foreignKeys.find((f) => f.columnName === col.name)

    if (fk) {
      return {
        columnName: col.name,
        dataType: col.dataType,
        generatorType: 'fk-reference',
        fkTable: fk.referencedTable,
        fkColumn: fk.referencedColumn,
        nullPercentage: 0,
        skip: false
      }
    }

    const heuristic = getHeuristicGenerator(col.name, col.dataType)

    return {
      columnName: col.name,
      dataType: col.dataType,
      generatorType: heuristic.generatorType ?? 'faker',
      fakerMethod: heuristic.fakerMethod,
      minValue: heuristic.minValue,
      maxValue: heuristic.maxValue,
      nullPercentage: 0,
      skip: false
    }
  })
}

export const useDataGenStore = create<DataGenStoreState>((set, get) => ({
  tabs: {},

  initForTable: (tabId, schema, table, columns, foreignKeys) => {
    const generators = buildDefaultGenerators(columns, foreignKeys)

    const config: DataGenConfig = {
      schema,
      table,
      rowCount: 100,
      columns: generators,
      batchSize: 500
    }

    set((state) => ({
      tabs: {
        ...state.tabs,
        [tabId]: {
          config,
          columnGenerators: generators,
          previewRows: null,
          previewColumns: columns.filter((c) => generators.find((g) => g.columnName === c.name && !g.skip)).map((c) => c.name),
          progress: null,
          isGenerating: false,
          isPreviewing: false,
          result: null,
          error: null
        }
      }
    }))
  },

  updateGenerator: (tabId, columnName, updates) => {
    set((state) => {
      const tab = state.tabs[tabId]
      if (!tab) return state

      const updatedGenerators = tab.columnGenerators.map((g) =>
        g.columnName === columnName ? { ...g, ...updates } : g
      )

      return {
        tabs: {
          ...state.tabs,
          [tabId]: {
            ...tab,
            columnGenerators: updatedGenerators,
            config: { ...tab.config, columns: updatedGenerators }
          }
        }
      }
    })
  },

  updateConfig: (tabId, updates) => {
    set((state) => {
      const tab = state.tabs[tabId]
      if (!tab) return state

      return {
        tabs: {
          ...state.tabs,
          [tabId]: {
            ...tab,
            config: { ...tab.config, ...updates }
          }
        }
      }
    })
  },

  startGenerate: async (tabId, connectionConfig) => {
    const tab = get().tabs[tabId]
    if (!tab) return

    set((state) => ({
      tabs: {
        ...state.tabs,
        [tabId]: {
          ...state.tabs[tabId],
          isGenerating: true,
          error: null,
          result: null,
          progress: null
        }
      }
    }))

    const unsubscribe = window.api.db.onGenerateProgress((progress) => {
      get().setProgress(tabId, progress)
    })

    try {
      const response = await window.api.db.generateData(connectionConfig, tab.config)

      if (response.success && response.data) {
        set((state) => ({
          tabs: {
            ...state.tabs,
            [tabId]: {
              ...state.tabs[tabId],
              isGenerating: false,
              result: response.data ?? null
            }
          }
        }))
      } else {
        set((state) => ({
          tabs: {
            ...state.tabs,
            [tabId]: {
              ...state.tabs[tabId],
              isGenerating: false,
              error: response.error ?? 'Generation failed'
            }
          }
        }))
      }
    } catch (err) {
      set((state) => ({
        tabs: {
          ...state.tabs,
          [tabId]: {
            ...state.tabs[tabId],
            isGenerating: false,
            error: err instanceof Error ? err.message : 'Unknown error'
          }
        }
      }))
    } finally {
      unsubscribe()
    }
  },

  cancelGenerate: async () => {
    await window.api.db.cancelGenerate()
  },

  fetchPreview: async (tabId, connectionConfig) => {
    const tab = get().tabs[tabId]
    if (!tab) return

    set((state) => ({
      tabs: {
        ...state.tabs,
        [tabId]: { ...state.tabs[tabId], isPreviewing: true, error: null }
      }
    }))

    try {
      const response = await window.api.db.generatePreview(connectionConfig, tab.config)

      if (response.success && response.data) {
        const activeColumns = tab.config.columns.filter((c) => !c.skip).map((c) => c.columnName)
        set((state) => ({
          tabs: {
            ...state.tabs,
            [tabId]: {
              ...state.tabs[tabId],
              isPreviewing: false,
              previewRows: response.data?.rows ?? null,
              previewColumns: activeColumns
            }
          }
        }))
      } else {
        set((state) => ({
          tabs: {
            ...state.tabs,
            [tabId]: {
              ...state.tabs[tabId],
              isPreviewing: false,
              error: response.error ?? 'Preview failed'
            }
          }
        }))
      }
    } catch (err) {
      set((state) => ({
        tabs: {
          ...state.tabs,
          [tabId]: {
            ...state.tabs[tabId],
            isPreviewing: false,
            error: err instanceof Error ? err.message : 'Unknown error'
          }
        }
      }))
    }
  },

  setProgress: (tabId, progress) => {
    set((state) => ({
      tabs: {
        ...state.tabs,
        [tabId]: { ...state.tabs[tabId], progress }
      }
    }))
  },

  setResult: (tabId, result) => {
    set((state) => ({
      tabs: {
        ...state.tabs,
        [tabId]: { ...state.tabs[tabId], result, isGenerating: false }
      }
    }))
  },

  setError: (tabId, error) => {
    set((state) => ({
      tabs: {
        ...state.tabs,
        [tabId]: { ...state.tabs[tabId], error, isGenerating: false }
      }
    }))
  },

  clearResult: (tabId) => {
    set((state) => ({
      tabs: {
        ...state.tabs,
        [tabId]: { ...state.tabs[tabId], result: null, error: null, progress: null }
      }
    }))
  },

  getTab: (tabId) => get().tabs[tabId],

  removeTab: (tabId) => {
    set((state) => {
      const next = { ...state.tabs }
      delete next[tabId]
      return { tabs: next }
    })
  }
}))
