import { create } from 'zustand'
import {
  ConnectionConfig,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  DatabaseType,
  CustomTypeInfo,
  MSSQLConnectionOptions,
  SSHConfig,
  SQLiteConnectionOptions
} from '@shared/index'
import { notify } from './notification-store'

// Helper to format timestamp as relative time
function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`
  return `${Math.floor(seconds / 86400)} days ago`
}

export interface Connection {
  id: string
  name: string
  host: string
  port: number
  database: string
  user?: string // Optional for MSSQL with Azure AD authentication
  password?: string
  ssl?: boolean
  ssh?: boolean
  dstPort: number
  sshConfig?: SSHConfig
  group?: string
  dbType: DatabaseType
  mssqlOptions?: MSSQLConnectionOptions
  sqliteOptions?: SQLiteConnectionOptions
}

export interface ConnectionWithStatus extends Connection {
  isConnected: boolean
  isConnecting: boolean
  error?: string
}

// Re-export shared types for convenience
export type Column = ColumnInfo
export type Table = TableInfo
export type Schema = SchemaInfo

interface ConnectionState {
  // Connection management
  connections: ConnectionWithStatus[]
  activeConnectionId: string | null
  isInitialized: boolean

  // Schema for active connection
  schemas: Schema[]
  customTypes: CustomTypeInfo[]
  isLoadingSchema: boolean
  schemaError: string | null
  schemaFromCache: boolean
  schemaFetchedAt: number | null
  isRefreshingSchema: boolean // Background refresh in progress

  // Actions
  initializeConnections: () => Promise<void>
  setConnections: (connections: ConnectionWithStatus[]) => void
  addConnection: (connection: Connection) => void
  removeConnection: (id: string) => Promise<void>
  updateConnection: (id: string, updates: Partial<Connection>) => Promise<void>

  setActiveConnection: (id: string | null) => void
  setConnectionStatus: (
    id: string,
    status: Partial<Pick<ConnectionWithStatus, 'isConnected' | 'isConnecting' | 'error'>>
  ) => void

  setSchemas: (schemas: Schema[]) => void
  setLoadingSchema: (loading: boolean) => void
  fetchSchemas: (connectionId?: string, forceRefresh?: boolean) => Promise<void>
  refreshSchemasInBackground: (connectionId?: string) => Promise<void>

  // Computed
  getActiveConnection: () => ConnectionWithStatus | null
  getEnumValues: (dataType: string) => string[] | undefined
}

// Helper to convert ConnectionConfig to ConnectionWithStatus
const toConnectionWithStatus = (config: ConnectionConfig): ConnectionWithStatus => ({
  ...config,
  // Default to postgresql for backward compatibility with existing connections
  dbType: config.dbType || 'postgresql',
  // Ensure dstPort is set (defaults to port if not specified)
  dstPort: config.dstPort || config.port,
  isConnected: false,
  isConnecting: false
})

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  // Initial state
  connections: [],
  activeConnectionId: null,
  isInitialized: false,
  schemas: [],
  customTypes: [],
  isLoadingSchema: false,
  schemaError: null,
  schemaFromCache: false,
  schemaFetchedAt: null,
  isRefreshingSchema: false,

  // Actions
  initializeConnections: async () => {
    if (get().isInitialized) return

    try {
      const result = await window.api.connections.list()
      if (result.success && result.data) {
        set({
          connections: result.data.map(toConnectionWithStatus),
          isInitialized: true
        })
      } else {
        console.error('Failed to load connections:', result.error)
        set({ isInitialized: true })
      }
    } catch (error) {
      console.error('Failed to initialize connections:', error)
      set({ isInitialized: true })
    }
  },

  setConnections: (connections) => set({ connections }),

  addConnection: (connection) =>
    set((state) => ({
      connections: [
        ...state.connections,
        {
          ...connection,
          dstPort: connection.dstPort || connection.port,
          isConnected: false,
          isConnecting: false
        }
      ]
    })),

  removeConnection: async (id) => {
    try {
      const result = await window.api.connections.delete(id)
      if (result.success) {
        set((state) => ({
          connections: state.connections.filter((c) => c.id !== id),
          activeConnectionId: state.activeConnectionId === id ? null : state.activeConnectionId
        }))
      } else {
        console.error('Failed to delete connection:', result.error)
      }
    } catch (error) {
      console.error('Failed to delete connection:', error)
    }
  },

  updateConnection: async (id, updates) => {
    const connection = get().connections.find((c) => c.id === id)
    if (!connection) return

    const updated = { ...connection, ...updates }
    try {
      const result = await window.api.connections.update(updated)
      if (result.success) {
        set((state) => ({
          connections: state.connections.map((c) => (c.id === id ? { ...c, ...updates } : c))
        }))
      } else {
        console.error('Failed to update connection:', result.error)
      }
    } catch (error) {
      console.error('Failed to update connection:', error)
    }
  },

  setActiveConnection: (id) => {
    set({ activeConnectionId: id })

    // Fetch schemas when connection changes
    if (id) {
      get().fetchSchemas(id)
    } else {
      set({
        schemas: [],
        customTypes: [],
        schemaError: null,
        schemaFromCache: false,
        schemaFetchedAt: null
      })
    }
  },

  fetchSchemas: async (connectionId?: string, forceRefresh?: boolean) => {
    const id = connectionId ?? get().activeConnectionId
    if (!id) return

    const connection = get().connections.find((c) => c.id === id)
    if (!connection) return

    set({
      isLoadingSchema: true,
      schemas: [],
      customTypes: [],
      schemaError: null,
      schemaFromCache: false,
      schemaFetchedAt: null
    })

    try {
      // Fetch schemas (with optional force refresh)
      const schemasResult = await window.api.db.schemas(connection, forceRefresh)

      if (schemasResult.success && schemasResult.data) {
        const { schemas, customTypes, fetchedAt, fromCache, stale, refreshError } =
          schemasResult.data

        set({
          schemas,
          customTypes: customTypes ?? [],
          isLoadingSchema: false,
          schemaError: null,
          schemaFromCache: fromCache ?? false,
          schemaFetchedAt: fetchedAt
        })

        // If loaded from cache, trigger background refresh
        if (fromCache && !stale) {
          // Small delay to let UI render first
          setTimeout(() => {
            get().refreshSchemasInBackground(id)
          }, 100)
        }

        // Show notification if stale cache was used due to error
        if (stale && refreshError) {
          notify.warning(
            'Using cached schema',
            `Could not refresh: ${refreshError}. Using cached data from ${formatRelativeTime(fetchedAt)}.`
          )
        }
      } else {
        set({
          schemas: [],
          customTypes: [],
          isLoadingSchema: false,
          schemaError: schemasResult.error || 'Failed to fetch schemas'
        })
      }
    } catch (error) {
      console.error('Failed to fetch schemas:', error)
      set({
        schemas: [],
        customTypes: [],
        isLoadingSchema: false,
        schemaError: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  },

  refreshSchemasInBackground: async (connectionId?: string) => {
    const id = connectionId ?? get().activeConnectionId
    if (!id) return

    const connection = get().connections.find((c) => c.id === id)
    if (!connection) return

    // Don't refresh if already refreshing or if this isn't the active connection anymore
    if (get().isRefreshingSchema || get().activeConnectionId !== id) return

    set({ isRefreshingSchema: true })

    try {
      const schemasResult = await window.api.db.schemas(connection, true) // Force refresh

      // Only update if this is still the active connection
      if (get().activeConnectionId !== id) {
        set({ isRefreshingSchema: false })
        return
      }

      if (schemasResult.success && schemasResult.data) {
        const { schemas, customTypes, fetchedAt } = schemasResult.data
        const currentSchemas = get().schemas

        // Check if schemas actually changed
        const schemasChanged = JSON.stringify(schemas) !== JSON.stringify(currentSchemas)

        if (schemasChanged) {
          set({
            schemas,
            customTypes: customTypes ?? [],
            schemaFromCache: false,
            schemaFetchedAt: fetchedAt,
            isRefreshingSchema: false
          })

          notify.info('Schema updated', 'Database schema has been refreshed with latest changes.')
        } else {
          set({
            schemaFromCache: false,
            schemaFetchedAt: fetchedAt,
            isRefreshingSchema: false
          })
        }
      } else {
        set({ isRefreshingSchema: false })
      }
    } catch (error) {
      console.error('Failed to refresh schemas in background:', error)
      set({ isRefreshingSchema: false })
    }
  },

  setConnectionStatus: (id, status) =>
    set((state) => ({
      connections: state.connections.map((c) => (c.id === id ? { ...c, ...status } : c))
    })),

  setSchemas: (schemas) => set({ schemas }),
  setLoadingSchema: (loading) => set({ isLoadingSchema: loading }),

  getActiveConnection: () => {
    const state = get()
    return state.connections.find((c) => c.id === state.activeConnectionId) || null
  },

  getEnumValues: (dataType: string) => {
    const state = get()
    // Find enum type by name (could be schema.typename or just typename)
    const enumType = state.customTypes.find(
      (t) => t.type === 'enum' && (t.name === dataType || `${t.schema}.${t.name}` === dataType)
    )
    return enumType?.values
  }
}))
