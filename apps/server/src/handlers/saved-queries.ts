import type { SavedQuery } from '@shared/index'
import type { ServerStorage } from '../server-storage.js'

type RegisterFn = (channel: string, handler: (args: any) => Promise<any>) => void

export function registerSavedQueriesHandlers(
  store: ServerStorage<{ savedQueries: SavedQuery[] }>,
  register: RegisterFn
): void {
  register('saved-queries:list', async () => {
    const savedQueries = store.get('savedQueries', [])
    return { success: true, data: savedQueries }
  })

  register('saved-queries:add', async (query: SavedQuery) => {
    const savedQueries = store.get('savedQueries', [])
    savedQueries.push(query)
    store.set('savedQueries', savedQueries)
    return { success: true, data: query }
  })

  register('saved-queries:update', async ({ id, updates }: { id: string; updates: Partial<SavedQuery> }) => {
    const savedQueries = store.get('savedQueries', [])
    const index = savedQueries.findIndex((q) => q.id === id)
    if (index === -1) {
      return { success: false, error: 'Saved query not found' }
    }
    savedQueries[index] = { ...savedQueries[index], ...updates }
    store.set('savedQueries', savedQueries)
    return { success: true, data: savedQueries[index] }
  })

  register('saved-queries:delete', async (id: string) => {
    const savedQueries = store.get('savedQueries', [])
    const filtered = savedQueries.filter((q) => q.id !== id)
    store.set('savedQueries', filtered)
    return { success: true }
  })

  register('saved-queries:increment-usage', async (id: string) => {
    const savedQueries = store.get('savedQueries', [])
    const index = savedQueries.findIndex((q) => q.id === id)
    if (index === -1) {
      return { success: false, error: 'Saved query not found' }
    }
    savedQueries[index] = {
      ...savedQueries[index],
      usageCount: (savedQueries[index].usageCount || 0) + 1,
      lastUsedAt: Date.now()
    }
    store.set('savedQueries', savedQueries)
    return { success: true, data: savedQueries[index] }
  })
}
