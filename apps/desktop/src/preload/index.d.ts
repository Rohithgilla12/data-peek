import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  ConnectionConfig,
  IpcResponse,
  DatabaseSchema,
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
  SchemaInfo
} from '@shared/index'

// AI Types
type AIProvider = 'openai' | 'anthropic' | 'google' | 'groq' | 'ollama'

interface AIConfig {
  provider: AIProvider
  apiKey?: string
  model: string
  baseUrl?: string
}

interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// Structured AI response types
type AIResponseType = 'message' | 'query' | 'chart' | 'metric' | 'schema'

interface AIQueryResponse {
  type: 'query'
  message: string
  sql: string
  explanation: string
  warning?: string
}

interface AIChartResponse {
  type: 'chart'
  message: string
  title: string
  description?: string
  chartType: 'bar' | 'line' | 'pie' | 'area'
  sql: string
  xKey: string
  yKeys: string[]
}

interface AIMetricResponse {
  type: 'metric'
  message: string
  label: string
  sql: string
  format: 'number' | 'currency' | 'percent' | 'duration'
}

interface AISchemaResponse {
  type: 'schema'
  message: string
  tables: string[]
}

interface AIMessageResponse {
  type: 'message'
  message: string
}

type AIChatResponse =
  | AIQueryResponse
  | AIChartResponse
  | AIMetricResponse
  | AISchemaResponse
  | AIMessageResponse

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
  }
  db: {
    connect: (config: ConnectionConfig) => Promise<IpcResponse<void>>
    query: (config: ConnectionConfig, query: string) => Promise<IpcResponse<unknown>>
    schemas: (config: ConnectionConfig) => Promise<IpcResponse<DatabaseSchema>>
    execute: (config: ConnectionConfig, batch: EditBatch) => Promise<IpcResponse<EditResult>>
    previewSql: (
      batch: EditBatch
    ) => Promise<IpcResponse<Array<{ operationId: string; sql: string }>>>
    explain: (
      config: ConnectionConfig,
      query: string,
      analyze: boolean
    ) => Promise<IpcResponse<{ plan: unknown; durationMs: number }>>
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
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: DataPeekApi
  }
}
