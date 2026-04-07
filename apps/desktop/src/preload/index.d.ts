import { ElectronAPI } from '@electron-toolkit/preload'
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
  SchemaInfo,
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
  WidgetLayout,
  Snippet,
  ColumnStats,
  ColumnStatsRequest,
  CsvImportRequest,
  CsvImportResult,
  CsvImportProgress,
  DataGenConfig,
  DataGenResult,
  DataGenProgress,
  PgNotificationEvent,
  PgNotificationChannel,
  ActiveQuery,
  TableSizeInfo,
  CacheStats,
  LockInfo,
  DatabaseSizeInfo,
  PgExportOptions,
  PgExportProgress,
  PgExportResult,
  PgImportOptions,
  PgImportProgress,
  PgImportResult
} from '@shared/index'

// AI types - imported from shared
import type {
  AIConfig,
  AIMessage,
  AIChatResult,
  StoredChatMessage,
  ChatSession
} from '@shared/index'

interface DataPeekApi {
  connections: {
    list: () => Promise<IpcResponse<ConnectionConfig[]>>
    add: (connection: ConnectionConfig) => Promise<IpcResponse<ConnectionConfig>>
    update: (connection: ConnectionConfig) => Promise<IpcResponse<ConnectionConfig>>
    delete: (id: string) => Promise<IpcResponse<void>>
    // Listen for connection changes from other windows
    onConnectionsUpdated: (callback: () => void) => () => void
  }
  db: {
    connect: (config: ConnectionConfig) => Promise<IpcResponse<void>>
    query: (
      config: ConnectionConfig,
      query: string,
      executionId?: string,
      queryTimeoutMs?: number
    ) => Promise<IpcResponse<unknown>>
    cancelQuery: (executionId: string) => Promise<IpcResponse<{ cancelled: boolean }>>
    schemas: (
      config: ConnectionConfig,
      forceRefresh?: boolean
    ) => Promise<IpcResponse<DatabaseSchemaResponse>>
    invalidateSchemaCache: (config: ConnectionConfig) => Promise<IpcResponse<void>>
    execute: (config: ConnectionConfig, batch: EditBatch) => Promise<IpcResponse<EditResult>>
    previewSql: (
      batch: EditBatch
    ) => Promise<IpcResponse<Array<{ operationId: string; sql: string }>>>
    explain: (
      config: ConnectionConfig,
      query: string,
      analyze: boolean
    ) => Promise<IpcResponse<{ plan: unknown; durationMs: number }>>
    queryWithTelemetry: (
      config: ConnectionConfig,
      query: string,
      executionId?: string,
      queryTimeoutMs?: number
    ) => Promise<IpcResponse<MultiStatementResultWithTelemetry & { results: unknown[] }>>
    benchmark: (
      config: ConnectionConfig,
      query: string,
      runCount: number
    ) => Promise<IpcResponse<BenchmarkResult>>
    analyzePerformance: (
      config: ConnectionConfig,
      query: string,
      queryHistory: QueryHistoryItemForAnalysis[],
      analysisConfig?: Partial<PerformanceAnalysisConfig>
    ) => Promise<IpcResponse<PerformanceAnalysisResult>>
    columnStats: (
      config: ConnectionConfig,
      request: ColumnStatsRequest
    ) => Promise<IpcResponse<ColumnStats>>
    importCsv: (
      config: ConnectionConfig,
      request: CsvImportRequest,
      rows: unknown[][]
    ) => Promise<IpcResponse<CsvImportResult>>
    cancelImport: () => Promise<IpcResponse<void>>
    onImportProgress: (callback: (progress: CsvImportProgress) => void) => () => void
    generateData: (
      config: ConnectionConfig,
      genConfig: DataGenConfig
    ) => Promise<IpcResponse<DataGenResult>>
    cancelGenerate: () => Promise<IpcResponse<void>>
    generatePreview: (
      config: ConnectionConfig,
      genConfig: DataGenConfig
    ) => Promise<IpcResponse<{ rows: unknown[][] }>>
    onGenerateProgress: (callback: (progress: DataGenProgress) => void) => () => void
  }
  ddl: {
    createTable: (
      config: ConnectionConfig,
      definition: TableDefinition
    ) => Promise<IpcResponse<DDLResult>>
    alterTable: (
      config: ConnectionConfig,
      batch: AlterTableBatch
    ) => Promise<IpcResponse<DDLResult>>
    dropTable: (
      config: ConnectionConfig,
      schema: string,
      table: string,
      cascade?: boolean
    ) => Promise<IpcResponse<DDLResult>>
    getTableDDL: (
      config: ConnectionConfig,
      schema: string,
      table: string
    ) => Promise<IpcResponse<TableDefinition>>
    getSequences: (config: ConnectionConfig) => Promise<IpcResponse<SequenceInfo[]>>
    getTypes: (config: ConnectionConfig) => Promise<IpcResponse<CustomTypeInfo[]>>
    previewDDL: (definition: TableDefinition) => Promise<IpcResponse<string>>
  }
  menu: {
    onNewTab: (callback: () => void) => () => void
    onCloseTab: (callback: () => void) => () => void
    onExecuteQuery: (callback: () => void) => () => void
    onFormatSql: (callback: () => void) => () => void
    onClearResults: (callback: () => void) => () => void
    onToggleSidebar: (callback: () => void) => () => void
    onOpenSettings: (callback: () => void) => () => void
    onSaveChanges: (callback: () => void) => () => void
    onDiscardChanges: (callback: () => void) => () => void
    onAddRow: (callback: () => void) => () => void
  }
  license: {
    check: () => Promise<IpcResponse<LicenseStatus>>
    activate: (request: LicenseActivationRequest) => Promise<IpcResponse<LicenseStatus>>
    deactivate: () => Promise<IpcResponse<void>>
    activateOffline: (
      key: string,
      email: string,
      type?: LicenseType,
      daysValid?: number
    ) => Promise<IpcResponse<LicenseStatus>>
    openCustomerPortal: () => Promise<IpcResponse<void>>
  }
  savedQueries: {
    list: () => Promise<IpcResponse<SavedQuery[]>>
    add: (query: SavedQuery) => Promise<IpcResponse<SavedQuery>>
    update: (id: string, updates: Partial<SavedQuery>) => Promise<IpcResponse<SavedQuery>>
    delete: (id: string) => Promise<IpcResponse<void>>
    incrementUsage: (id: string) => Promise<IpcResponse<SavedQuery>>
    onOpenDialog: (callback: () => void) => () => void
  }
  snippets: {
    list: () => Promise<IpcResponse<Snippet[]>>
    add: (snippet: Snippet) => Promise<IpcResponse<Snippet>>
    update: (id: string, updates: Partial<Snippet>) => Promise<IpcResponse<Snippet>>
    delete: (id: string) => Promise<IpcResponse<void>>
  }
  scheduledQueries: {
    list: () => Promise<IpcResponse<ScheduledQuery[]>>
    get: (id: string) => Promise<IpcResponse<ScheduledQuery>>
    create: (input: CreateScheduledQueryInput) => Promise<IpcResponse<ScheduledQuery>>
    update: (id: string, updates: UpdateScheduledQueryInput) => Promise<IpcResponse<ScheduledQuery>>
    delete: (id: string) => Promise<IpcResponse<void>>
    pause: (id: string) => Promise<IpcResponse<ScheduledQuery>>
    resume: (id: string) => Promise<IpcResponse<ScheduledQuery>>
    runNow: (id: string) => Promise<IpcResponse<ScheduledQueryRun>>
    getRuns: (queryId: string, limit?: number) => Promise<IpcResponse<ScheduledQueryRun[]>>
    getAllRuns: (limit?: number) => Promise<IpcResponse<ScheduledQueryRun[]>>
    clearRuns: (queryId: string) => Promise<IpcResponse<void>>
    validateCron: (expression: string) => Promise<IpcResponse<{ valid: boolean; error?: string }>>
    getNextRuns: (
      expression: string,
      count?: number,
      timezone?: string
    ) => Promise<IpcResponse<number[]>>
  }
  dashboards: {
    list: () => Promise<IpcResponse<Dashboard[]>>
    get: (id: string) => Promise<IpcResponse<Dashboard>>
    create: (input: CreateDashboardInput) => Promise<IpcResponse<Dashboard>>
    update: (id: string, updates: UpdateDashboardInput) => Promise<IpcResponse<Dashboard>>
    delete: (id: string) => Promise<IpcResponse<void>>
    duplicate: (id: string) => Promise<IpcResponse<Dashboard>>
    addWidget: (dashboardId: string, widget: CreateWidgetInput) => Promise<IpcResponse<Widget>>
    updateWidget: (
      dashboardId: string,
      widgetId: string,
      updates: UpdateWidgetInput
    ) => Promise<IpcResponse<Widget>>
    deleteWidget: (dashboardId: string, widgetId: string) => Promise<IpcResponse<void>>
    updateWidgetLayouts: (
      dashboardId: string,
      layouts: Record<string, WidgetLayout>
    ) => Promise<IpcResponse<Dashboard>>
    executeWidget: (widget: Widget) => Promise<IpcResponse<WidgetRunResult>>
    executeAllWidgets: (dashboardId: string) => Promise<IpcResponse<WidgetRunResult[]>>
    getByTag: (tag: string) => Promise<IpcResponse<Dashboard[]>>
    getAllTags: () => Promise<IpcResponse<string[]>>
    updateRefreshSchedule: (
      dashboardId: string,
      schedule: Dashboard['refreshSchedule']
    ) => Promise<IpcResponse<Dashboard>>
    getNextRefreshTime: (
      schedule: NonNullable<Dashboard['refreshSchedule']>
    ) => Promise<IpcResponse<number | null>>
    validateCron: (expression: string) => Promise<IpcResponse<{ valid: boolean; error?: string }>>
    getNextRefreshTimes: (
      expression: string,
      count?: number,
      timezone?: string
    ) => Promise<IpcResponse<number[]>>
    onRefreshComplete: (
      callback: (data: { dashboardId: string; results: WidgetRunResult[] }) => void
    ) => () => void
  }
  updater: {
    onUpdateAvailable: (callback: (version: string) => void) => () => void
    onUpdateDownloaded: (callback: (version: string) => void) => () => void
    onDownloadProgress: (callback: (percent: number) => void) => () => void
    onError: (callback: (message: string) => void) => () => void
    quitAndInstall: () => void
  }
  ai: {
    // Configuration
    getConfig: () => Promise<IpcResponse<AIConfig | null>>
    setConfig: (config: AIConfig) => Promise<IpcResponse<void>>
    clearConfig: () => Promise<IpcResponse<void>>
    validateKey: (apiKey: string) => Promise<IpcResponse<{ valid: boolean; error?: string }>>
    // Chat (with streaming)
    chat: (
      messages: AIMessage[],
      schemas: SchemaInfo[],
      dbType: string
    ) => Promise<IpcResponse<AIChatResult>>
    // Streaming events
    onStreamStart: (callback: () => void) => () => void
    onStreamDelta: (callback: (text: string) => void) => () => void
    onStreamEnd: (callback: () => void) => () => void
    // Sessions
    getSessions: (connectionId: string) => Promise<IpcResponse<ChatSession[]>>
    getSession: (
      connectionId: string,
      sessionId: string
    ) => Promise<IpcResponse<ChatSession | null>>
    createSession: (connectionId: string, title?: string) => Promise<IpcResponse<ChatSession>>
    updateSession: (
      connectionId: string,
      sessionId: string,
      updates: { messages?: StoredChatMessage[]; title?: string }
    ) => Promise<IpcResponse<ChatSession | null>>
    deleteSession: (connectionId: string, sessionId: string) => Promise<IpcResponse<boolean>>
  }
  pgNotify: {
    subscribe: (
      connectionId: string,
      config: ConnectionConfig,
      channel: string
    ) => Promise<IpcResponse<void>>
    unsubscribe: (connectionId: string, channel: string) => Promise<IpcResponse<void>>
    send: (config: ConnectionConfig, channel: string, payload: string) => Promise<IpcResponse<void>>
    getChannels: (connectionId: string) => Promise<IpcResponse<PgNotificationChannel[]>>
    getHistory: (
      connectionId: string,
      limit?: number
    ) => Promise<IpcResponse<PgNotificationEvent[]>>
    clearHistory: (connectionId: string) => Promise<IpcResponse<void>>
    onEvent: (callback: (event: PgNotificationEvent) => void) => () => void
  }
  health: {
    activeQueries: (config: ConnectionConfig) => Promise<IpcResponse<ActiveQuery[]>>
    tableSizes: (
      config: ConnectionConfig,
      schema?: string
    ) => Promise<IpcResponse<{ dbSize: DatabaseSizeInfo; tables: TableSizeInfo[] }>>
    cacheStats: (config: ConnectionConfig) => Promise<IpcResponse<CacheStats>>
    locks: (config: ConnectionConfig) => Promise<IpcResponse<LockInfo[]>>
    killQuery: (
      config: ConnectionConfig,
      pid: number
    ) => Promise<IpcResponse<{ success: boolean; error?: string }>>
  }
  pgDump: {
    export: (
      config: ConnectionConfig,
      options: PgExportOptions
    ) => Promise<IpcResponse<PgExportResult>>
    cancelExport: () => Promise<IpcResponse<void>>
    onExportProgress: (callback: (progress: PgExportProgress) => void) => () => void
    import: (
      config: ConnectionConfig,
      options: PgImportOptions
    ) => Promise<IpcResponse<PgImportResult>>
    cancelImport: () => Promise<IpcResponse<void>>
    onImportProgress: (callback: (progress: PgImportProgress) => void) => () => void
  }
  files: {
    openFilePicker: () => Promise<string | null>
  }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    setConnectionInfo: (connectionName: string | null) => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: DataPeekApi
  }
}
