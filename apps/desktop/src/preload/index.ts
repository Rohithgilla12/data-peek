import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
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
export type AIProvider = 'openai' | 'anthropic' | 'google' | 'groq' | 'ollama'

export interface AIConfig {
  provider: AIProvider
  apiKey?: string
  model: string
  baseUrl?: string
}

export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// Structured AI response types (matching main process)
export type AIResponseType = 'message' | 'query' | 'chart' | 'metric' | 'schema'

export interface AIQueryResponse {
  type: 'query'
  message: string
  sql: string
  explanation: string
  warning?: string
}

export interface AIChartResponse {
  type: 'chart'
  message: string
  title: string
  description?: string
  chartType: 'bar' | 'line' | 'pie' | 'area'
  sql: string
  xKey: string
  yKeys: string[]
}

export interface AIMetricResponse {
  type: 'metric'
  message: string
  label: string
  sql: string
  format: 'number' | 'currency' | 'percent' | 'duration'
}

export interface AISchemaResponse {
  type: 'schema'
  message: string
  tables: string[]
}

export interface AIMessageResponse {
  type: 'message'
  message: string
}

export type AIChatResponse =
  | AIQueryResponse
  | AIChartResponse
  | AIMetricResponse
  | AISchemaResponse
  | AIMessageResponse

// Stored response data types (without message field since it's in content)
export interface StoredQueryData {
  type: 'query'
  sql: string
  explanation: string
  warning?: string
}

export interface StoredChartData {
  type: 'chart'
  title: string
  description?: string
  chartType: 'bar' | 'line' | 'pie' | 'area'
  sql: string
  xKey: string
  yKeys: string[]
}

export interface StoredMetricData {
  type: 'metric'
  label: string
  sql: string
  format: 'number' | 'currency' | 'percent' | 'duration'
}

export interface StoredSchemaData {
  type: 'schema'
  tables: string[]
}

export type StoredResponseData =
  | StoredQueryData
  | StoredChartData
  | StoredMetricData
  | StoredSchemaData
  | null

// Stored chat message type (for persistence)
export interface StoredChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  responseData?: StoredResponseData
  createdAt: string // ISO string for storage
}

// Chat session type - represents a single conversation thread
export interface ChatSession {
  id: string
  title: string
  messages: StoredChatMessage[]
  createdAt: string // ISO string
  updatedAt: string // ISO string
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
    delete: (id: string): Promise<IpcResponse<void>> => ipcRenderer.invoke('connections:delete', id)
  },
  // Database operations
  db: {
    connect: (config: ConnectionConfig): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('db:connect', config),
    query: (config: ConnectionConfig, query: string): Promise<IpcResponse<unknown>> =>
      ipcRenderer.invoke('db:query', { config, query }),
    schemas: (config: ConnectionConfig): Promise<IpcResponse<DatabaseSchema>> =>
      ipcRenderer.invoke('db:schemas', config),
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
      ipcRenderer.invoke('db:explain', { config, query, analyze })
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
      ipcRenderer.invoke('license:activate-offline', { key, email, type, daysValid })
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
  // AI Assistant
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
      ipcRenderer.invoke('ai:delete-session', { connectionId, sessionId })
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
