import { ipcMain } from 'electron'
import type { NotebookStorage } from '../notebook-storage'
import type { CreateNotebookInput, UpdateNotebookInput, AddCellInput, UpdateCellInput } from '@shared/index'

export function registerNotebookHandlers(storage: NotebookStorage): void {
  ipcMain.handle('notebooks:list', () => {
    try {
      const data = storage.listNotebooks()
      return { success: true, data }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('notebooks:get', (_, id: string) => {
    try {
      const data = storage.getNotebook(id)
      if (!data) return { success: false, error: 'Notebook not found' }
      return { success: true, data }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('notebooks:create', (_, input: CreateNotebookInput) => {
    try {
      const data = storage.createNotebook(input)
      return { success: true, data }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle(
    'notebooks:update',
    (_, { id, updates }: { id: string; updates: UpdateNotebookInput }) => {
      try {
        const data = storage.updateNotebook(id, updates)
        if (!data) return { success: false, error: 'Notebook not found' }
        return { success: true, data }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle('notebooks:delete', (_, id: string) => {
    try {
      storage.deleteNotebook(id)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle(
    'notebooks:duplicate',
    (_, { id, connectionId }: { id: string; connectionId: string }) => {
      try {
        const data = storage.duplicateNotebook(id, connectionId)
        if (!data) return { success: false, error: 'Notebook not found' }
        return { success: true, data }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    'notebooks:add-cell',
    (_, { notebookId, input }: { notebookId: string; input: AddCellInput }) => {
      try {
        const data = storage.addCell(notebookId, input)
        return { success: true, data }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    'notebooks:update-cell',
    (_, { cellId, updates }: { cellId: string; updates: UpdateCellInput }) => {
      try {
        const data = storage.updateCell(cellId, updates)
        if (!data) return { success: false, error: 'Cell not found' }
        return { success: true, data }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle('notebooks:delete-cell', (_, cellId: string) => {
    try {
      storage.deleteCell(cellId)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle(
    'notebooks:reorder-cells',
    (_, { notebookId, cellIds }: { notebookId: string; cellIds: string[] }) => {
      try {
        storage.reorderCells(notebookId, cellIds)
        return { success: true }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )
}
