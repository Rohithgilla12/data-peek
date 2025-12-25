import { ipcMain } from 'electron'
import type { Snippet } from '@shared/index'
import type { DpStorage } from '../storage'

export function registerSnippetHandlers(store: DpStorage<{ snippets: Snippet[] }>): void {
  ipcMain.handle('snippets:list', () => {
    try {
      const snippets = store.get('snippets', [])
      return { success: true, data: snippets }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('snippets:add', (_, snippet: Snippet) => {
    try {
      const snippets = store.get('snippets', [])
      snippets.push(snippet)
      store.set('snippets', snippets)
      return { success: true, data: snippet }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle(
    'snippets:update',
    (_, { id, updates }: { id: string; updates: Partial<Snippet> }) => {
      try {
        const snippets = store.get('snippets', [])
        const index = snippets.findIndex((s) => s.id === id)
        if (index === -1) {
          return { success: false, error: 'Snippet not found' }
        }
        snippets[index] = {
          ...snippets[index],
          ...updates,
          updatedAt: Date.now()
        }
        store.set('snippets', snippets)
        return { success: true, data: snippets[index] }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle('snippets:delete', (_, id: string) => {
    try {
      const snippets = store.get('snippets', [])
      const filtered = snippets.filter((s) => s.id !== id)
      store.set('snippets', filtered)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })
}
