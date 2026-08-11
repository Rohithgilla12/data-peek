import { ipcMain } from 'electron'
import type { ConnectionConfig } from '@shared/index'
import type { PersistentStore } from '../storage'
import { windowManager } from '../window-manager'
import { closePgPool } from '../adapters/pg-pool-manager'
import { getAdapterByType } from '../db-adapter'
import { closeMySQLPool } from '../adapters/mysql-pool-manager'
import { closeMSSQLPool } from '../adapters/mssql-pool-manager'
import { invalidateSchemaCache } from '../schema-cache'
import { createLogger } from '../lib/logger'

const log = createLogger('connection-handlers')

// Every pooled driver. SQLite opens the file per call and holds nothing to tear down.
const POOL_CLOSERS: Partial<Record<string, (config: ConnectionConfig) => Promise<void>>> = {
  postgresql: closePgPool,
  mysql: closeMySQLPool,
  mssql: closeMSSQLPool
}

// Pool teardown happens after the IPC has already returned success — the connection is
// already persisted, the renderer has been notified, and a stale pool failing to close
// shouldn't poison the response with a misleading error.
function teardownConnection(connection: ConnectionConfig): void {
  invalidateSchemaCache(connection)
  const dbType = connection.dbType ?? 'postgresql'
  const close = POOL_CLOSERS[dbType]
  if (!close) return

  // Drain this connection's manual transactions before its pool goes, mirroring what
  // quit does globally: a parked session client keeps the pool's teardown pending, so
  // closing without this leaves the transaction open server-side holding its locks.
  const drain = async (): Promise<void> => {
    await getAdapterByType(dbType).drainSessions?.(connection)
  }

  drain()
    .catch((err) => {
      // A failed drain must not skip the teardown — the pool still has to go.
      log.warn(`draining ${dbType} sessions failed:`, (err as Error).message)
    })
    .then(() => close(connection))
    .catch((err) => {
      log.warn(`closing ${dbType} pool failed:`, (err as Error).message)
    })
}

/**
 * Register connection CRUD handlers
 */
export function registerConnectionHandlers(
  store: PersistentStore<{ connections: ConnectionConfig[] }>
): void {
  // List all connections
  ipcMain.handle('connections:list', () => {
    try {
      const connections = store.get('connections', [])
      return { success: true, data: connections }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Add a new connection
  ipcMain.handle('connections:add', (_, connection: ConnectionConfig) => {
    try {
      const connections = store.get('connections', [])
      connections.push(connection)
      store.set('connections', connections)
      // Broadcast to all windows that connections have changed
      windowManager.broadcastToAll('connections:updated')
      return { success: true, data: connection }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Update an existing connection
  ipcMain.handle('connections:update', (_, connection: ConnectionConfig) => {
    try {
      const connections = store.get('connections', [])
      const index = connections.findIndex((c) => c.id === connection.id)
      if (index === -1) {
        return { success: false, error: 'Connection not found' }
      }
      const previous = connections[index]
      connections[index] = connection
      store.set('connections', connections)
      windowManager.broadcastToAll('connections:updated')
      teardownConnection(previous)
      return { success: true, data: connection }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Delete a connection
  ipcMain.handle('connections:delete', (_, id: string) => {
    try {
      const connections = store.get('connections', [])
      const removed = connections.find((c) => c.id === id)
      const filtered = connections.filter((c) => c.id !== id)
      store.set('connections', filtered)
      windowManager.broadcastToAll('connections:updated')
      if (removed) teardownConnection(removed)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })
}
