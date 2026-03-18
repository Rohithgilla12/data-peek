import type { ConnectionConfig } from '@shared/index'
import type { ServerStorage } from '../server-storage.js'

type RegisterFn = (channel: string, handler: (args: any) => Promise<any>) => void
type BroadcastFn = (event: string, data?: any) => void

export function registerConnectionHandlers(
  store: ServerStorage<{ connections: ConnectionConfig[] }>,
  register: RegisterFn,
  broadcast: BroadcastFn
): void {
  register('connections:list', async () => {
    const connections = store.get('connections', [])
    return { success: true, data: connections }
  })

  register('connections:add', async (connection: ConnectionConfig) => {
    const connections = store.get('connections', [])
    connections.push(connection)
    store.set('connections', connections)
    broadcast('connections:updated')
    return { success: true, data: connection }
  })

  register('connections:update', async (connection: ConnectionConfig) => {
    const connections = store.get('connections', [])
    const index = connections.findIndex((c) => c.id === connection.id)
    if (index === -1) {
      return { success: false, error: 'Connection not found' }
    }
    connections[index] = connection
    store.set('connections', connections)
    broadcast('connections:updated')
    return { success: true, data: connection }
  })

  register('connections:delete', async (id: string) => {
    const connections = store.get('connections', [])
    const filtered = connections.filter((c) => c.id !== id)
    store.set('connections', filtered)
    broadcast('connections:updated')
    return { success: true }
  })
}
