import { create } from 'zustand'
import type {
  Notebook,
  NotebookWithCells,
  CreateNotebookInput,
  UpdateNotebookInput,
  AddCellInput,
  PinnedResult
} from '@shared/index'

interface NotebookState {
  notebooks: Notebook[]
  activeNotebook: NotebookWithCells | null
  isLoading: boolean
  isInitialized: boolean
  lastSavedAt: number | null

  initialize: () => Promise<void>
  loadNotebook: (id: string) => Promise<void>
  createNotebook: (input: CreateNotebookInput) => Promise<Notebook | null>
  updateNotebook: (id: string, updates: UpdateNotebookInput) => Promise<void>
  deleteNotebook: (id: string) => Promise<void>
  duplicateNotebook: (id: string, connectionId: string) => Promise<void>
  addCell: (notebookId: string, input: AddCellInput) => Promise<void>
  updateCellContent: (cellId: string, content: string) => void
  flushCellContent: (cellId: string, content: string) => Promise<void>
  deleteCell: (cellId: string) => Promise<void>
  reorderCells: (notebookId: string, cellIds: string[]) => Promise<void>
  pinResult: (cellId: string, result: PinnedResult) => Promise<void>
  unpinResult: (cellId: string) => Promise<void>
}

export const useNotebookStore = create<NotebookState>((set, get) => ({
  notebooks: [],
  activeNotebook: null,
  isLoading: false,
  isInitialized: false,
  lastSavedAt: null,

  initialize: async () => {
    if (get().isInitialized) return

    set({ isLoading: true })

    try {
      const result = await window.api.notebooks.list()
      if (result.success && result.data) {
        set({ notebooks: result.data, isLoading: false, isInitialized: true })
      } else {
        console.error('Failed to load notebooks:', result.error)
        set({ isLoading: false, isInitialized: true })
      }
    } catch (error) {
      console.error('Failed to initialize notebooks:', error)
      set({ isLoading: false, isInitialized: true })
    }
  },

  loadNotebook: async (id) => {
    set({ isLoading: true })

    try {
      const result = await window.api.notebooks.get(id)
      if (result.success && result.data) {
        set({ activeNotebook: result.data, isLoading: false })
      } else {
        console.error('Failed to load notebook:', result.error)
        set({ isLoading: false })
      }
    } catch (error) {
      console.error('Failed to load notebook:', error)
      set({ isLoading: false })
    }
  },

  createNotebook: async (input) => {
    try {
      const result = await window.api.notebooks.create(input)
      if (result.success && result.data) {
        set((state) => ({ notebooks: [result.data!, ...state.notebooks] }))
        return result.data
      } else {
        console.error('Failed to create notebook:', result.error)
        return null
      }
    } catch (error) {
      console.error('Failed to create notebook:', error)
      return null
    }
  },

  updateNotebook: async (id, updates) => {
    try {
      const result = await window.api.notebooks.update(id, updates)
      if (result.success) {
        set((state) => ({
          notebooks: state.notebooks.map((n) => (n.id === id ? { ...n, ...updates } : n)),
          activeNotebook:
            state.activeNotebook?.id === id
              ? { ...state.activeNotebook, ...updates }
              : state.activeNotebook
        }))
      } else {
        console.error('Failed to update notebook:', result.error)
      }
    } catch (error) {
      console.error('Failed to update notebook:', error)
    }
  },

  deleteNotebook: async (id) => {
    try {
      const result = await window.api.notebooks.delete(id)
      if (result.success) {
        set((state) => ({
          notebooks: state.notebooks.filter((n) => n.id !== id),
          activeNotebook: state.activeNotebook?.id === id ? null : state.activeNotebook
        }))
      } else {
        console.error('Failed to delete notebook:', result.error)
      }
    } catch (error) {
      console.error('Failed to delete notebook:', error)
    }
  },

  duplicateNotebook: async (id, connectionId) => {
    try {
      const result = await window.api.notebooks.duplicate(id, connectionId)
      if (result.success && result.data) {
        const { cells: _cells, ...notebookMeta } = result.data
        set((state) => ({ notebooks: [notebookMeta, ...state.notebooks] }))
      } else {
        console.error('Failed to duplicate notebook:', result.error)
      }
    } catch (error) {
      console.error('Failed to duplicate notebook:', error)
    }
  },

  addCell: async (notebookId, input) => {
    try {
      const result = await window.api.notebooks.addCell(notebookId, input)
      if (result.success && result.data) {
        set((state) => {
          if (!state.activeNotebook || state.activeNotebook.id !== notebookId) return state
          const cells = [...state.activeNotebook.cells, result.data!].sort(
            (a, b) => a.order - b.order
          )
          return { activeNotebook: { ...state.activeNotebook, cells } }
        })
      } else {
        console.error('Failed to add cell:', result.error)
      }
    } catch (error) {
      console.error('Failed to add cell:', error)
    }
  },

  updateCellContent: (cellId, content) => {
    set((state) => {
      if (!state.activeNotebook) return state
      const cells = state.activeNotebook.cells.map((c) =>
        c.id === cellId ? { ...c, content } : c
      )
      return { activeNotebook: { ...state.activeNotebook, cells } }
    })
  },

  flushCellContent: async (cellId, content) => {
    try {
      const result = await window.api.notebooks.updateCell(cellId, { content })
      if (result.success) {
        set({ lastSavedAt: Date.now() })
      } else {
        console.error('Failed to flush cell content:', result.error)
      }
    } catch (error) {
      console.error('Failed to flush cell content:', error)
    }
  },

  deleteCell: async (cellId) => {
    try {
      const result = await window.api.notebooks.deleteCell(cellId)
      if (result.success) {
        set((state) => {
          if (!state.activeNotebook) return state
          const cells = state.activeNotebook.cells.filter((c) => c.id !== cellId)
          return { activeNotebook: { ...state.activeNotebook, cells } }
        })
      } else {
        console.error('Failed to delete cell:', result.error)
      }
    } catch (error) {
      console.error('Failed to delete cell:', error)
    }
  },

  reorderCells: async (notebookId, cellIds) => {
    try {
      const result = await window.api.notebooks.reorderCells(notebookId, cellIds)
      if (result.success) {
        set((state) => {
          if (!state.activeNotebook || state.activeNotebook.id !== notebookId) return state
          const cellMap = new Map(state.activeNotebook.cells.map((c) => [c.id, c]))
          const cells = cellIds.map((id) => cellMap.get(id)).filter(Boolean) as typeof state.activeNotebook.cells
          return { activeNotebook: { ...state.activeNotebook, cells } }
        })
      } else {
        console.error('Failed to reorder cells:', result.error)
      }
    } catch (error) {
      console.error('Failed to reorder cells:', error)
    }
  },

  pinResult: async (cellId, result) => {
    try {
      const ipcResult = await window.api.notebooks.updateCell(cellId, { pinnedResult: result })
      if (ipcResult.success) {
        set((state) => {
          if (!state.activeNotebook) return state
          const cells = state.activeNotebook.cells.map((c) =>
            c.id === cellId ? { ...c, pinnedResult: result } : c
          )
          return { activeNotebook: { ...state.activeNotebook, cells } }
        })
      } else {
        console.error('Failed to pin result:', ipcResult.error)
      }
    } catch (error) {
      console.error('Failed to pin result:', error)
    }
  },

  unpinResult: async (cellId) => {
    try {
      const result = await window.api.notebooks.updateCell(cellId, { pinnedResult: null })
      if (result.success) {
        set((state) => {
          if (!state.activeNotebook) return state
          const cells = state.activeNotebook.cells.map((c) =>
            c.id === cellId ? { ...c, pinnedResult: null } : c
          )
          return { activeNotebook: { ...state.activeNotebook, cells } }
        })
      } else {
        console.error('Failed to unpin result:', result.error)
      }
    } catch (error) {
      console.error('Failed to unpin result:', error)
    }
  }
}))
