import type {
  ConnectionConfig,
  DatabaseType,
  SchemaInfo,
  QueryField,
  TableDefinition,
  SequenceInfo,
  CustomTypeInfo,
  StatementResult,
  QueryTelemetry,
  ColumnStats,
  ActiveQuery,
  TableSizeInfo,
  CacheStats,
  LockInfo,
  DatabaseSizeInfo,
  SchemaIntelCheckId,
  SchemaIntelReport
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
  /** Query timeout in milliseconds (0 = no timeout) */
  queryTimeoutMs?: number
  /** Execute query in this specific stateful transaction session */
  sessionId?: string
}

/**
 * A connection the caller holds open and drives itself, outside any pool.
 *
 * Pooled access (`query`, `execute`, `executeTransaction`) borrows a client for the
 * length of one call. Some features need the opposite: a connection that stays put
 * across many calls because server-side state lives on it — a stepped script's open
 * transaction, a LISTEN registration. Those get one of these, and own closing it.
 */
export interface DedicatedClient {
  /** Run one statement on this connection. */
  query(sql: string, params?: unknown[]): Promise<AdapterQueryResult>

  /**
   * Register the handler for this connection dying underneath the caller — a socket
   * error, or a clean close from the server, which arrives as a null error.
   *
   * Single-handler: a later registration replaces the earlier one. The connection
   * reports its death at most once, and never for a `close()` the caller asked for. A
   * death that happened before registration is replayed to the handler immediately, so
   * there is no window in which it can be missed.
   */
  onDisconnect(handler: (error: Error | null) => void): void

  /**
   * Close the connection and release whatever it rode on (SSH tunnel).
   *
   * Idempotent: repeat calls await the same teardown rather than starting another. A
   * teardown that failed stays failed — the rejection is replayed, not retried.
   */
  close(): Promise<void>
}

/** A dedicated client that also delivers asynchronous notifications from the server. */
export interface NotificationClient extends DedicatedClient {
  /**
   * Register the handler for notifications on any channel this client is LISTENing to.
   *
   * Single-handler, like `onDisconnect`: a later registration replaces the earlier one.
   * Unlike a disconnect, a notification that arrives before registration is dropped —
   * register before issuing `LISTEN`.
   */
  onNotification(handler: (channel: string, payload: string) => void): void
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

  /** Begin a stateful transaction for a specific session */
  beginTransaction?(config: ConnectionConfig, sessionId: string): Promise<void>

  /** Execute a query within a stateful transaction */
  queryInTransaction?(
    config: ConnectionConfig,
    sessionId: string,
    sql: string,
    params?: unknown[]
  ): Promise<AdapterQueryResult>

  /** Commit a stateful transaction */
  commitTransaction?(config: ConnectionConfig, sessionId: string): Promise<void>

  /** Rollback a stateful transaction */
  rollbackTransaction?(config: ConnectionConfig, sessionId: string): Promise<void>

  /**
   * Roll back any stateful transactions still open against this connection.
   *
   * Called before the connection's pool is torn down (edit/delete) so a parked session
   * client can't keep the pool's teardown pending and leave a transaction open
   * server-side. Adapters that don't park clients don't need to implement it.
   */
  drainSessions?(config: ConnectionConfig): Promise<void>

  /**
   * Open a dedicated, unpooled connection for a caller that needs server-side session
   * state to survive across calls. Adapters that only ever serve pooled queries don't
   * implement it, and callers must handle its absence.
   *
   * The returned client is already connected — there is no separate connect step — and
   * an implementation that fails partway releases whatever it had acquired (socket, SSH
   * tunnel) before rejecting, so a caller has nothing to clean up on failure.
   */
  createDedicatedClient?(config: ConnectionConfig): Promise<DedicatedClient>

  /**
   * Open a dedicated connection that also delivers asynchronous notifications
   * (PostgreSQL LISTEN/NOTIFY). Only implemented where the server has the feature.
   */
  createNotificationClient?(config: ConnectionConfig): Promise<NotificationClient>

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

  /** Get column statistics (min, max, nulls, distinct, histogram) */
  getColumnStats(
    config: ConnectionConfig,
    schema: string,
    table: string,
    column: string,
    dataType: string
  ): Promise<ColumnStats>

  /** Get active (non-idle) queries running on the server */
  getActiveQueries(config: ConnectionConfig): Promise<ActiveQuery[]>

  /** Get table sizes and total database size */
  getTableSizes(
    config: ConnectionConfig,
    schema?: string
  ): Promise<{ dbSize: DatabaseSizeInfo; tables: TableSizeInfo[] }>

  /** Get buffer cache and index hit ratios */
  getCacheStats(config: ConnectionConfig): Promise<CacheStats>

  /** Get blocking lock information */
  getLocks(config: ConnectionConfig): Promise<LockInfo[]>

  /** Cancel/kill a running query by PID */
  killQuery(config: ConnectionConfig, pid: number): Promise<{ success: boolean; error?: string }>

  /**
   * Run a set of schema diagnostic checks against the database. If `checks`
   * is omitted, the adapter runs every check it supports.
   */
  runSchemaIntel(
    config: ConnectionConfig,
    checks?: SchemaIntelCheckId[]
  ): Promise<SchemaIntelReport>
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
