import type { QueryResult as IpcQueryResult } from '@data-peek/shared'
import { create } from 'zustand'
import { buildSelectQuery } from '@/lib/sql-helpers'
import type { Connection, Table } from './connection-store'

export interface QueryHistoryItem {
  id: string
  query: string
  timestamp: Date
  durationMs: number
  rowCount: number
  status: 'success' | 'error'
  connectionId: string
  errorMessage?: string
}

export interface QueryResult {
  columns: { name: string; dataType: string }[]
  rows: Record<string, unknown>[]
  rowCount: number
  durationMs: number
  tableName?: string
}

interface QueryState {
  // Editor state
  currentQuery: string
  isExecuting: boolean

  // Results
  result: QueryResult | null
  error: string | null

  // History
  history: QueryHistoryItem[]

  // Pagination
  currentPage: number
  pageSize: number

  // Actions
  setCurrentQuery: (query: string) => void
  setIsExecuting: (executing: boolean) => void
  setResult: (result: QueryResult | null) => void
  setError: (error: string | null) => void

  // Load table data (for clicking on tables)
  loadTableData: (schemaName: string, table: Table, connection: Connection) => void

  // Execute a query against the database
  executeQuery: (connection: Connection, query?: string) => Promise<void>

  addToHistory: (item: Omit<QueryHistoryItem, 'id' | 'timestamp'>) => void
  clearHistory: () => void
  removeFromHistory: (id: string) => void

  setCurrentPage: (page: number) => void
  setPageSize: (size: number) => void

  // Computed
  getTotalPages: () => number
  getPaginatedRows: () => Record<string, unknown>[]
}

// PostgreSQL data type OID to name mapping (common types)
function getDataTypeName(dataTypeID: number): string {
  const typeMap: Record<number, string> = {
    16: 'boolean',
    17: 'bytea',
    18: 'char',
    19: 'name',
    20: 'bigint',
    21: 'smallint',
    23: 'integer',
    24: 'regproc',
    25: 'text',
    26: 'oid',
    114: 'json',
    142: 'xml',
    700: 'real',
    701: 'double precision',
    790: 'money',
    1042: 'char',
    1043: 'varchar',
    1082: 'date',
    1083: 'time',
    1114: 'timestamp',
    1184: 'timestamptz',
    1186: 'interval',
    1560: 'bit',
    1562: 'varbit',
    1700: 'numeric',
    2950: 'uuid',
    3802: 'jsonb',
    3904: 'int4range',
    3906: 'numrange',
    3908: 'tsrange',
    3910: 'tstzrange',
    3912: 'daterange',
    3926: 'int8range'
  }
  return typeMap[dataTypeID] ?? `unknown(${dataTypeID})`
}

// Generate sample data based on column type
// function generateSampleValue(column: Column, rowIndex: number): unknown {
//   const { dataType, name, isNullable } = column
//   const lower = dataType.toLowerCase()

//   // Randomly return null for nullable columns (10% chance)
//   if (isNullable && Math.random() < 0.1) {
//     return null
//   }

//   if (lower.includes('uuid')) {
//     return `${rowIndex.toString(16).padStart(8, '0')}-${Math.random().toString(16).slice(2, 6)}-4${Math.random().toString(16).slice(2, 5)}-${Math.random().toString(16).slice(2, 6)}-${Math.random().toString(16).slice(2, 14)}`
//   }

//   if (lower.includes('int') || lower.includes('serial')) {
//     return rowIndex + 1
//   }

//   if (
//     lower.includes('numeric') ||
//     lower.includes('decimal') ||
//     lower.includes('float') ||
//     lower.includes('double')
//   ) {
//     return Math.round(Math.random() * 10000) / 100
//   }

//   if (lower.includes('bool')) {
//     return Math.random() > 0.5
//   }

//   if (lower.includes('timestamp') || lower.includes('date')) {
//     const date = new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000)
//     return date.toISOString().replace('T', ' ').slice(0, 19)
//   }

//   if (lower.includes('json')) {
//     return JSON.stringify({ key: `value_${rowIndex}`, nested: { id: rowIndex } })
//   }

//   // Text/varchar fields - generate based on column name
//   const nameLower = name.toLowerCase()
//   if (nameLower.includes('email')) {
//     const names = ['alice', 'bob', 'carol', 'david', 'eve', 'frank', 'grace', 'henry']
//     return `${names[rowIndex % names.length]}${rowIndex}@example.com`
//   }
//   if (nameLower.includes('name') || nameLower.includes('first')) {
//     const names = [
//       'Alice',
//       'Bob',
//       'Carol',
//       'David',
//       'Eve',
//       'Frank',
//       'Grace',
//       'Henry',
//       'Ivy',
//       'Jack'
//     ]
//     return names[rowIndex % names.length]
//   }
//   if (nameLower.includes('status')) {
//     const statuses = ['active', 'pending', 'completed', 'cancelled', 'shipped']
//     return statuses[rowIndex % statuses.length]
//   }
//   if (nameLower.includes('description') || nameLower.includes('text')) {
//     return `Sample description for row ${rowIndex + 1}`
//   }
//   if (nameLower.includes('phone')) {
//     return `+1-555-${String(rowIndex).padStart(3, '0')}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`
//   }
//   if (nameLower.includes('address')) {
//     return `${100 + rowIndex} Main Street, City ${rowIndex % 10}`
//   }
//   if (nameLower.includes('url') || nameLower.includes('link')) {
//     return `https://example.com/resource/${rowIndex}`
//   }
//   if (nameLower.includes('token') || nameLower.includes('key')) {
//     return `tok_${Math.random().toString(36).slice(2, 18)}`
//   }

//   // Default text value
//   return `${name}_${rowIndex + 1}`
// }

// Generate sample rows for a table
// function generateSampleRows(columns: Column[], count: number = 25): Record<string, unknown>[] {
//   const rows: Record<string, unknown>[] = []
//   for (let i = 0; i < count; i++) {
//     const row: Record<string, unknown> = {}
//     for (const col of columns) {
//       row[col.name] = generateSampleValue(col, i)
//     }
//     rows.push(row)
//   }
//   return rows
// }

// Sample history for development
const sampleHistory: QueryHistoryItem[] = [
  {
    id: '1',
    query:
      "SELECT * FROM users WHERE created_at > now() - interval '7 days' ORDER BY created_at DESC LIMIT 100",
    timestamp: new Date(Date.now() - 5 * 60 * 1000),
    durationMs: 24,
    rowCount: 47,
    status: 'success',
    connectionId: '1'
  },
  {
    id: '2',
    query: "UPDATE orders SET status = 'shipped' WHERE id = 'abc-123'",
    timestamp: new Date(Date.now() - 15 * 60 * 1000),
    durationMs: 12,
    rowCount: 1,
    status: 'success',
    connectionId: '1'
  },
  {
    id: '3',
    query:
      'SELECT u.name, COUNT(o.id) as order_count FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.id',
    timestamp: new Date(Date.now() - 30 * 60 * 1000),
    durationMs: 156,
    rowCount: 234,
    status: 'success',
    connectionId: '1'
  }
]

export const useQueryStore = create<QueryState>((set, get) => ({
  // Initial state
  currentQuery: '',
  isExecuting: false,
  result: null,
  error: null,
  history: sampleHistory,
  currentPage: 1,
  pageSize: 100,

  // Actions
  setCurrentQuery: (query) => set({ currentQuery: query }),
  setIsExecuting: (executing) => set({ isExecuting: executing }),
  setResult: (result) => set({ result, error: null, currentPage: 1 }),
  setError: (error) => set({ error, result: null }),

  loadTableData: (schemaName, table, connection) => {
    // Build table reference (handle MSSQL's dbo schema)
    const defaultSchema = connection.dbType === 'mssql' ? 'dbo' : 'public'
    const tableRef = schemaName === defaultSchema ? table.name : `${schemaName}.${table.name}`
    const query = buildSelectQuery(tableRef, connection.dbType, { limit: 100 })

    set({ currentQuery: query })

    // Execute the query
    get().executeQuery(connection, query)
  },

  executeQuery: async (connection, queryOverride) => {
    const query = queryOverride ?? get().currentQuery
    console.log('[executeQuery] Starting with query:', query)
    console.log('[executeQuery] Connection:', connection)

    if (!query.trim()) {
      console.log('[executeQuery] Empty query, returning')
      return
    }

    set({ isExecuting: true, error: null })

    try {
      console.log('[executeQuery] Calling window.api.db.query...')
      const response = await window.api.db.query(connection, query)
      console.log('[executeQuery] Response:', response)

      if (response.success && response.data) {
        const data = response.data as IpcQueryResult
        console.log('[executeQuery] Success! Data:', data)

        // Map the IPC result to our QueryResult format
        const result: QueryResult = {
          columns: data.fields.map((f) => ({
            name: f.name,
            dataType: getDataTypeName(f.dataTypeID as number)
          })),
          rows: data.rows,
          rowCount: data.rowCount ?? data.rows.length,
          durationMs: data.durationMs
        }
        console.log('[executeQuery] Mapped result:', result)

        // Add to history
        const history = get().history
        const newHistoryItem: QueryHistoryItem = {
          id: crypto.randomUUID(),
          query,
          timestamp: new Date(),
          durationMs: data.durationMs,
          rowCount: result.rowCount,
          status: 'success',
          connectionId: connection.id
        }

        set({
          isExecuting: false,
          result,
          error: null,
          history: [newHistoryItem, ...history].slice(0, 100)
        })
      } else {
        // Query failed
        const errorMessage = response.error ?? 'Query execution failed'
        console.log('[executeQuery] Query failed:', errorMessage)

        // Add to history as error
        const history = get().history
        const newHistoryItem: QueryHistoryItem = {
          id: crypto.randomUUID(),
          query,
          timestamp: new Date(),
          durationMs: 0,
          rowCount: 0,
          status: 'error',
          connectionId: connection.id,
          errorMessage
        }

        set({
          isExecuting: false,
          result: null,
          error: errorMessage,
          history: [newHistoryItem, ...history].slice(0, 100)
        })
      }
    } catch (error) {
      console.error('[executeQuery] Exception caught:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)

      set({
        isExecuting: false,
        result: null,
        error: errorMessage
      })
    }
  },

  addToHistory: (item) =>
    set((state) => ({
      history: [
        {
          ...item,
          id: crypto.randomUUID(),
          timestamp: new Date()
        },
        ...state.history
      ].slice(0, 100)
    })),

  clearHistory: () => set({ history: [] }),

  removeFromHistory: (id) =>
    set((state) => ({
      history: state.history.filter((h) => h.id !== id)
    })),

  setCurrentPage: (page) => set({ currentPage: page }),
  setPageSize: (size) => set({ pageSize: size, currentPage: 1 }),

  getTotalPages: () => {
    const state = get()
    if (!state.result) return 0
    return Math.ceil(state.result.rowCount / state.pageSize)
  },

  getPaginatedRows: () => {
    const state = get()
    if (!state.result) return []
    const start = (state.currentPage - 1) * state.pageSize
    return state.result.rows.slice(start, start + state.pageSize)
  }
}))
