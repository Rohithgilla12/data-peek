import { create } from 'zustand'
import type {
  ActiveQuery,
  TableSizeInfo,
  CacheStats,
  LockInfo,
  DatabaseSizeInfo,
  ConnectionConfig
} from '@data-peek/shared'

interface HealthState {
  activeQueries: ActiveQuery[]
  tableSizes: TableSizeInfo[]
  dbSize: DatabaseSizeInfo | null
  cacheStats: CacheStats | null
  locks: LockInfo[]
  refreshInterval: number
  isLoading: Record<string, boolean>
  errors: Record<string, string | null>
  pollingTimerId: ReturnType<typeof setInterval> | null

  fetchActiveQueries: (config: ConnectionConfig) => Promise<void>
  fetchTableSizes: (config: ConnectionConfig, schema?: string) => Promise<void>
  fetchCacheStats: (config: ConnectionConfig) => Promise<void>
  fetchLocks: (config: ConnectionConfig) => Promise<void>
  killQuery: (
    config: ConnectionConfig,
    pid: number
  ) => Promise<{ success: boolean; error?: string }>
  setRefreshInterval: (ms: number) => void
  startPolling: (config: ConnectionConfig, schema?: string) => void
  stopPolling: () => void
  fetchAll: (config: ConnectionConfig, schema?: string) => Promise<void>
}

export const useHealthStore = create<HealthState>()((set, get) => ({
  activeQueries: [],
  tableSizes: [],
  dbSize: null,
  cacheStats: null,
  locks: [],
  refreshInterval: 5000,
  isLoading: {},
  errors: {},
  pollingTimerId: null,

  fetchActiveQueries: async (config) => {
    set((s) => ({ isLoading: { ...s.isLoading, activeQueries: true } }))
    try {
      const result = await window.api.health.activeQueries(config)
      if (result.success && result.data) {
        set((s) => ({
          activeQueries: result.data!,
          errors: { ...s.errors, activeQueries: null }
        }))
      } else {
        set((s) => ({ errors: { ...s.errors, activeQueries: result.error || 'Unknown error' } }))
      }
    } catch (err) {
      set((s) => ({ errors: { ...s.errors, activeQueries: String(err) } }))
    } finally {
      set((s) => ({ isLoading: { ...s.isLoading, activeQueries: false } }))
    }
  },

  fetchTableSizes: async (config, schema?) => {
    set((s) => ({ isLoading: { ...s.isLoading, tableSizes: true } }))
    try {
      const result = await window.api.health.tableSizes(config, schema)
      if (result.success && result.data) {
        set((s) => ({
          tableSizes: result.data!.tables,
          dbSize: result.data!.dbSize,
          errors: { ...s.errors, tableSizes: null }
        }))
      } else {
        set((s) => ({ errors: { ...s.errors, tableSizes: result.error || 'Unknown error' } }))
      }
    } catch (err) {
      set((s) => ({ errors: { ...s.errors, tableSizes: String(err) } }))
    } finally {
      set((s) => ({ isLoading: { ...s.isLoading, tableSizes: false } }))
    }
  },

  fetchCacheStats: async (config) => {
    set((s) => ({ isLoading: { ...s.isLoading, cacheStats: true } }))
    try {
      const result = await window.api.health.cacheStats(config)
      if (result.success && result.data) {
        set((s) => ({
          cacheStats: result.data!,
          errors: { ...s.errors, cacheStats: null }
        }))
      } else {
        set((s) => ({ errors: { ...s.errors, cacheStats: result.error || 'Unknown error' } }))
      }
    } catch (err) {
      set((s) => ({ errors: { ...s.errors, cacheStats: String(err) } }))
    } finally {
      set((s) => ({ isLoading: { ...s.isLoading, cacheStats: false } }))
    }
  },

  fetchLocks: async (config) => {
    set((s) => ({ isLoading: { ...s.isLoading, locks: true } }))
    try {
      const result = await window.api.health.locks(config)
      if (result.success && result.data) {
        set((s) => ({
          locks: result.data!,
          errors: { ...s.errors, locks: null }
        }))
      } else {
        set((s) => ({ errors: { ...s.errors, locks: result.error || 'Unknown error' } }))
      }
    } catch (err) {
      set((s) => ({ errors: { ...s.errors, locks: String(err) } }))
    } finally {
      set((s) => ({ isLoading: { ...s.isLoading, locks: false } }))
    }
  },

  killQuery: async (config, pid) => {
    try {
      const result = await window.api.health.killQuery(config, pid)
      if (result.success && result.data) {
        return result.data
      }
      return { success: false, error: result.error || 'Unknown error' }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },

  setRefreshInterval: (ms) => {
    set({ refreshInterval: ms })
  },

  fetchAll: async (config, schema?) => {
    const { fetchActiveQueries, fetchTableSizes, fetchCacheStats, fetchLocks } = get()
    await Promise.allSettled([
      fetchActiveQueries(config),
      fetchTableSizes(config, schema),
      fetchCacheStats(config),
      fetchLocks(config)
    ])
  },

  startPolling: (config, schema?) => {
    const { stopPolling, fetchAll, refreshInterval } = get()
    stopPolling()

    if (refreshInterval <= 0) return

    fetchAll(config, schema)
    const timerId = setInterval(() => {
      fetchAll(config, schema)
    }, refreshInterval)

    set({ pollingTimerId: timerId })
  },

  stopPolling: () => {
    const { pollingTimerId } = get()
    if (pollingTimerId !== null) {
      clearInterval(pollingTimerId)
      set({ pollingTimerId: null })
    }
  }
}))
