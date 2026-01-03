import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  ConnectionConfig,
  IpcResponse,
  DatabaseSchemaResponse,
  EditBatch,
  EditResult,
  TableDefinition,
  AlterTableBatch,
  DDLResult,
  SequenceInfo,
  CustomTypeInfo,
  LicenseStatus,
  LicenseActivationRequest,
  LicenseType,
  SavedQuery,
  Snippet,
  SchemaInfo,
  AIProvider,
  AIConfig,
  AIMessage,
  AIChatResponse,
  StoredChatMessage,
  ChatSession,
  AIMultiProviderConfig,
  AIProviderConfig,
  BenchmarkResult,
  MultiStatementResultWithTelemetry,
  PerformanceAnalysisResult,
  PerformanceAnalysisConfig,
  QueryHistoryItemForAnalysis,
  ScheduledQuery,
  ScheduledQueryRun,
  CreateScheduledQueryInput,
  UpdateScheduledQueryInput,
  Dashboard,
  Widget,
  WidgetRunResult,
  CreateDashboardInput,
  UpdateDashboardInput,
  CreateWidgetInput,
  UpdateWidgetInput,
  WidgetLayout
} from '@shared/index'

// Re-export AI types for renderer consumers
export type {
  AIProvider,
  AIConfig,
  AIMessage,
  AIChatResponse,
  StoredChatMessage,
  ChatSession,
  AIMultiProviderConfig,
  AIProviderConfig
}

// Custom APIs for renderer
const api = {
  // Connection management
  connections: {
    list: (): Promise<IpcResponse<ConnectionConfig[]>> => ipcRenderer.invoke('connections:list'),
    add: (connection: ConnectionConfig): Promise<IpcResponse<ConnectionConfig>> =>
      ipcRenderer.invoke('connections:add', connection),
    update: (connection: ConnectionConfig): Promise<IpcResponse<ConnectionConfig>> =>
      ipcRenderer.invoke('connections:update', connection),
    delete: (id: string): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('connections:delete', id),
    // Listen for connection changes from other windows
    onConnectionsUpdated: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('connections:updated', handler)
      return () => ipcRenderer.removeListener('connections:updated', handler)
    }
  },
  // Database operations
  db: {
    connect: (config: ConnectionConfig): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('db:connect', config),
    query: (
      config: ConnectionConfig,
      query: string,
      executionId?: string,
      queryTimeoutMs?: number
    ): Promise<IpcResponse<unknown>> =>
      ipcRenderer.invoke('db:query', { config, query, executionId, queryTimeoutMs }),
    cancelQuery: (executionId: string): Promise<IpcResponse<{ cancelled: boolean }>> =>
      ipcRenderer.invoke('db:cancel-query', executionId),
    schemas: (
      config: ConnectionConfig,
      forceRefresh?: boolean
    ): Promise<IpcResponse<DatabaseSchemaResponse>> =>
      ipcRenderer.invoke('db:schemas', { config, forceRefresh }),
    invalidateSchemaCache: (config: ConnectionConfig): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('db:invalidate-schema-cache', config),
    execute: (config: ConnectionConfig, batch: EditBatch): Promise<IpcResponse<EditResult>> =>
      ipcRenderer.invoke('db:execute', { config, batch }),
    previewSql: (
      batch: EditBatch
    ): Promise<IpcResponse<Array<{ operationId: string; sql: string }>>> =>
      ipcRenderer.invoke('db:preview-sql', { batch }),
    explain: (
      config: ConnectionConfig,
      query: string,
      analyze: boolean
    ): Promise<IpcResponse<{ plan: unknown; durationMs: number }>> =>
      ipcRenderer.invoke('db:explain', { config, query, analyze }),
    // Query with telemetry collection
    queryWithTelemetry: (
      config: ConnectionConfig,
      query: string,
      executionId?: string,
      queryTimeoutMs?: number
    ): Promise<IpcResponse<MultiStatementResultWithTelemetry & { results: unknown[] }>> =>
      ipcRenderer.invoke('db:query-with-telemetry', { config, query, executionId, queryTimeoutMs }),
    // Benchmark query with multiple runs
    benchmark: (
      config: ConnectionConfig,
      query: string,
      runCount: number
    ): Promise<IpcResponse<BenchmarkResult>> =>
      ipcRenderer.invoke('db:benchmark', { config, query, runCount }),
    // Analyze query performance (on-demand)
    analyzePerformance: (
      config: ConnectionConfig,
      query: string,
      queryHistory: QueryHistoryItemForAnalysis[],
      analysisConfig?: Partial<PerformanceAnalysisConfig>
    ): Promise<IpcResponse<PerformanceAnalysisResult>> =>
      ipcRenderer.invoke('db:analyze-performance', { config, query, queryHistory, analysisConfig })
  },
  // DDL operations (Table Designer)
  ddl: {
    createTable: (
      config: ConnectionConfig,
      definition: TableDefinition
    ): Promise<IpcResponse<DDLResult>> =>
      ipcRenderer.invoke('db:create-table', { config, definition }),
    alterTable: (
      config: ConnectionConfig,
      batch: AlterTableBatch
    ): Promise<IpcResponse<DDLResult>> => ipcRenderer.invoke('db:alter-table', { config, batch }),
    dropTable: (
      config: ConnectionConfig,
      schema: string,
      table: string,
      cascade?: boolean
    ): Promise<IpcResponse<DDLResult>> =>
      ipcRenderer.invoke('db:drop-table', { config, schema, table, cascade }),
    getTableDDL: (
      config: ConnectionConfig,
      schema: string,
      table: string
    ): Promise<IpcResponse<TableDefinition>> =>
      ipcRenderer.invoke('db:get-table-ddl', { config, schema, table }),
    getSequences: (config: ConnectionConfig): Promise<IpcResponse<SequenceInfo[]>> =>
      ipcRenderer.invoke('db:get-sequences', config),
    getTypes: (config: ConnectionConfig): Promise<IpcResponse<CustomTypeInfo[]>> =>
      ipcRenderer.invoke('db:get-types', config),
    previewDDL: (definition: TableDefinition): Promise<IpcResponse<string>> =>
      ipcRenderer.invoke('db:preview-ddl', { definition })
  },
  // Menu event listeners
  menu: {
    onNewTab: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('menu:new-tab', handler)
      return () => ipcRenderer.removeListener('menu:new-tab', handler)
    },
    onCloseTab: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('menu:close-tab', handler)
      return () => ipcRenderer.removeListener('menu:close-tab', handler)
    },
    onExecuteQuery: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('menu:execute-query', handler)
      return () => ipcRenderer.removeListener('menu:execute-query', handler)
    },
    onFormatSql: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('menu:format-sql', handler)
      return () => ipcRenderer.removeListener('menu:format-sql', handler)
    },
    onClearResults: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('menu:clear-results', handler)
      return () => ipcRenderer.removeListener('menu:clear-results', handler)
    },
    onToggleSidebar: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('menu:toggle-sidebar', handler)
      return () => ipcRenderer.removeListener('menu:toggle-sidebar', handler)
    },
    onOpenSettings: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('menu:open-settings', handler)
      return () => ipcRenderer.removeListener('menu:open-settings', handler)
    },
    onSaveChanges: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('menu:save-changes', handler)
      return () => ipcRenderer.removeListener('menu:save-changes', handler)
    },
    onDiscardChanges: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('menu:discard-changes', handler)
      return () => ipcRenderer.removeListener('menu:discard-changes', handler)
    },
    onAddRow: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('menu:add-row', handler)
      return () => ipcRenderer.removeListener('menu:add-row', handler)
    }
  },
  // License management
  license: {
    check: (): Promise<IpcResponse<LicenseStatus>> => ipcRenderer.invoke('license:check'),
    activate: (request: LicenseActivationRequest): Promise<IpcResponse<LicenseStatus>> =>
      ipcRenderer.invoke('license:activate', request),
    deactivate: (): Promise<IpcResponse<void>> => ipcRenderer.invoke('license:deactivate'),
    activateOffline: (
      key: string,
      email: string,
      type?: LicenseType,
      daysValid?: number
    ): Promise<IpcResponse<LicenseStatus>> =>
      ipcRenderer.invoke('license:activate-offline', { key, email, type, daysValid }),
    openCustomerPortal: (): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('license:customer-portal')
  },
  // Saved queries management
  savedQueries: {
    list: (): Promise<IpcResponse<SavedQuery[]>> => ipcRenderer.invoke('saved-queries:list'),
    add: (query: SavedQuery): Promise<IpcResponse<SavedQuery>> =>
      ipcRenderer.invoke('saved-queries:add', query),
    update: (id: string, updates: Partial<SavedQuery>): Promise<IpcResponse<SavedQuery>> =>
      ipcRenderer.invoke('saved-queries:update', { id, updates }),
    delete: (id: string): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('saved-queries:delete', id),
    incrementUsage: (id: string): Promise<IpcResponse<SavedQuery>> =>
      ipcRenderer.invoke('saved-queries:increment-usage', id),
    onOpenDialog: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on('open-saved-queries', handler)
      return () => ipcRenderer.removeListener('open-saved-queries', handler)
    }
  },
  // Snippets management
  snippets: {
    list: (): Promise<IpcResponse<Snippet[]>> => ipcRenderer.invoke('snippets:list'),
    add: (snippet: Snippet): Promise<IpcResponse<Snippet>> =>
      ipcRenderer.invoke('snippets:add', snippet),
    update: (id: string, updates: Partial<Snippet>): Promise<IpcResponse<Snippet>> =>
      ipcRenderer.invoke('snippets:update', { id, updates }),
    delete: (id: string): Promise<IpcResponse<void>> => ipcRenderer.invoke('snippets:delete', id)
  },
  // Scheduled queries management
  scheduledQueries: {
    list: (): Promise<IpcResponse<ScheduledQuery[]>> =>
      ipcRenderer.invoke('scheduled-queries:list'),
    get: (id: string): Promise<IpcResponse<ScheduledQuery>> =>
      ipcRenderer.invoke('scheduled-queries:get', id),
    create: (input: CreateScheduledQueryInput): Promise<IpcResponse<ScheduledQuery>> =>
      ipcRenderer.invoke('scheduled-queries:create', input),
    update: (
      id: string,
      updates: UpdateScheduledQueryInput
    ): Promise<IpcResponse<ScheduledQuery>> =>
      ipcRenderer.invoke('scheduled-queries:update', { id, updates }),
    delete: (id: string): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('scheduled-queries:delete', id),
    pause: (id: string): Promise<IpcResponse<ScheduledQuery>> =>
      ipcRenderer.invoke('scheduled-queries:pause', id),
    resume: (id: string): Promise<IpcResponse<ScheduledQuery>> =>
      ipcRenderer.invoke('scheduled-queries:resume', id),
    runNow: (id: string): Promise<IpcResponse<ScheduledQueryRun>> =>
      ipcRenderer.invoke('scheduled-queries:run-now', id),
    getRuns: (queryId: string, limit?: number): Promise<IpcResponse<ScheduledQueryRun[]>> =>
      ipcRenderer.invoke('scheduled-queries:get-runs', { queryId, limit }),
    getAllRuns: (limit?: number): Promise<IpcResponse<ScheduledQueryRun[]>> =>
      ipcRenderer.invoke('scheduled-queries:get-all-runs', limit),
    clearRuns: (queryId: string): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('scheduled-queries:clear-runs', queryId),
    validateCron: (expression: string): Promise<IpcResponse<{ valid: boolean; error?: string }>> =>
      ipcRenderer.invoke('scheduled-queries:validate-cron', expression),
    getNextRuns: (
      expression: string,
      count?: number,
      timezone?: string
    ): Promise<IpcResponse<number[]>> =>
      ipcRenderer.invoke('scheduled-queries:get-next-runs', { expression, count, timezone })
  },
  // Dashboard management
  dashboards: {
    list: (): Promise<IpcResponse<Dashboard[]>> => ipcRenderer.invoke('dashboards:list'),
    get: (id: string): Promise<IpcResponse<Dashboard>> => ipcRenderer.invoke('dashboards:get', id),
    create: (input: CreateDashboardInput): Promise<IpcResponse<Dashboard>> =>
      ipcRenderer.invoke('dashboards:create', input),
    update: (id: string, updates: UpdateDashboardInput): Promise<IpcResponse<Dashboard>> =>
      ipcRenderer.invoke('dashboards:update', { id, updates }),
    delete: (id: string): Promise<IpcResponse<void>> => ipcRenderer.invoke('dashboards:delete', id),
    duplicate: (id: string): Promise<IpcResponse<Dashboard>> =>
      ipcRenderer.invoke('dashboards:duplicate', id),
    addWidget: (dashboardId: string, widget: CreateWidgetInput): Promise<IpcResponse<Widget>> =>
      ipcRenderer.invoke('dashboards:add-widget', { dashboardId, widget }),
    updateWidget: (
      dashboardId: string,
      widgetId: string,
      updates: UpdateWidgetInput
    ): Promise<IpcResponse<Widget>> =>
      ipcRenderer.invoke('dashboards:update-widget', { dashboardId, widgetId, updates }),
    deleteWidget: (dashboardId: string, widgetId: string): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('dashboards:delete-widget', { dashboardId, widgetId }),
    updateWidgetLayouts: (
      dashboardId: string,
      layouts: Record<string, WidgetLayout>
    ): Promise<IpcResponse<Dashboard>> =>
      ipcRenderer.invoke('dashboards:update-widget-layouts', { dashboardId, layouts }),
    executeWidget: (widget: Widget): Promise<IpcResponse<WidgetRunResult>> =>
      ipcRenderer.invoke('dashboards:execute-widget', widget),
    executeAllWidgets: (dashboardId: string): Promise<IpcResponse<WidgetRunResult[]>> =>
      ipcRenderer.invoke('dashboards:execute-all-widgets', dashboardId),
    getByTag: (tag: string): Promise<IpcResponse<Dashboard[]>> =>
      ipcRenderer.invoke('dashboards:get-by-tag', tag),
    getAllTags: (): Promise<IpcResponse<string[]>> => ipcRenderer.invoke('dashboards:get-all-tags'),
    updateRefreshSchedule: (
      dashboardId: string,
      schedule: Dashboard['refreshSchedule']
    ): Promise<IpcResponse<Dashboard>> =>
      ipcRenderer.invoke('dashboards:update-refresh-schedule', { dashboardId, schedule }),
    getNextRefreshTime: (
      schedule: NonNullable<Dashboard['refreshSchedule']>
    ): Promise<IpcResponse<number | null>> =>
      ipcRenderer.invoke('dashboards:get-next-refresh-time', schedule),
    validateCron: (expression: string): Promise<IpcResponse<{ valid: boolean; error?: string }>> =>
      ipcRenderer.invoke('dashboards:validate-cron', expression),
    getNextRefreshTimes: (
      expression: string,
      count?: number,
      timezone?: string
    ): Promise<IpcResponse<number[]>> =>
      ipcRenderer.invoke('dashboards:get-next-refresh-times', { expression, count, timezone }),
    onRefreshComplete: (
      callback: (data: { dashboardId: string; results: WidgetRunResult[] }) => void
    ): (() => void) => {
      const handler = (
        _: unknown,
        data: { dashboardId: string; results: WidgetRunResult[] }
      ): void => callback(data)
      ipcRenderer.on('dashboard:refresh-complete', handler)
      return () => ipcRenderer.removeListener('dashboard:refresh-complete', handler)
    }
  },
  // Auto-updater event listeners
  updater: {
    onUpdateAvailable: (callback: (version: string) => void): (() => void) => {
      const handler = (_: unknown, version: string): void => callback(version)
      ipcRenderer.on('updater:update-available', handler)
      return () => ipcRenderer.removeListener('updater:update-available', handler)
    },
    onUpdateDownloaded: (callback: (version: string) => void): (() => void) => {
      const handler = (_: unknown, version: string): void => callback(version)
      ipcRenderer.on('updater:update-downloaded', handler)
      return () => ipcRenderer.removeListener('updater:update-downloaded', handler)
    },
    onDownloadProgress: (callback: (percent: number) => void): (() => void) => {
      const handler = (_: unknown, percent: number): void => callback(percent)
      ipcRenderer.on('updater:download-progress', handler)
      return () => ipcRenderer.removeListener('updater:download-progress', handler)
    },
    onError: (callback: (message: string) => void): (() => void) => {
      const handler = (_: unknown, message: string): void => callback(message)
      ipcRenderer.on('updater:error', handler)
      return () => ipcRenderer.removeListener('updater:error', handler)
    },
    quitAndInstall: (): void => {
      ipcRenderer.send('updater:quit-and-install')
    }
  },
  ai: {
    getConfig: (): Promise<IpcResponse<AIConfig | null>> => ipcRenderer.invoke('ai:get-config'),
    setConfig: (config: AIConfig): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('ai:set-config', config),
    clearConfig: (): Promise<IpcResponse<void>> => ipcRenderer.invoke('ai:clear-config'),
    validateKey: (config: AIConfig): Promise<IpcResponse<{ valid: boolean; error?: string }>> =>
      ipcRenderer.invoke('ai:validate-key', config),
    chat: (
      messages: AIMessage[],
      schemas: SchemaInfo[],
      dbType: string
    ): Promise<IpcResponse<AIChatResponse>> =>
      ipcRenderer.invoke('ai:chat', { messages, schemas, dbType }),
    // Chat history persistence (legacy API)
    getChatHistory: (connectionId: string): Promise<IpcResponse<StoredChatMessage[]>> =>
      ipcRenderer.invoke('ai:get-chat-history', connectionId),
    saveChatHistory: (
      connectionId: string,
      messages: StoredChatMessage[]
    ): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('ai:save-chat-history', { connectionId, messages }),
    clearChatHistory: (connectionId: string): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('ai:clear-chat-history', connectionId),
    // Session-based API (new)
    getSessions: (connectionId: string): Promise<IpcResponse<ChatSession[]>> =>
      ipcRenderer.invoke('ai:get-sessions', connectionId),
    getSession: (
      connectionId: string,
      sessionId: string
    ): Promise<IpcResponse<ChatSession | null>> =>
      ipcRenderer.invoke('ai:get-session', { connectionId, sessionId }),
    createSession: (connectionId: string, title?: string): Promise<IpcResponse<ChatSession>> =>
      ipcRenderer.invoke('ai:create-session', { connectionId, title }),
    updateSession: (
      connectionId: string,
      sessionId: string,
      updates: { messages?: StoredChatMessage[]; title?: string }
    ): Promise<IpcResponse<ChatSession | null>> =>
      ipcRenderer.invoke('ai:update-session', { connectionId, sessionId, updates }),
    deleteSession: (connectionId: string, sessionId: string): Promise<IpcResponse<boolean>> =>
      ipcRenderer.invoke('ai:delete-session', { connectionId, sessionId }),
    // Multi-provider configuration
    getMultiProviderConfig: (): Promise<IpcResponse<AIMultiProviderConfig | null>> =>
      ipcRenderer.invoke('ai:get-multi-provider-config'),
    setMultiProviderConfig: (config: AIMultiProviderConfig | null): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('ai:set-multi-provider-config', config),
    getProviderConfig: (provider: AIProvider): Promise<IpcResponse<AIProviderConfig | null>> =>
      ipcRenderer.invoke('ai:get-provider-config', provider),
    setProviderConfig: (
      provider: AIProvider,
      config: AIProviderConfig
    ): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('ai:set-provider-config', { provider, config }),
    removeProviderConfig: (provider: AIProvider): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('ai:remove-provider-config', provider),
    setActiveProvider: (provider: AIProvider): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('ai:set-active-provider', provider),
    setActiveModel: (provider: AIProvider, model: string): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('ai:set-active-model', { provider, model })
  },
  files: {
    openFilePicker: (): Promise<string | null> => ipcRenderer.invoke('open-file-dialog')
  },
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('minimize-window'),
    maximize: (): Promise<void> => ipcRenderer.invoke('maximize-window'),
    close: (): Promise<void> => ipcRenderer.invoke('close-window')
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

// Type declarations for renderer
export type Api = typeof api
