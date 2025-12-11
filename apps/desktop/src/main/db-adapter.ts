import type {
  ConnectionConfig,
  DatabaseType,
  SchemaInfo,
  QueryField,
  TableDefinition,
  SequenceInfo,
  CustomTypeInfo,
  StatementResult,
  QueryTelemetry
} from '@shared/index'

/**
 * Query result with metadata
 */
export interface AdapterQueryResult {
  rows: Record<string, unknown>[]
  fields: QueryField[]
  rowCount: number | null
}

/**
 * Multi-statement query result
 */
export interface AdapterMultiQueryResult {
  results: StatementResult[]
  totalDurationMs: number
  /** Telemetry data when collectTelemetry is true */
  telemetry?: QueryTelemetry
}

/**
 * Options for query execution
 */
export interface QueryOptions {
  /** Unique execution ID for cancellation support */
  executionId?: string
  /** Whether to collect detailed telemetry data */
  collectTelemetry?: boolean
}

/**
 * Explain plan result
 */
export interface ExplainResult {
  plan: unknown
  durationMs: number
}

/**
 * Database adapter interface - abstracts database-specific operations
 */
export interface DatabaseAdapter {
  /** Database type identifier */
  readonly dbType: DatabaseType

  /** Test connection */
  connect(config: ConnectionConfig): Promise<void>

  /** Execute a query and return results */
  query(config: ConnectionConfig, sql: string): Promise<AdapterQueryResult>

  /** Execute multiple SQL statements and return results for each */
  queryMultiple(
    config: ConnectionConfig,
    sql: string,
    options?: QueryOptions
  ): Promise<AdapterMultiQueryResult>

  /** Execute a statement (for INSERT/UPDATE/DELETE in transactions) */
  execute(
    config: ConnectionConfig,
    sql: string,
    params: unknown[]
  ): Promise<{ rowCount: number | null }>

  /** Execute multiple statements in a transaction */
  executeTransaction(
    config: ConnectionConfig,
    statements: Array<{ sql: string; params: unknown[] }>
  ): Promise<{ rowsAffected: number; results: Array<{ rowCount: number | null }> }>

  /** Fetch database schemas, tables, and columns */
  getSchemas(config: ConnectionConfig): Promise<SchemaInfo[]>

  /** Get query execution plan */
  explain(config: ConnectionConfig, sql: string, analyze: boolean): Promise<ExplainResult>

  /** Get table definition (reverse engineer DDL) */
  getTableDDL(config: ConnectionConfig, schema: string, table: string): Promise<TableDefinition>

  /** Get available sequences (PostgreSQL-specific, returns empty for MySQL) */
  getSequences(config: ConnectionConfig): Promise<SequenceInfo[]>

  /** Get custom types (enums, etc.) */
  getTypes(config: ConnectionConfig): Promise<CustomTypeInfo[]>
}

// Import adapters
import { PostgresAdapter } from './adapters/postgres-adapter'
import { MySQLAdapter } from './adapters/mysql-adapter'
import { MSSQLAdapter } from './adapters/mssql-adapter'
import { SQLiteAdapter } from './adapters/sqlite-adapter'

// Adapter instances (singletons)
const adapters: Record<DatabaseType, DatabaseAdapter> = {
  postgresql: new PostgresAdapter(),
  mysql: new MySQLAdapter(),
  sqlite: new SQLiteAdapter(),
  mssql: new MSSQLAdapter()
}

/**
 * Get the appropriate database adapter for a connection
 */
export function getAdapter(config: ConnectionConfig): DatabaseAdapter {
  const dbType = config.dbType || 'postgresql' // Default to postgresql for backward compatibility

  const adapter = adapters[dbType]
  if (!adapter) {
    throw new Error(`Unsupported database type: ${dbType}`)
  }
  return adapter
}

/**
 * Get adapter by database type
 */
export function getAdapterByType(dbType: DatabaseType): DatabaseAdapter {
  const adapter = adapters[dbType]
  if (!adapter) {
    throw new Error(`Unsupported database type: ${dbType}`)
  }
  return adapter
}
