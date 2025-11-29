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
  SavedQuery
} from '@shared/index'

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
  }
  savedQueries: {
    list: () => Promise<IpcResponse<SavedQuery[]>>
    add: (query: SavedQuery) => Promise<IpcResponse<SavedQuery>>
    update: (id: string, updates: Partial<SavedQuery>) => Promise<IpcResponse<SavedQuery>>
    delete: (id: string) => Promise<IpcResponse<void>>
    incrementUsage: (id: string) => Promise<IpcResponse<SavedQuery>>
    onOpenDialog: (callback: () => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: DataPeekApi
  }
}
