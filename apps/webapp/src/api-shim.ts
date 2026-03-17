/**
 * Drop-in replacement for window.api (Electron's preload bridge).
 * Mirrors the exact shape from apps/desktop/src/preload/index.ts.
 * All RPC calls go through Socket.IO; Electron-only APIs are stubbed.
 */
import type { SocketTransport } from './socket'
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

export function createApi(t: SocketTransport) {
  return {
    connections: {
      list: (): Promise<IpcResponse<ConnectionConfig[]>> => t.invoke('connections:list'),
      add: (connection: ConnectionConfig): Promise<IpcResponse<ConnectionConfig>> =>
        t.invoke('connections:add', connection),
      update: (connection: ConnectionConfig): Promise<IpcResponse<ConnectionConfig>> =>
        t.invoke('connections:update', connection),
      delete: (id: string): Promise<IpcResponse<void>> => t.invoke('connections:delete', id),
      onConnectionsUpdated: (callback: () => void): (() => void) => t.on('connections:updated', callback)
    },

    db: {
      connect: (config: ConnectionConfig): Promise<IpcResponse<void>> =>
        t.invoke('db:connect', config),
      query: (
        config: ConnectionConfig,
        query: string,
        executionId?: string,
        queryTimeoutMs?: number
      ): Promise<IpcResponse<unknown>> =>
        t.invoke('db:query', { config, query, executionId, queryTimeoutMs }),
      cancelQuery: (executionId: string): Promise<IpcResponse<{ cancelled: boolean }>> =>
        t.invoke('db:cancel-query', executionId),
      schemas: (
        config: ConnectionConfig,
        forceRefresh?: boolean
      ): Promise<IpcResponse<DatabaseSchemaResponse>> =>
        t.invoke('db:schemas', { config, forceRefresh }),
      invalidateSchemaCache: (config: ConnectionConfig): Promise<IpcResponse<void>> =>
        t.invoke('db:invalidate-schema-cache', config),
      execute: (config: ConnectionConfig, batch: EditBatch): Promise<IpcResponse<EditResult>> =>
        t.invoke('db:execute', { config, batch }),
      previewSql: (
        batch: EditBatch
      ): Promise<IpcResponse<Array<{ operationId: string; sql: string }>>> =>
        t.invoke('db:preview-sql', { batch }),
      explain: (
        config: ConnectionConfig,
        query: string,
        analyze: boolean
      ): Promise<IpcResponse<{ plan: unknown; durationMs: number }>> =>
        t.invoke('db:explain', { config, query, analyze }),
      queryWithTelemetry: (
        config: ConnectionConfig,
        query: string,
        executionId?: string,
        queryTimeoutMs?: number
      ): Promise<IpcResponse<MultiStatementResultWithTelemetry & { results: unknown[] }>> =>
        t.invoke('db:query-with-telemetry', { config, query, executionId, queryTimeoutMs }),
      benchmark: (
        config: ConnectionConfig,
        query: string,
        runCount: number
      ): Promise<IpcResponse<BenchmarkResult>> =>
        t.invoke('db:benchmark', { config, query, runCount }),
      analyzePerformance: (
        config: ConnectionConfig,
        query: string,
        queryHistory: QueryHistoryItemForAnalysis[],
        analysisConfig?: Partial<PerformanceAnalysisConfig>
      ): Promise<IpcResponse<PerformanceAnalysisResult>> =>
        t.invoke('db:analyze-performance', { config, query, queryHistory, analysisConfig })
    },

    ddl: {
      createTable: (
        config: ConnectionConfig,
        definition: TableDefinition
      ): Promise<IpcResponse<DDLResult>> =>
        t.invoke('db:create-table', { config, definition }),
      alterTable: (
        config: ConnectionConfig,
        batch: AlterTableBatch
      ): Promise<IpcResponse<DDLResult>> => t.invoke('db:alter-table', { config, batch }),
      dropTable: (
        config: ConnectionConfig,
        schema: string,
        table: string,
        cascade?: boolean
      ): Promise<IpcResponse<DDLResult>> =>
        t.invoke('db:drop-table', { config, schema, table, cascade }),
      getTableDDL: (
        config: ConnectionConfig,
        schema: string,
        table: string
      ): Promise<IpcResponse<TableDefinition>> =>
        t.invoke('db:get-table-ddl', { config, schema, table }),
      getSequences: (config: ConnectionConfig): Promise<IpcResponse<SequenceInfo[]>> =>
        t.invoke('db:get-sequences', config),
      getTypes: (config: ConnectionConfig): Promise<IpcResponse<CustomTypeInfo[]>> =>
        t.invoke('db:get-types', config),
      previewDDL: (definition: TableDefinition): Promise<IpcResponse<string>> =>
        t.invoke('db:preview-ddl', { definition })
    },

    license: {
      check: (): Promise<IpcResponse<LicenseStatus>> => t.invoke('license:check'),
      activate: (request: LicenseActivationRequest): Promise<IpcResponse<LicenseStatus>> =>
        t.invoke('license:activate', request),
      deactivate: (): Promise<IpcResponse<void>> => t.invoke('license:deactivate'),
      activateOffline: (
        key: string,
        email: string,
        type?: LicenseType,
        daysValid?: number
      ): Promise<IpcResponse<LicenseStatus>> =>
        t.invoke('license:activate-offline', { key, email, type, daysValid }),
      openCustomerPortal: (): Promise<IpcResponse<void>> =>
        Promise.resolve({ success: true } as IpcResponse<void>)
    },

    savedQueries: {
      list: (): Promise<IpcResponse<SavedQuery[]>> => t.invoke('saved-queries:list'),
      add: (query: SavedQuery): Promise<IpcResponse<SavedQuery>> =>
        t.invoke('saved-queries:add', query),
      update: (id: string, updates: Partial<SavedQuery>): Promise<IpcResponse<SavedQuery>> =>
        t.invoke('saved-queries:update', { id, updates }),
      delete: (id: string): Promise<IpcResponse<void>> => t.invoke('saved-queries:delete', id),
      incrementUsage: (id: string): Promise<IpcResponse<SavedQuery>> =>
        t.invoke('saved-queries:increment-usage', id),
      onOpenDialog: (callback: () => void): (() => void) => t.on('open-saved-queries', callback)
    },

    snippets: {
      list: (): Promise<IpcResponse<Snippet[]>> => t.invoke('snippets:list'),
      add: (snippet: Snippet): Promise<IpcResponse<Snippet>> =>
        t.invoke('snippets:add', snippet),
      update: (id: string, updates: Partial<Snippet>): Promise<IpcResponse<Snippet>> =>
        t.invoke('snippets:update', { id, updates }),
      delete: (id: string): Promise<IpcResponse<void>> => t.invoke('snippets:delete', id)
    },

    scheduledQueries: {
      list: (): Promise<IpcResponse<ScheduledQuery[]>> =>
        t.invoke('scheduled-queries:list'),
      get: (id: string): Promise<IpcResponse<ScheduledQuery>> =>
        t.invoke('scheduled-queries:get', id),
      create: (input: CreateScheduledQueryInput): Promise<IpcResponse<ScheduledQuery>> =>
        t.invoke('scheduled-queries:create', input),
      update: (
        id: string,
        updates: UpdateScheduledQueryInput
      ): Promise<IpcResponse<ScheduledQuery>> =>
        t.invoke('scheduled-queries:update', { id, updates }),
      delete: (id: string): Promise<IpcResponse<void>> =>
        t.invoke('scheduled-queries:delete', id),
      pause: (id: string): Promise<IpcResponse<ScheduledQuery>> =>
        t.invoke('scheduled-queries:pause', id),
      resume: (id: string): Promise<IpcResponse<ScheduledQuery>> =>
        t.invoke('scheduled-queries:resume', id),
      runNow: (id: string): Promise<IpcResponse<ScheduledQueryRun>> =>
        t.invoke('scheduled-queries:run-now', id),
      getRuns: (queryId: string, limit?: number): Promise<IpcResponse<ScheduledQueryRun[]>> =>
        t.invoke('scheduled-queries:get-runs', { queryId, limit }),
      getAllRuns: (limit?: number): Promise<IpcResponse<ScheduledQueryRun[]>> =>
        t.invoke('scheduled-queries:get-all-runs', limit),
      clearRuns: (queryId: string): Promise<IpcResponse<void>> =>
        t.invoke('scheduled-queries:clear-runs', queryId),
      validateCron: (expression: string): Promise<IpcResponse<{ valid: boolean; error?: string }>> =>
        t.invoke('scheduled-queries:validate-cron', expression),
      getNextRuns: (
        expression: string,
        count?: number,
        timezone?: string
      ): Promise<IpcResponse<number[]>> =>
        t.invoke('scheduled-queries:get-next-runs', { expression, count, timezone })
    },

    dashboards: {
      list: (): Promise<IpcResponse<Dashboard[]>> => t.invoke('dashboards:list'),
      get: (id: string): Promise<IpcResponse<Dashboard>> => t.invoke('dashboards:get', id),
      create: (input: CreateDashboardInput): Promise<IpcResponse<Dashboard>> =>
        t.invoke('dashboards:create', input),
      update: (id: string, updates: UpdateDashboardInput): Promise<IpcResponse<Dashboard>> =>
        t.invoke('dashboards:update', { id, updates }),
      delete: (id: string): Promise<IpcResponse<void>> => t.invoke('dashboards:delete', id),
      duplicate: (id: string): Promise<IpcResponse<Dashboard>> =>
        t.invoke('dashboards:duplicate', id),
      addWidget: (dashboardId: string, widget: CreateWidgetInput): Promise<IpcResponse<Widget>> =>
        t.invoke('dashboards:add-widget', { dashboardId, widget }),
      updateWidget: (
        dashboardId: string,
        widgetId: string,
        updates: UpdateWidgetInput
      ): Promise<IpcResponse<Widget>> =>
        t.invoke('dashboards:update-widget', { dashboardId, widgetId, updates }),
      deleteWidget: (dashboardId: string, widgetId: string): Promise<IpcResponse<void>> =>
        t.invoke('dashboards:delete-widget', { dashboardId, widgetId }),
      updateWidgetLayouts: (
        dashboardId: string,
        layouts: Record<string, WidgetLayout>
      ): Promise<IpcResponse<Dashboard>> =>
        t.invoke('dashboards:update-widget-layouts', { dashboardId, layouts }),
      executeWidget: (widget: Widget): Promise<IpcResponse<WidgetRunResult>> =>
        t.invoke('dashboards:execute-widget', widget),
      executeAllWidgets: (dashboardId: string): Promise<IpcResponse<WidgetRunResult[]>> =>
        t.invoke('dashboards:execute-all-widgets', dashboardId),
      getByTag: (tag: string): Promise<IpcResponse<Dashboard[]>> =>
        t.invoke('dashboards:get-by-tag', tag),
      getAllTags: (): Promise<IpcResponse<string[]>> => t.invoke('dashboards:get-all-tags'),
      updateRefreshSchedule: (
        dashboardId: string,
        schedule: Dashboard['refreshSchedule']
      ): Promise<IpcResponse<Dashboard>> =>
        t.invoke('dashboards:update-refresh-schedule', { dashboardId, schedule }),
      getNextRefreshTime: (
        schedule: NonNullable<Dashboard['refreshSchedule']>
      ): Promise<IpcResponse<number | null>> =>
        t.invoke('dashboards:get-next-refresh-time', schedule),
      validateCron: (expression: string): Promise<IpcResponse<{ valid: boolean; error?: string }>> =>
        t.invoke('dashboards:validate-cron', expression),
      getNextRefreshTimes: (
        expression: string,
        count?: number,
        timezone?: string
      ): Promise<IpcResponse<number[]>> =>
        t.invoke('dashboards:get-next-refresh-times', { expression, count, timezone }),
      onRefreshComplete: (
        callback: (data: { dashboardId: string; results: WidgetRunResult[] }) => void
      ): (() => void) => t.on('dashboard:refresh-complete', callback)
    },

    ai: {
      getConfig: (): Promise<IpcResponse<AIConfig | null>> => t.invoke('ai:get-config'),
      setConfig: (config: AIConfig): Promise<IpcResponse<void>> =>
        t.invoke('ai:set-config', config),
      clearConfig: (): Promise<IpcResponse<void>> => t.invoke('ai:clear-config'),
      validateKey: (config: AIConfig): Promise<IpcResponse<{ valid: boolean; error?: string }>> =>
        t.invoke('ai:validate-key', config),
      chat: (
        messages: AIMessage[],
        schemas: SchemaInfo[],
        dbType: string
      ): Promise<IpcResponse<AIChatResponse>> =>
        t.invoke('ai:chat', { messages, schemas, dbType }),
      getChatHistory: (connectionId: string): Promise<IpcResponse<StoredChatMessage[]>> =>
        t.invoke('ai:get-chat-history', connectionId),
      saveChatHistory: (
        connectionId: string,
        messages: StoredChatMessage[]
      ): Promise<IpcResponse<void>> =>
        t.invoke('ai:save-chat-history', { connectionId, messages }),
      clearChatHistory: (connectionId: string): Promise<IpcResponse<void>> =>
        t.invoke('ai:clear-chat-history', connectionId),
      getSessions: (connectionId: string): Promise<IpcResponse<ChatSession[]>> =>
        t.invoke('ai:get-sessions', connectionId),
      getSession: (
        connectionId: string,
        sessionId: string
      ): Promise<IpcResponse<ChatSession | null>> =>
        t.invoke('ai:get-session', { connectionId, sessionId }),
      createSession: (connectionId: string, title?: string): Promise<IpcResponse<ChatSession>> =>
        t.invoke('ai:create-session', { connectionId, title }),
      updateSession: (
        connectionId: string,
        sessionId: string,
        updates: { messages?: StoredChatMessage[]; title?: string }
      ): Promise<IpcResponse<ChatSession | null>> =>
        t.invoke('ai:update-session', { connectionId, sessionId, updates }),
      deleteSession: (connectionId: string, sessionId: string): Promise<IpcResponse<boolean>> =>
        t.invoke('ai:delete-session', { connectionId, sessionId }),
      getMultiProviderConfig: (): Promise<IpcResponse<AIMultiProviderConfig | null>> =>
        t.invoke('ai:get-multi-provider-config'),
      setMultiProviderConfig: (config: AIMultiProviderConfig | null): Promise<IpcResponse<void>> =>
        t.invoke('ai:set-multi-provider-config', config),
      getProviderConfig: (provider: AIProvider): Promise<IpcResponse<AIProviderConfig | null>> =>
        t.invoke('ai:get-provider-config', provider),
      setProviderConfig: (
        provider: AIProvider,
        config: AIProviderConfig
      ): Promise<IpcResponse<void>> =>
        t.invoke('ai:set-provider-config', { provider, config }),
      removeProviderConfig: (provider: AIProvider): Promise<IpcResponse<void>> =>
        t.invoke('ai:remove-provider-config', provider),
      setActiveProvider: (provider: AIProvider): Promise<IpcResponse<void>> =>
        t.invoke('ai:set-active-provider', provider),
      setActiveModel: (provider: AIProvider, model: string): Promise<IpcResponse<void>> =>
        t.invoke('ai:set-active-model', { provider, model })
    },

    // Electron-only — stubbed as no-ops
    menu: {
      onNewTab: (_cb: () => void): (() => void) => () => {},
      onCloseTab: (_cb: () => void): (() => void) => () => {},
      onExecuteQuery: (_cb: () => void): (() => void) => () => {},
      onFormatSql: (_cb: () => void): (() => void) => () => {},
      onClearResults: (_cb: () => void): (() => void) => () => {},
      onToggleSidebar: (_cb: () => void): (() => void) => () => {},
      onOpenSettings: (_cb: () => void): (() => void) => () => {},
      onSaveChanges: (_cb: () => void): (() => void) => () => {},
      onDiscardChanges: (_cb: () => void): (() => void) => () => {},
      onAddRow: (_cb: () => void): (() => void) => () => {}
    },

    updater: {
      onUpdateAvailable: (_cb: (version: string) => void): (() => void) => () => {},
      onUpdateDownloaded: (_cb: (version: string) => void): (() => void) => () => {},
      onDownloadProgress: (_cb: (percent: number) => void): (() => void) => () => {},
      onError: (_cb: (message: string) => void): (() => void) => () => {},
      quitAndInstall: (): void => {}
    },

    files: {
      openFilePicker: (): Promise<string | null> => Promise.resolve(null)
    },

    window: {
      minimize: (): Promise<void> => Promise.resolve(),
      maximize: (): Promise<void> => Promise.resolve(),
      close: (): Promise<void> => Promise.resolve()
    }
  }
}

export type Api = ReturnType<typeof createApi>
