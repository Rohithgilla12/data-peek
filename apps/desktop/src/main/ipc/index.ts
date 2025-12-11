import type { ConnectionConfig, SavedQuery } from '@shared/index'
import type { DpStorage } from '../storage'
import { registerConnectionHandlers } from './connection-handlers'
import { registerQueryHandlers } from './query-handlers'
import { registerDDLHandlers } from './ddl-handlers'
import { registerLicenseHandlers } from './license-handlers'
import { registerSavedQueriesHandlers } from './saved-queries-handlers'
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
 * Register all IPC handlers
 *
 * This function is the central point for registering all IPC handlers.
 * Each handler category is in its own file for maintainability.
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
export { registerAIHandlers } from './ai-handlers'
