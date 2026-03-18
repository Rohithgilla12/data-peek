import { create } from 'zustand'
import type { Snippet, SnippetCategory } from '@shared/index'
import { BUILT_IN_SNIPPETS } from '@/lib/built-in-snippets'

interface SnippetState {
  customSnippets: Snippet[]
  isLoading: boolean
  isInitialized: boolean
  error: string | null

  initializeSnippets: () => Promise<void>
  addSnippet: (
    snippet: Omit<Snippet, 'id' | 'createdAt' | 'updatedAt' | 'isBuiltIn'>
  ) => Promise<Snippet | null>
  updateSnippet: (id: string, updates: Partial<Snippet>) => Promise<void>
  deleteSnippet: (id: string) => Promise<void>

  getAllSnippets: () => Snippet[]
  getSnippetsByCategory: (category: SnippetCategory | 'all') => Snippet[]
  getSnippetByTrigger: (trigger: string) => Snippet | undefined
  searchSnippets: (query: string) => Snippet[]
}

export const useSnippetStore = create<SnippetState>((set, get) => ({
  customSnippets: [],
  isLoading: false,
  isInitialized: false,
  error: null,

  initializeSnippets: async () => {
    if (get().isInitialized) return

    set({ isLoading: true, error: null })

    try {
      const result = await window.api.snippets.list()
      if (result.success && result.data) {
        set({
          customSnippets: result.data,
          isLoading: false,
          isInitialized: true
        })
      } else {
        set({
          isLoading: false,
          isInitialized: true,
          error: result.error || 'Failed to load snippets'
        })
      }
    } catch (error) {
      console.error('Failed to initialize snippets:', error)
      set({
        isLoading: false,
        isInitialized: true,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  },

  addSnippet: async (snippetData) => {
    const now = Date.now()
    const newSnippet: Snippet = {
      ...snippetData,
      id: crypto.randomUUID(),
      isBuiltIn: false,
      createdAt: now,
      updatedAt: now
    }

    try {
      const result = await window.api.snippets.add(newSnippet)
      if (result.success && result.data) {
        set((state) => ({
          customSnippets: [...state.customSnippets, result.data!]
        }))
        return result.data
      } else {
        console.error('Failed to add snippet:', result.error)
        return null
      }
    } catch (error) {
      console.error('Failed to add snippet:', error)
      return null
    }
  },

  updateSnippet: async (id, updates) => {
    try {
      const result = await window.api.snippets.update(id, updates)
      if (result.success && result.data) {
        set((state) => ({
          customSnippets: state.customSnippets.map((s) => (s.id === id ? result.data! : s))
        }))
      } else {
        console.error('Failed to update snippet:', result.error)
      }
    } catch (error) {
      console.error('Failed to update snippet:', error)
    }
  },

  deleteSnippet: async (id) => {
    try {
      const result = await window.api.snippets.delete(id)
      if (result.success) {
        set((state) => ({
          customSnippets: state.customSnippets.filter((s) => s.id !== id)
        }))
      } else {
        console.error('Failed to delete snippet:', result.error)
      }
    } catch (error) {
      console.error('Failed to delete snippet:', error)
    }
  },

  getAllSnippets: () => {
    return [...BUILT_IN_SNIPPETS, ...get().customSnippets]
  },

  getSnippetsByCategory: (category) => {
    const all = get().getAllSnippets()
    if (category === 'all') return all
    return all.filter((s) => s.category === category)
  },

  getSnippetByTrigger: (trigger) => {
    const all = get().getAllSnippets()
    return all.find((s) => s.triggerPrefix === trigger)
  },

  searchSnippets: (query) => {
    const all = get().getAllSnippets()
    const lowerQuery = query.toLowerCase()
    return all.filter(
      (s) =>
        s.name.toLowerCase().includes(lowerQuery) ||
        s.description.toLowerCase().includes(lowerQuery) ||
        s.template.toLowerCase().includes(lowerQuery) ||
        (s.triggerPrefix && s.triggerPrefix.toLowerCase().includes(lowerQuery))
    )
  }
}))
