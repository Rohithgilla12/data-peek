import type { ConnectionConfig, SavedQuery, Snippet } from '@shared/index'
import type { DpStorage } from '../storage'
import type { NotebookStorage } from '../notebook-storage'
import { registerConnectionHandlers } from './connection-handlers'
import { registerQueryHandlers } from './query-handlers'
import { registerDDLHandlers } from './ddl-handlers'
import { registerLicenseHandlers } from './license-handlers'
import { registerSavedQueriesHandlers } from './saved-queries-handlers'
import { registerSnippetHandlers } from './snippet-handlers'
import { registerScheduledQueriesHandlers } from './scheduled-queries-handlers'
import { registerDashboardHandlers } from './dashboard-handlers'
import { registerAIHandlers } from './ai-handlers'
import { createLogger } from '../lib/logger'
import { registerFileHandlers } from './file-handlers'
import { registerWindowHandlers } from './window-handler'
import { registerColumnStatsHandlers } from './column-stats-handlers'
import { registerImportHandlers } from './import-handlers'
import { registerDataGenHandlers } from './data-gen-handlers'
import { registerPgNotifyHandlers } from './pg-notify-handlers'
import { registerHealthHandlers } from './health-handlers'
import { registerPgExportImportHandlers } from './pg-export-import-handlers'
import { registerNotebookHandlers } from './notebook-handlers'
import { registerIntelHandlers } from './intel-handlers'

const log = createLogger('ipc')

export interface IpcStores {
  connections: DpStorage<{ connections: ConnectionConfig[] }>
  savedQueries: DpStorage<{ savedQueries: SavedQuery[] }>
  snippets: DpStorage<{ snippets: Snippet[] }>
}

/**
 * Register every IPC handler used by the application's main process.
 *
 * @param stores - Persistent stores required by handler categories; includes `connections` (connection configs) and `savedQueries` (saved query entries)
 */
export function registerAllHandlers(stores: IpcStores, notebookStorage: NotebookStorage): void {
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

  // Snippets management
  registerSnippetHandlers(stores.snippets)

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

  // Column statistics
  registerColumnStatsHandlers()

  // CSV import
  registerImportHandlers()

  // Data generator
  registerDataGenHandlers()

  // PostgreSQL LISTEN/NOTIFY
  registerPgNotifyHandlers()

  // Health monitor diagnostics
  registerHealthHandlers()

  // PostgreSQL export/import (pg_dump/pg_restore)
  registerPgExportImportHandlers()

  // SQL Notebooks
  registerNotebookHandlers(notebookStorage)

  // Schema Intel / diagnostics
  registerIntelHandlers()

  log.debug('All handlers registered')
}

// Re-export handler registration functions for testing or selective registration
export { registerConnectionHandlers } from './connection-handlers'
export { registerQueryHandlers } from './query-handlers'
export { registerDDLHandlers } from './ddl-handlers'
export { registerLicenseHandlers } from './license-handlers'
export { registerSavedQueriesHandlers } from './saved-queries-handlers'
export { registerSnippetHandlers } from './snippet-handlers'
export { registerScheduledQueriesHandlers } from './scheduled-queries-handlers'
export { registerDashboardHandlers } from './dashboard-handlers'
export { registerAIHandlers } from './ai-handlers'
export { registerImportHandlers } from './import-handlers'
export { registerDataGenHandlers } from './data-gen-handlers'
export { registerPgNotifyHandlers } from './pg-notify-handlers'
export { registerHealthHandlers } from './health-handlers'
export { registerPgExportImportHandlers } from './pg-export-import-handlers'
export { registerNotebookHandlers } from './notebook-handlers'
export { registerIntelHandlers } from './intel-handlers'
