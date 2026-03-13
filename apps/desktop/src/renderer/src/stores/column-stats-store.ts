import { create } from 'zustand'
import type { ColumnStats, ColumnStatsRequest, ConnectionConfig } from '@shared/index'

interface SelectedColumn {
  connectionId: string
  schema: string
  table: string
  column: string
  dataType: string
  config: ConnectionConfig
}

interface ColumnStatsState {
  stats: Map<string, ColumnStats>
  isLoading: boolean
  error: string | null
  selectedColumn: SelectedColumn | null
  isPanelOpen: boolean

  fetchStats: (
    connectionId: string,
    config: ConnectionConfig,
    request: ColumnStatsRequest
  ) => Promise<void>
  selectColumn: (column: SelectedColumn | null) => void
  openPanel: () => void
  closePanel: () => void
  clearCache: () => void
}

function getCacheKey(connectionId: string, request: ColumnStatsRequest): string {
  return `${connectionId}:${request.schema}:${request.table}:${request.column}`
}

export const useColumnStatsStore = create<ColumnStatsState>((set, get) => ({
  stats: new Map(),
  isLoading: false,
  error: null,
  selectedColumn: null,
  isPanelOpen: false,

  fetchStats: async (connectionId, config, request) => {
    const cacheKey = getCacheKey(connectionId, request)
    const existing = get().stats.get(cacheKey)
    if (existing) {
      set({ isPanelOpen: true, error: null })
      return
    }

    set({ isLoading: true, error: null, isPanelOpen: true })
    try {
      const response = await window.api.db.columnStats(config, request)
      if (response.success && response.data) {
        const newStats = new Map(get().stats)
        newStats.set(cacheKey, response.data)
        set({ stats: newStats, isLoading: false })
      } else {
        set({ isLoading: false, error: response.error ?? 'Failed to fetch column stats' })
      }
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  },

  selectColumn: (column) => {
    set({ selectedColumn: column })
  },

  openPanel: () => {
    set({ isPanelOpen: true })
  },

  closePanel: () => {
    set({ isPanelOpen: false })
  },

  clearCache: () => {
    set({ stats: new Map(), error: null })
  }
}))
