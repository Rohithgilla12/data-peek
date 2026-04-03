import { create } from 'zustand'
import type { QueryField } from '@shared/index'

interface QueryTab {
  id: string
  title: string
  sql: string
  results: {
    rows: Record<string, unknown>[]
    fields: QueryField[]
    rowCount: number
    durationMs: number
  } | null
  error: string | null
  isExecuting: boolean
}

interface QueryState {
  tabs: QueryTab[]
  activeTabId: string
  addTab: () => void
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateSql: (id: string, sql: string) => void
  setResults: (id: string, results: QueryTab['results']) => void
  setError: (id: string, error: string | null) => void
  setExecuting: (id: string, executing: boolean) => void
}

let tabCounter = 1

function createTab(): QueryTab {
  const id = `tab-${tabCounter++}`
  return {
    id,
    title: `Query ${tabCounter - 1}`,
    sql: '',
    results: null,
    error: null,
    isExecuting: false,
  }
}

const initialTab = createTab()

export const useQueryStore = create<QueryState>((set) => ({
  tabs: [initialTab],
  activeTabId: initialTab.id,

  addTab: () => {
    const tab = createTab()
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }))
  },

  removeTab: (id) =>
    set((state) => {
      if (state.tabs.length <= 1) return state
      const tabs = state.tabs.filter((t) => t.id !== id)
      const activeTabId = state.activeTabId === id ? tabs[tabs.length - 1].id : state.activeTabId
      return { tabs, activeTabId }
    }),

  setActiveTab: (id) => set({ activeTabId: id }),

  updateSql: (id, sql) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, sql } : t)),
    })),

  setResults: (id, results) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, results, error: null } : t)),
    })),

  setError: (id, error) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, error, results: null } : t)),
    })),

  setExecuting: (id, isExecuting) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, isExecuting } : t)),
    })),
}))
