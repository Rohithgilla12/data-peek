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
  Snippet
} from '@shared/index'

// AI Types
type AIProvider = 'openai' | 'anthropic' | 'google' | 'groq' | 'ollama'

interface AIConfig {
  provider: AIProvider
  apiKey?: string
  model: string
  baseUrl?: string
}

// Multi-provider config types
interface AIProviderConfig {
  apiKey?: string
  baseUrl?: string
}

type AIProviderConfigs = Partial<Record<AIProvider, AIProviderConfig>>

interface AIMultiProviderConfig {
  providers: AIProviderConfigs
  activeProvider: AIProvider
  activeModels: Partial<Record<AIProvider, string>>
}

interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// Structured AI response types
type AIResponseType = 'message' | 'query' | 'chart' | 'metric' | 'schema'

// Flat schema with nullable fields for AI provider compatibility
interface AIChatResponse {
  type: AIResponseType
  message: string
  // Query fields (null when type is not query)
  sql: string | null
  explanation: string | null
  warning: string | null
  requiresConfirmation: boolean | null
  // Chart fields (null when type is not chart)
  title: string | null
  description: string | null
  chartType: 'bar' | 'line' | 'pie' | 'area' | null
  xKey: string | null
  yKeys: string[] | null
  // Metric fields (null when type is not metric)
  label: string | null
  format: 'number' | 'currency' | 'percent' | 'duration' | null
  // Schema fields (null when type is not schema)
  tables: string[] | null
}

// Stored response data types (without message field since it's in content)
interface StoredQueryData {
  type: 'query'
  sql: string
  explanation: string
  warning?: string
}

interface StoredChartData {
  type: 'chart'
  title: string
  description?: string
  chartType: 'bar' | 'line' | 'pie' | 'area'
  sql: string
  xKey: string
  yKeys: string[]
}

interface StoredMetricData {
  type: 'metric'
  label: string
  sql: string
  format: 'number' | 'currency' | 'percent' | 'duration'
}

interface StoredSchemaData {
  type: 'schema'
  tables: string[]
}

type StoredResponseData =
  | StoredQueryData
  | StoredChartData
  | StoredMetricData
  | StoredSchemaData
  | null

// Stored chat message type (for persistence)
interface StoredChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  responseData?: StoredResponseData
  createdAt: string // ISO string for storage
}

// Chat session type - represents a single conversation thread
interface ChatSession {
  id: string
  title: string
  messages: StoredChatMessage[]
  createdAt: string // ISO string
  updatedAt: string // ISO string
}

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
    getConfig: () => Promise<IpcResponse<AIConfig | null>>
    setConfig: (config: AIConfig) => Promise<IpcResponse<void>>
    clearConfig: () => Promise<IpcResponse<void>>
    validateKey: (config: AIConfig) => Promise<IpcResponse<{ valid: boolean; error?: string }>>
    chat: (
      messages: AIMessage[],
      schemas: SchemaInfo[],
      dbType: string
    ) => Promise<IpcResponse<AIChatResponse>>
    // Chat history persistence (legacy API)
    getChatHistory: (connectionId: string) => Promise<IpcResponse<StoredChatMessage[]>>
    saveChatHistory: (
      connectionId: string,
      messages: StoredChatMessage[]
    ) => Promise<IpcResponse<void>>
    clearChatHistory: (connectionId: string) => Promise<IpcResponse<void>>
    // Session-based API (new)
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
    // Multi-provider configuration
    getMultiProviderConfig: () => Promise<IpcResponse<AIMultiProviderConfig | null>>
    setMultiProviderConfig: (config: AIMultiProviderConfig | null) => Promise<IpcResponse<void>>
    getProviderConfig: (provider: AIProvider) => Promise<IpcResponse<AIProviderConfig | null>>
    setProviderConfig: (
      provider: AIProvider,
      config: AIProviderConfig
    ) => Promise<IpcResponse<void>>
    removeProviderConfig: (provider: AIProvider) => Promise<IpcResponse<void>>
    setActiveProvider: (provider: AIProvider) => Promise<IpcResponse<void>>
    setActiveModel: (provider: AIProvider, model: string) => Promise<IpcResponse<void>>
  }
  files: {
    openFilePicker: () => Promise<string | null>
  }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: DataPeekApi
  }
}
