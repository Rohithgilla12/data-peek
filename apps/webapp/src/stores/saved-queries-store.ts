import { create } from 'zustand'
import type { SavedQuery } from '@shared/index'

interface SavedQueryState {
  savedQueries: SavedQuery[]
  isLoading: boolean
  isInitialized: boolean
  error: string | null

  // Actions
  initializeSavedQueries: () => Promise<void>
  addSavedQuery: (
    query: Omit<SavedQuery, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>
  ) => Promise<SavedQuery | null>
  updateSavedQuery: (id: string, updates: Partial<SavedQuery>) => Promise<void>
  deleteSavedQuery: (id: string) => Promise<void>
  incrementUsage: (id: string) => Promise<void>
  togglePin: (id: string) => Promise<void>

  // Derived getters
  getFolders: () => string[]
  getTags: () => string[]
  getQueriesByFolder: (folder: string | null) => SavedQuery[]
  getQueriesByTag: (tag: string) => SavedQuery[]
  getPinnedQueries: () => SavedQuery[]
}

export const useSavedQueryStore = create<SavedQueryState>((set, get) => ({
  savedQueries: [],
  isLoading: false,
  isInitialized: false,
  error: null,

  initializeSavedQueries: async () => {
    if (get().isInitialized) return

    set({ isLoading: true, error: null })

    try {
      const result = await window.api.savedQueries.list()
      if (result.success && result.data) {
        set({
          savedQueries: result.data,
          isLoading: false,
          isInitialized: true
        })
      } else {
        set({
          isLoading: false,
          isInitialized: true,
          error: result.error || 'Failed to load saved queries'
        })
      }
    } catch (error) {
      console.error('Failed to initialize saved queries:', error)
      set({
        isLoading: false,
        isInitialized: true,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  },

  addSavedQuery: async (queryData) => {
    const now = Date.now()
    const newQuery: SavedQuery = {
      ...queryData,
      id: crypto.randomUUID(),
      usageCount: 0,
      createdAt: now,
      updatedAt: now
    }

    try {
      const result = await window.api.savedQueries.add(newQuery)
      if (result.success && result.data) {
        set((state) => ({
          savedQueries: [...state.savedQueries, result.data!]
        }))
        return result.data
      } else {
        console.error('Failed to add saved query:', result.error)
        return null
      }
    } catch (error) {
      console.error('Failed to add saved query:', error)
      return null
    }
  },

  updateSavedQuery: async (id, updates) => {
    try {
      const result = await window.api.savedQueries.update(id, updates)
      if (result.success && result.data) {
        set((state) => ({
          savedQueries: state.savedQueries.map((q) => (q.id === id ? result.data! : q))
        }))
      } else {
        console.error('Failed to update saved query:', result.error)
      }
    } catch (error) {
      console.error('Failed to update saved query:', error)
    }
  },

  deleteSavedQuery: async (id) => {
    try {
      const result = await window.api.savedQueries.delete(id)
      if (result.success) {
        set((state) => ({
          savedQueries: state.savedQueries.filter((q) => q.id !== id)
        }))
      } else {
        console.error('Failed to delete saved query:', result.error)
      }
    } catch (error) {
      console.error('Failed to delete saved query:', error)
    }
  },

  incrementUsage: async (id) => {
    try {
      const result = await window.api.savedQueries.incrementUsage(id)
      if (result.success && result.data) {
        set((state) => ({
          savedQueries: state.savedQueries.map((q) => (q.id === id ? result.data! : q))
        }))
      }
    } catch (error) {
      console.error('Failed to increment usage:', error)
    }
  },

  getFolders: () => {
    const folders = new Set<string>()
    get().savedQueries.forEach((q) => {
      if (q.folder) {
        folders.add(q.folder)
      }
    })
    return Array.from(folders).sort()
  },

  getTags: () => {
    const tags = new Set<string>()
    get().savedQueries.forEach((q) => {
      q.tags.forEach((tag) => tags.add(tag))
    })
    return Array.from(tags).sort()
  },

  getQueriesByFolder: (folder) => {
    return get().savedQueries.filter((q) => (folder === null ? !q.folder : q.folder === folder))
  },

  getQueriesByTag: (tag) => {
    return get().savedQueries.filter((q) => q.tags.includes(tag))
  },

  togglePin: async (id) => {
    const query = get().savedQueries.find((q) => q.id === id)
    if (!query) return

    const newPinnedState = !query.isPinned
    try {
      const result = await window.api.savedQueries.update(id, { isPinned: newPinnedState })
      if (result.success && result.data) {
        set((state) => ({
          savedQueries: state.savedQueries.map((q) => (q.id === id ? result.data! : q))
        }))
      }
    } catch (error) {
      console.error('Failed to toggle pin:', error)
    }
  },

  getPinnedQueries: () => {
    return get().savedQueries.filter((q) => q.isPinned)
  }
}))
