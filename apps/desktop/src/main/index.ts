import { config } from 'dotenv'
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

// Load .env file - in development, it's in the desktop app directory
config({ path: resolve(__dirname, '../../.env') })
import icon from '../../resources/icon.png?asset'
import type {
  ConnectionConfig,
  EditBatch,
  EditResult,
  TableDefinition,
  AlterTableBatch,
  DDLResult,
  SavedQuery
} from '@shared/index'
import { buildQuery, validateOperation, buildPreviewSql } from './sql-builder'
import {
  buildCreateTable,
  buildAlterTable,
  buildDropTable,
  buildPreviewDDL,
  validateTableDefinition
} from './ddl-builder'
import { createMenu } from './menu'
import { setupContextMenu } from './context-menu'
import { getWindowState, trackWindowState } from './window-state'
import { getAdapter } from './db-adapter'
import {
  initLicenseStore,
  checkLicense,
  activateLicense,
  deactivateLicense,
  activateLicenseOffline,
  getCustomerPortalUrl
} from './license-service'
import {
  initAIStore,
  getAIConfig,
  setAIConfig,
  clearAIConfig,
  validateAPIKey,
  generateChatResponse,
  getChatHistory,
  saveChatHistory,
  clearChatHistory,
  getChatSessions,
  getChatSession,
  createChatSession,
  updateChatSession,
  deleteChatSession,
  type AIConfig,
  type AIMessage,
  type StoredChatMessage
} from './ai-service'
import { initAutoUpdater } from './updater'
import type { LicenseActivationRequest, SchemaInfo } from '@shared/index'

import { DpStorage } from './storage'

let store: DpStorage<{ connections: ConnectionConfig[] }>
let savedQueriesStore: DpStorage<{ savedQueries: SavedQuery[] }>

async function initStore(): Promise<void> {
  store = await DpStorage.create<{ connections: ConnectionConfig[] }>({
    name: 'data-peek-connections',
    defaults: {
      connections: []
    }
  })

  savedQueriesStore = await DpStorage.create<{ savedQueries: SavedQuery[] }>({
    name: 'data-peek-saved-queries',
    defaults: {
      savedQueries: []
    }
  })
}

// Store main window reference for macOS hide-on-close behavior
let mainWindow: BrowserWindow | null = null
let forceQuit = false

async function createWindow(): Promise<void> {
  // Get saved window state
  const windowState = await getWindowState()

  // Create the browser window.
  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: false, // Show menu bar for native shortcuts
    // macOS-style window
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    transparent: true,
    backgroundColor: '#00000000',
    // Windows titlebar overlay
    ...(process.platform === 'win32' && {
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#1e1e1e',
        symbolColor: '#ffffff',
        height: 40
      }
    }),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Track window state for persistence
  trackWindowState(mainWindow)

  // Restore maximized state
  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  // Setup context menu
  setupContextMenu(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // macOS: hide instead of close (like native apps)
  mainWindow.on('close', (e) => {
    if (process.platform === 'darwin' && !forceQuit) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Set app name for macOS dock and Mission Control
if (process.platform === 'darwin') {
  app.name = 'Data Peek'
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Initialize electron-store (ESM module)
  await initStore()

  // Initialize license store
  await initLicenseStore()

  // Initialize AI store
  await initAIStore()

  // Create native application menu
  createMenu()

  // Set app user model id for windows
  electronApp.setAppUserModelId('dev.datapeek.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC Handlers
  ipcMain.handle('db:connect', async (_, config: ConnectionConfig) => {
    try {
      const adapter = getAdapter(config)
      await adapter.connect(config)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle(
    'db:query',
    async (_, { config, query }: { config: ConnectionConfig; query: string }) => {
      console.log('[main:db:query] Received query request')
      console.log('[main:db:query] Config:', { ...config, password: '***' })
      console.log('[main:db:query] Query:', query)

      try {
        const adapter = getAdapter(config)
        console.log('[main:db:query] Connecting...')

        // Use queryMultiple to support multiple statements
        const multiResult = await adapter.queryMultiple(config, query)

        console.log('[main:db:query] Query completed in', multiResult.totalDurationMs, 'ms')
        console.log('[main:db:query] Statement count:', multiResult.results.length)

        return {
          success: true,
          data: {
            // Return multi-statement results
            results: multiResult.results,
            totalDurationMs: multiResult.totalDurationMs,
            statementCount: multiResult.results.length,
            // Also include legacy single-result format for backward compatibility
            // (uses first data-returning result or first result if none)
            rows:
              multiResult.results.find((r) => r.isDataReturning)?.rows ||
              multiResult.results[0]?.rows ||
              [],
            fields:
              multiResult.results.find((r) => r.isDataReturning)?.fields ||
              multiResult.results[0]?.fields ||
              [],
            rowCount:
              multiResult.results.find((r) => r.isDataReturning)?.rowCount ??
              multiResult.results[0]?.rowCount ??
              0,
            durationMs: multiResult.totalDurationMs
          }
        }
      } catch (error: unknown) {
        console.error('[main:db:query] Error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Fetch database schemas, tables, and columns
  ipcMain.handle('db:schemas', async (_, config: ConnectionConfig) => {
    try {
      const adapter = getAdapter(config)
      const schemas = await adapter.getSchemas(config)

      return {
        success: true,
        data: {
          schemas,
          fetchedAt: Date.now()
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Connection CRUD handlers
  ipcMain.handle('connections:list', () => {
    try {
      const connections = store.get('connections', [])
      return { success: true, data: connections }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('connections:add', (_, connection: ConnectionConfig) => {
    try {
      const connections = store.get('connections', [])
      connections.push(connection)
      store.set('connections', connections)
      return { success: true, data: connection }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('connections:update', (_, connection: ConnectionConfig) => {
    try {
      const connections = store.get('connections', [])
      const index = connections.findIndex((c) => c.id === connection.id)
      if (index === -1) {
        return { success: false, error: 'Connection not found' }
      }
      connections[index] = connection
      store.set('connections', connections)
      return { success: true, data: connection }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('connections:delete', (_, id: string) => {
    try {
      const connections = store.get('connections', [])
      const filtered = connections.filter((c) => c.id !== id)
      store.set('connections', filtered)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Execute edit operations (INSERT, UPDATE, DELETE)
  ipcMain.handle(
    'db:execute',
    async (_, { config, batch }: { config: ConnectionConfig; batch: EditBatch }) => {
      console.log('[main:db:execute] Received edit batch')
      console.log('[main:db:execute] Context:', batch.context)
      console.log('[main:db:execute] Operations count:', batch.operations.length)

      const adapter = getAdapter(config)
      const dbType = config.dbType || 'postgresql'
      const result: EditResult = {
        success: true,
        rowsAffected: 0,
        executedSql: [],
        errors: []
      }

      // Validate operations first
      const validOperations: Array<{
        sql: string
        params: unknown[]
        preview: string
        opId: string
      }> = []
      for (const operation of batch.operations) {
        const validation = validateOperation(operation)
        if (!validation.valid) {
          result.errors!.push({
            operationId: operation.id,
            message: validation.error!
          })
          continue
        }

        const query = buildQuery(operation, batch.context, dbType)
        const previewSql = buildPreviewSql(operation, batch.context, dbType)
        validOperations.push({
          sql: query.sql,
          params: query.params,
          preview: previewSql,
          opId: operation.id
        })
      }

      // If all operations have validation errors, return early
      if (validOperations.length === 0 && result.errors!.length > 0) {
        result.success = false
        return { success: true, data: result }
      }

      try {
        const statements = validOperations.map((op) => ({ sql: op.sql, params: op.params }))
        const txResult = await adapter.executeTransaction(config, statements)

        result.rowsAffected = txResult.rowsAffected
        result.executedSql = validOperations.map((op) => op.preview)

        return { success: true, data: result }
      } catch (error: unknown) {
        console.error('[main:db:execute] Error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        // Mark all valid operations as failed
        for (const op of validOperations) {
          result.errors!.push({
            operationId: op.opId,
            message: errorMessage
          })
        }
        result.success = false
        return { success: true, data: result }
      }
    }
  )

  // Preview SQL for edit operations (without executing)
  ipcMain.handle(
    'db:preview-sql',
    (_, { batch, dbType }: { batch: EditBatch; dbType?: string }) => {
      try {
        const targetDbType = (dbType || 'postgresql') as 'postgresql' | 'mysql' | 'sqlite' | 'mssql'
        const previews = batch.operations.map((op) => ({
          operationId: op.id,
          sql: buildPreviewSql(op, batch.context, targetDbType)
        }))
        return { success: true, data: previews }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Execute EXPLAIN ANALYZE for query plan analysis
  ipcMain.handle(
    'db:explain',
    async (
      _,
      { config, query, analyze }: { config: ConnectionConfig; query: string; analyze: boolean }
    ) => {
      console.log('[main:db:explain] Received explain request')
      console.log('[main:db:explain] Query:', query)
      console.log('[main:db:explain] Analyze:', analyze)

      try {
        const adapter = getAdapter(config)
        const result = await adapter.explain(config, query, analyze)

        return {
          success: true,
          data: result
        }
      } catch (error: unknown) {
        console.error('[main:db:explain] Error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // ============================================
  // DDL Handlers - Table Designer
  // ============================================

  // Create a new table
  ipcMain.handle(
    'db:create-table',
    async (
      _,
      { config, definition }: { config: ConnectionConfig; definition: TableDefinition }
    ) => {
      console.log('[main:db:create-table] Creating table:', definition.schema, definition.name)

      // Validate table definition
      const validation = validateTableDefinition(definition)
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join('; ')
        }
      }

      const adapter = getAdapter(config)
      const dbType = config.dbType || 'postgresql'
      const result: DDLResult = {
        success: true,
        executedSql: [],
        errors: []
      }

      try {
        // Build CREATE TABLE statement
        const { sql } = buildCreateTable(definition, dbType)
        result.executedSql.push(sql)

        console.log('[main:db:create-table] Executing:', sql)

        // Execute each statement separately (CREATE TABLE, COMMENT, indexes)
        const statements = sql.split(/;\s*\n\n/).filter((s) => s.trim())
        const stmtParams = statements
          .filter((s) => s.trim())
          .map((stmt) => ({
            sql: stmt.trim().endsWith(';') ? stmt : stmt + ';',
            params: []
          }))

        await adapter.executeTransaction(config, stmtParams)

        return { success: true, data: result }
      } catch (error: unknown) {
        console.error('[main:db:create-table] Error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Alter an existing table
  ipcMain.handle(
    'db:alter-table',
    async (_, { config, batch }: { config: ConnectionConfig; batch: AlterTableBatch }) => {
      console.log('[main:db:alter-table] Altering table:', batch.schema, batch.table)

      const adapter = getAdapter(config)
      const dbType = config.dbType || 'postgresql'
      const result: DDLResult = {
        success: true,
        executedSql: [],
        errors: []
      }

      try {
        // Build ALTER TABLE statements
        const queries = buildAlterTable(batch, dbType)
        const statements = queries.map((q) => ({ sql: q.sql, params: [] }))
        result.executedSql = queries.map((q) => q.sql)

        console.log('[main:db:alter-table] Executing:', result.executedSql)

        await adapter.executeTransaction(config, statements)

        return { success: true, data: result }
      } catch (error: unknown) {
        console.error('[main:db:alter-table] Error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        result.errors!.push(errorMessage)
        result.success = false
        return { success: true, data: result }
      }
    }
  )

  // Drop a table
  ipcMain.handle(
    'db:drop-table',
    async (
      _,
      {
        config,
        schema,
        table,
        cascade
      }: { config: ConnectionConfig; schema: string; table: string; cascade?: boolean }
    ) => {
      console.log('[main:db:drop-table] Dropping table:', schema, table)

      const adapter = getAdapter(config)
      const dbType = config.dbType || 'postgresql'

      try {
        const { sql } = buildDropTable(schema, table, cascade, dbType)
        console.log('[main:db:drop-table] Executing:', sql)

        await adapter.executeTransaction(config, [{ sql, params: [] }])

        return {
          success: true,
          data: { success: true, executedSql: [sql] }
        }
      } catch (error: unknown) {
        console.error('[main:db:drop-table] Error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Get table definition (reverse engineer from database)
  ipcMain.handle(
    'db:get-table-ddl',
    async (
      _,
      { config, schema, table }: { config: ConnectionConfig; schema: string; table: string }
    ) => {
      console.log('[main:db:get-table-ddl] Getting DDL for:', schema, table)

      try {
        const adapter = getAdapter(config)
        const definition = await adapter.getTableDDL(config, schema, table)
        return { success: true, data: definition }
      } catch (error: unknown) {
        console.error('[main:db:get-table-ddl] Error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Get available sequences
  ipcMain.handle('db:get-sequences', async (_, config: ConnectionConfig) => {
    console.log('[main:db:get-sequences] Fetching sequences')

    try {
      const adapter = getAdapter(config)
      const sequences = await adapter.getSequences(config)
      return { success: true, data: sequences }
    } catch (error: unknown) {
      console.error('[main:db:get-sequences] Error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Get custom types (enums, composites, etc.)
  ipcMain.handle('db:get-types', async (_, config: ConnectionConfig) => {
    console.log('[main:db:get-types] Fetching custom types')

    try {
      const adapter = getAdapter(config)
      const types = await adapter.getTypes(config)
      return { success: true, data: types }
    } catch (error: unknown) {
      console.error('[main:db:get-types] Error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Preview DDL without executing
  ipcMain.handle(
    'db:preview-ddl',
    (_, { definition, dbType }: { definition: TableDefinition; dbType?: string }) => {
      try {
        const targetDbType = (dbType || 'postgresql') as 'postgresql' | 'mysql' | 'sqlite' | 'mssql'
        const sql = buildPreviewDDL(definition, targetDbType)
        return { success: true, data: sql }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // ============================================
  // License Handlers
  // ============================================

  // Check current license status
  ipcMain.handle('license:check', async () => {
    try {
      const status = await checkLicense()
      return { success: true, data: status }
    } catch (error: unknown) {
      console.error('[main:license:check] Error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Activate a license
  ipcMain.handle('license:activate', async (_, request: LicenseActivationRequest) => {
    console.log('[main:license:activate] Activating license for:', request.email)
    try {
      const result = await activateLicense(request.key, request.email)
      if (result.success) {
        const status = await checkLicense()
        return { success: true, data: status }
      }
      return { success: false, error: result.error }
    } catch (error: unknown) {
      console.error('[main:license:activate] Error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Deactivate the current license
  ipcMain.handle('license:deactivate', async () => {
    console.log('[main:license:deactivate] Deactivating license')
    try {
      const result = await deactivateLicense()
      return { success: result.success, error: result.error }
    } catch (error: unknown) {
      console.error('[main:license:deactivate] Error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Offline activation (for development/testing)
  ipcMain.handle(
    'license:activate-offline',
    async (
      _,
      {
        key,
        email,
        type,
        daysValid
      }: { key: string; email: string; type?: 'individual' | 'team'; daysValid?: number }
    ) => {
      console.log('[main:license:activate-offline] Offline activation for:', email)
      try {
        activateLicenseOffline(key, email, type, daysValid)
        const status = await checkLicense()
        return { success: true, data: status }
      } catch (error: unknown) {
        console.error('[main:license:activate-offline] Error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Get customer portal URL for managing subscription
  ipcMain.handle('license:customer-portal', async () => {
    console.log('[main:license:customer-portal] Getting customer portal URL')
    try {
      const result = await getCustomerPortalUrl()
      if (result.success && result.url) {
        // Open the customer portal in the default browser
        shell.openExternal(result.url)
        return { success: true }
      }
      return { success: false, error: result.error }
    } catch (error: unknown) {
      console.error('[main:license:customer-portal] Error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // ============================================
  // Saved Queries Handlers
  // ============================================

  // List all saved queries
  ipcMain.handle('saved-queries:list', () => {
    try {
      const savedQueries = savedQueriesStore.get('savedQueries', [])
      return { success: true, data: savedQueries }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Add a new saved query
  ipcMain.handle('saved-queries:add', (_, query: SavedQuery) => {
    try {
      const savedQueries = savedQueriesStore.get('savedQueries', [])
      savedQueries.push(query)
      savedQueriesStore.set('savedQueries', savedQueries)
      return { success: true, data: query }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Update a saved query
  ipcMain.handle(
    'saved-queries:update',
    (_, { id, updates }: { id: string; updates: Partial<SavedQuery> }) => {
      try {
        const savedQueries = savedQueriesStore.get('savedQueries', [])
        const index = savedQueries.findIndex((q) => q.id === id)
        if (index === -1) {
          return { success: false, error: 'Saved query not found' }
        }
        savedQueries[index] = {
          ...savedQueries[index],
          ...updates,
          updatedAt: Date.now()
        }
        savedQueriesStore.set('savedQueries', savedQueries)
        return { success: true, data: savedQueries[index] }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Delete a saved query
  ipcMain.handle('saved-queries:delete', (_, id: string) => {
    try {
      const savedQueries = savedQueriesStore.get('savedQueries', [])
      const filtered = savedQueries.filter((q) => q.id !== id)
      savedQueriesStore.set('savedQueries', filtered)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Increment usage count for a saved query
  ipcMain.handle('saved-queries:increment-usage', (_, id: string) => {
    try {
      const savedQueries = savedQueriesStore.get('savedQueries', [])
      const index = savedQueries.findIndex((q) => q.id === id)
      if (index === -1) {
        return { success: false, error: 'Saved query not found' }
      }
      savedQueries[index] = {
        ...savedQueries[index],
        usageCount: savedQueries[index].usageCount + 1,
        lastUsedAt: Date.now()
      }
      savedQueriesStore.set('savedQueries', savedQueries)
      return { success: true, data: savedQueries[index] }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // ============================================
  // AI Handlers
  // ============================================

  // Get AI configuration
  ipcMain.handle('ai:get-config', () => {
    try {
      const config = getAIConfig()
      return { success: true, data: config }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Set AI configuration
  ipcMain.handle('ai:set-config', (_, config: AIConfig) => {
    try {
      setAIConfig(config)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Clear AI configuration
  ipcMain.handle('ai:clear-config', () => {
    try {
      clearAIConfig()
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Validate API key
  ipcMain.handle('ai:validate-key', async (_, config: AIConfig) => {
    try {
      const result = await validateAPIKey(config)
      return { success: true, data: result }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Chat with AI - returns structured JSON response
  ipcMain.handle(
    'ai:chat',
    async (
      _,
      {
        messages,
        schemas,
        dbType
      }: {
        messages: AIMessage[]
        schemas: SchemaInfo[]
        dbType: string
      }
    ) => {
      console.log('[main:ai:chat] Received chat request')
      console.log('[main:ai:chat] Messages count:', messages.length)

      try {
        const config = getAIConfig()
        if (!config) {
          return { success: false, error: 'AI not configured. Please set up your API key.' }
        }

        const result = await generateChatResponse(config, messages, schemas, dbType)

        if (result.success && result.data) {
          return {
            success: true,
            data: result.data // Returns AIStructuredResponse directly
          }
        } else {
          return { success: false, error: result.error }
        }
      } catch (error: unknown) {
        console.error('[main:ai:chat] Error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Get chat history for a connection
  ipcMain.handle('ai:get-chat-history', (_, connectionId: string) => {
    try {
      const history = getChatHistory(connectionId)
      return { success: true, data: history }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Save chat history for a connection
  ipcMain.handle(
    'ai:save-chat-history',
    (_, { connectionId, messages }: { connectionId: string; messages: StoredChatMessage[] }) => {
      try {
        saveChatHistory(connectionId, messages)
        return { success: true }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Clear chat history for a connection
  ipcMain.handle('ai:clear-chat-history', (_, connectionId: string) => {
    try {
      clearChatHistory(connectionId)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Get all chat sessions for a connection
  ipcMain.handle('ai:get-sessions', (_, connectionId: string) => {
    try {
      const sessions = getChatSessions(connectionId)
      return { success: true, data: sessions }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Get a specific chat session
  ipcMain.handle(
    'ai:get-session',
    (_, { connectionId, sessionId }: { connectionId: string; sessionId: string }) => {
      try {
        const session = getChatSession(connectionId, sessionId)
        return { success: true, data: session }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Create a new chat session
  ipcMain.handle(
    'ai:create-session',
    (_, { connectionId, title }: { connectionId: string; title?: string }) => {
      try {
        const session = createChatSession(connectionId, title)
        return { success: true, data: session }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Update a chat session
  ipcMain.handle(
    'ai:update-session',
    (
      _,
      {
        connectionId,
        sessionId,
        updates
      }: {
        connectionId: string
        sessionId: string
        updates: { messages?: StoredChatMessage[]; title?: string }
      }
    ) => {
      try {
        const session = updateChatSession(connectionId, sessionId, updates)
        return { success: true, data: session }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Delete a chat session
  ipcMain.handle(
    'ai:delete-session',
    (_, { connectionId, sessionId }: { connectionId: string; sessionId: string }) => {
      try {
        const deleted = deleteChatSession(connectionId, sessionId)
        return { success: true, data: deleted }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  await createWindow()

  // Initialize auto-updater (only runs in production)
  initAutoUpdater()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (mainWindow) {
      // Show hidden window when clicking dock icon
      mainWindow.show()
    }
  })
})

// macOS: set forceQuit flag before quitting
app.on('before-quit', () => {
  forceQuit = true
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
