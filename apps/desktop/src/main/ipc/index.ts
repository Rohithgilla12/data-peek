import type { ConnectionConfig, SavedQuery } from '@shared/index'
import type { DpStorage } from '../storage'
import { registerConnectionHandlers } from './connection-handlers'
import { registerQueryHandlers } from './query-handlers'
import { registerDDLHandlers } from './ddl-handlers'
import { registerLicenseHandlers } from './license-handlers'
import { registerSavedQueriesHandlers } from './saved-queries-handlers'
import { registerScheduledQueriesHandlers } from './scheduled-queries-handlers'
import { registerDashboardHandlers } from './dashboard-handlers'
import { registerAIHandlers } from './ai-handlers'
import { createLogger } from '../lib/logger'
import { registerFileHandlers } from './file-handlers'
import { registerWindowHandlers } from './window-handler'

const log = createLogger('ipc')

export interface IpcStores {
  connections: DpStorage<{ connections: ConnectionConfig[] }>
  savedQueries: DpStorage<{ savedQueries: SavedQuery[] }>
}

/**
 * Register every IPC handler used by the application's main process.
 *
 * @param stores - Persistent stores required by handler categories; includes `connections` (connection configs) and `savedQueries` (saved query entries)
 */
export function registerAllHandlers(stores: IpcStores): void {
  // Connection CRUD operations
  registerConnectionHandlers(stores.connections)

  // Database query and schema operations
  registerQueryHandlers()

  // DDL (table designer) operations
  registerDDLHandlers()

  // License management
  registerLicenseHandlers()

  // Saved queries management
  registerSavedQueriesHandlers(stores.savedQueries)

  // Scheduled queries management
  registerScheduledQueriesHandlers()

  // Dashboard management
  registerDashboardHandlers()

  // AI features
  registerAIHandlers()

  // File handler
  registerFileHandlers()

  // Window controls
  registerWindowHandlers()

  log.debug('All handlers registered')
}

// Re-export handler registration functions for testing or selective registration
export { registerConnectionHandlers } from './connection-handlers'
export { registerQueryHandlers } from './query-handlers'
export { registerDDLHandlers } from './ddl-handlers'
export { registerLicenseHandlers } from './license-handlers'
export { registerSavedQueriesHandlers } from './saved-queries-handlers'
export { registerScheduledQueriesHandlers } from './scheduled-queries-handlers'
export { registerDashboardHandlers } from './dashboard-handlers'
export { registerAIHandlers } from './ai-handlers'
