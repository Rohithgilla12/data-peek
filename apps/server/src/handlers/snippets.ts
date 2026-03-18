import type { Snippet } from '@shared/index'
import type { ServerStorage } from '../server-storage.js'

type RegisterFn = (channel: string, handler: (args: any) => Promise<any>) => void

export function registerSnippetHandlers(
  store: ServerStorage<{ snippets: Snippet[] }>,
  register: RegisterFn
): void {
  register('snippets:list', async () => {
    const snippets = store.get('snippets', [])
    return { success: true, data: snippets }
  })

  register('snippets:add', async (snippet: Snippet) => {
    const snippets = store.get('snippets', [])
    snippets.push(snippet)
    store.set('snippets', snippets)
    return { success: true, data: snippet }
  })

  register('snippets:update', async ({ id, updates }: { id: string; updates: Partial<Snippet> }) => {
    const snippets = store.get('snippets', [])
    const index = snippets.findIndex((s) => s.id === id)
    if (index === -1) {
      return { success: false, error: 'Snippet not found' }
    }
    snippets[index] = { ...snippets[index], ...updates }
    store.set('snippets', snippets)
    return { success: true, data: snippets[index] }
  })

  register('snippets:delete', async (id: string) => {
    const snippets = store.get('snippets', [])
    const filtered = snippets.filter((s) => s.id !== id)
    store.set('snippets', filtered)
    return { success: true }
  })
}
