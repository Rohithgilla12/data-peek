// ============================================
// AI Types - Shared across main and renderer
// ============================================

/**
 * Supported AI providers
 */
export type AIProvider = 'openai' | 'anthropic' | 'google' | 'groq' | 'ollama';

/**
 * Configuration for AI service
 */
export interface AIConfig {
  provider: AIProvider;
  apiKey?: string;
  model: string;
  baseUrl?: string;
}

/**
 * AI message for chat conversations
 */
export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * AI response types for structured output
 */
export type AIResponseType = 'message' | 'query' | 'chart' | 'metric' | 'schema';

/**
 * AI response for SQL queries
 */
export interface AIQueryResponse {
  type: 'query';
  message: string;
  sql: string;
  explanation: string;
  warning?: string;
}

/**
 * AI response for chart visualizations
 */
export interface AIChartResponse {
  type: 'chart';
  message: string;
  title: string;
  description?: string;
  chartType: 'bar' | 'line' | 'pie' | 'area';
  sql: string;
  xKey: string;
  yKeys: string[];
}

/**
 * AI response for metric cards
 */
export interface AIMetricResponse {
  type: 'metric';
  message: string;
  label: string;
  sql: string;
  format: 'number' | 'currency' | 'percent' | 'duration';
}

/**
 * AI response for schema explanations
 */
export interface AISchemaResponse {
  type: 'schema';
  message: string;
  tables: string[];
}

/**
 * AI response for general messages
 */
export interface AIMessageResponse {
  type: 'message';
  message: string;
}

/**
 * Union type for all AI structured responses
 */
export type AIStructuredResponse =
  | AIQueryResponse
  | AIChartResponse
  | AIMetricResponse
  | AISchemaResponse
  | AIMessageResponse;

/**
 * Alias for AIChatResponse (same as AIStructuredResponse)
 */
export type AIChatResponse = AIStructuredResponse;

// Stored response data types (without message field since it's in content)

/**
 * Stored query data for persistence
 */
export interface StoredQueryData {
  type: 'query';
  sql: string;
  explanation: string;
  warning?: string;
}

/**
 * Stored chart data for persistence
 */
export interface StoredChartData {
  type: 'chart';
  title: string;
  description?: string;
  chartType: 'bar' | 'line' | 'pie' | 'area';
  sql: string;
  xKey: string;
  yKeys: string[];
}

/**
 * Stored metric data for persistence
 */
export interface StoredMetricData {
  type: 'metric';
  label: string;
  sql: string;
  format: 'number' | 'currency' | 'percent' | 'duration';
}

/**
 * Stored schema data for persistence
 */
export interface StoredSchemaData {
  type: 'schema';
  tables: string[];
}

/**
 * Union type for stored response data
 */
export type StoredResponseData =
  | StoredQueryData
  | StoredChartData
  | StoredMetricData
  | StoredSchemaData
  | null;

/**
 * Stored chat message type (with serializable createdAt)
 */
export interface StoredChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  responseData?: StoredResponseData;
  createdAt: string; // ISO string for storage
}

/**
 * Chat session type - represents a single conversation thread
 */
export interface ChatSession {
  id: string;
  title: string;
  messages: StoredChatMessage[];
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

// ============================================
// Connection Types
// ============================================

export interface ConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl?: boolean;
  dbType: DatabaseType;
}

/**
 * Supported database types
 */
export type DatabaseType = 'postgresql' | 'mysql' | 'sqlite';

/**
 * Field metadata from query results
 * The server resolves type names so the frontend stays database-agnostic
 */
export interface QueryField {
  name: string;
  /** Human-readable data type (e.g., 'varchar', 'integer', 'jsonb') */
  dataType: string;
  /** Original database-specific type ID (for advanced use cases) */
  dataTypeID?: number;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  fields: QueryField[];
  rowCount: number;
  durationMs: number;
}

export interface IpcResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================
// Schema Types - Shared across all DB adapters
// ============================================

/**
 * Foreign key relationship metadata
 */
export interface ForeignKeyInfo {
  /** Constraint name in the database */
  constraintName: string;
  /** Schema containing the referenced table */
  referencedSchema: string;
  /** Referenced table name */
  referencedTable: string;
  /** Referenced column name */
  referencedColumn: string;
}

/**
 * Column metadata for a table or view
 * Compatible with: PostgreSQL, MySQL, SQLite
 */
export interface ColumnInfo {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  defaultValue?: string;
  /** Column position in the table (1-indexed) */
  ordinalPosition: number;
  /** Foreign key relationship (if this column references another table) */
  foreignKey?: ForeignKeyInfo;
}

/**
 * Table or view metadata
 */
export interface TableInfo {
  name: string;
  type: 'table' | 'view';
  columns: ColumnInfo[];
  /** Estimated row count (if available) */
  estimatedRowCount?: number;
}

/**
 * Schema/namespace metadata
 * Note: SQLite doesn't have schemas, will use 'main' as default
 */
export interface SchemaInfo {
  name: string;
  tables: TableInfo[];
}

/**
 * Complete database schema structure
 */
export interface DatabaseSchema {
  schemas: SchemaInfo[];
  /** When the schema was last fetched */
  fetchedAt: number;
}

// ============================================
// Edit Operation Types - Database Agnostic
// ============================================

/**
 * Represents a single cell change
 */
export interface CellChange {
  column: string;
  oldValue: unknown;
  newValue: unknown;
  dataType: string;
}

/**
 * Primary key value(s) for identifying a row
 * Supports composite primary keys
 */
export interface PrimaryKeyValue {
  column: string;
  value: unknown;
  dataType: string;
}

/**
 * Represents a row modification (UPDATE)
 */
export interface RowUpdate {
  type: 'update';
  /** Unique identifier for this change (client-side) */
  id: string;
  /** Primary key(s) to identify the row */
  primaryKeys: PrimaryKeyValue[];
  /** Changed cells */
  changes: CellChange[];
  /** Original row data for reference */
  originalRow: Record<string, unknown>;
}

/**
 * Represents a row insertion (INSERT)
 */
export interface RowInsert {
  type: 'insert';
  /** Unique identifier for this change (client-side) */
  id: string;
  /** New row data */
  values: Record<string, unknown>;
  /** Column metadata for type information */
  columns: Array<{ name: string; dataType: string }>;
}

/**
 * Represents a row deletion (DELETE)
 */
export interface RowDelete {
  type: 'delete';
  /** Unique identifier for this change (client-side) */
  id: string;
  /** Primary key(s) to identify the row */
  primaryKeys: PrimaryKeyValue[];
  /** Original row data for reference/undo */
  originalRow: Record<string, unknown>;
}

/**
 * Union type for all edit operations
 */
export type EditOperation = RowUpdate | RowInsert | RowDelete;

/**
 * Context for edit operations - identifies the target table
 */
export interface EditContext {
  schema: string;
  table: string;
  /** Primary key column names */
  primaryKeyColumns: string[];
  /** All columns with their types */
  columns: ColumnInfo[];
}

/**
 * Batch of edit operations to execute
 */
export interface EditBatch {
  context: EditContext;
  operations: EditOperation[];
}

/**
 * Result of executing edit operations
 */
export interface EditResult {
  success: boolean;
  /** Number of rows affected */
  rowsAffected: number;
  /** Generated SQL statements (for transparency) */
  executedSql: string[];
  /** Any errors that occurred */
  errors?: Array<{
    operationId: string;
    message: string;
  }>;
}

/**
 * SQL statement with parameters (for parameterized queries)
 */
export interface ParameterizedQuery {
  sql: string;
  params: unknown[];
}

// ============================================
// DDL Types - Table Designer
// ============================================

/**
 * PostgreSQL data types for the type selector dropdown
 */
export type PostgresDataType =
  | 'smallint'
  | 'integer'
  | 'bigint'
  | 'serial'
  | 'bigserial'
  | 'numeric'
  | 'real'
  | 'double precision'
  | 'money'
  | 'char'
  | 'varchar'
  | 'text'
  | 'bytea'
  | 'timestamp'
  | 'timestamptz'
  | 'date'
  | 'time'
  | 'timetz'
  | 'interval'
  | 'boolean'
  | 'uuid'
  | 'json'
  | 'jsonb'
  | 'xml'
  | 'point'
  | 'line'
  | 'lseg'
  | 'box'
  | 'path'
  | 'polygon'
  | 'circle'
  | 'cidr'
  | 'inet'
  | 'macaddr'
  | 'int4range'
  | 'int8range'
  | 'numrange'
  | 'tsrange'
  | 'tstzrange'
  | 'daterange';

/**
 * Column definition for table designer
 * Used for both CREATE TABLE and ALTER TABLE operations
 */
export interface ColumnDefinition {
  /** Client-side tracking ID */
  id: string;
  /** Column name */
  name: string;
  /** Data type (PostgreSQL type or custom type) */
  dataType: PostgresDataType | string;
  /** Length for varchar(n), char(n) */
  length?: number;
  /** Precision for numeric(p,s) */
  precision?: number;
  /** Scale for numeric(p,s) */
  scale?: number;
  /** Whether the column allows NULL values */
  isNullable: boolean;
  /** Whether this column is part of the primary key */
  isPrimaryKey: boolean;
  /** Whether this column has a UNIQUE constraint */
  isUnique: boolean;
  /** Default value expression */
  defaultValue?: string;
  /** Type of default value */
  defaultType?: 'value' | 'expression' | 'sequence';
  /** Sequence name for nextval('sequence') */
  sequenceName?: string;
  /** Column-level CHECK constraint expression */
  checkConstraint?: string;
  /** Column comment */
  comment?: string;
  /** Collation for text types */
  collation?: string;
  /** Whether this is an array type (e.g., text[]) */
  isArray?: boolean;
}

/**
 * Constraint types supported by PostgreSQL
 */
export type ConstraintType =
  | 'primary_key'
  | 'foreign_key'
  | 'unique'
  | 'check'
  | 'exclude';

/**
 * Foreign key referential actions
 */
export type ReferentialAction =
  | 'NO ACTION'
  | 'RESTRICT'
  | 'CASCADE'
  | 'SET NULL'
  | 'SET DEFAULT';

/**
 * Index access methods
 */
export type IndexMethod = 'btree' | 'hash' | 'gist' | 'gin' | 'spgist' | 'brin';

/**
 * Constraint definition for table designer
 */
export interface ConstraintDefinition {
  /** Client-side tracking ID */
  id: string;
  /** Constraint name (optional, auto-generated if not provided) */
  name?: string;
  /** Type of constraint */
  type: ConstraintType;
  /** Columns involved in the constraint */
  columns: string[];
  // Foreign key specific
  /** Schema containing the referenced table */
  referencedSchema?: string;
  /** Referenced table name */
  referencedTable?: string;
  /** Referenced column names */
  referencedColumns?: string[];
  /** ON UPDATE action */
  onUpdate?: ReferentialAction;
  /** ON DELETE action */
  onDelete?: ReferentialAction;
  // Check constraint specific
  /** CHECK constraint expression */
  checkExpression?: string;
  // Exclude constraint specific
  /** Exclude constraint elements */
  excludeElements?: Array<{ column: string; operator: string }>;
  /** Index method for exclude constraint */
  excludeUsing?: IndexMethod;
}

/**
 * Index column specification
 */
export interface IndexColumn {
  /** Column name or expression */
  name: string;
  /** Sort order */
  order?: 'ASC' | 'DESC';
  /** NULLS position */
  nullsPosition?: 'FIRST' | 'LAST';
}

/**
 * Index definition for table designer
 */
export interface IndexDefinition {
  /** Client-side tracking ID */
  id: string;
  /** Index name (optional, auto-generated if not provided) */
  name?: string;
  /** Columns or expressions in the index */
  columns: IndexColumn[];
  /** Whether this is a unique index */
  isUnique: boolean;
  /** Index access method */
  method?: IndexMethod;
  /** Partial index WHERE clause */
  where?: string;
  /** INCLUDE columns (covering index) */
  include?: string[];
  /** Whether to create index concurrently */
  concurrent?: boolean;
}

/**
 * Table partitioning strategy
 */
export type PartitionType = 'RANGE' | 'LIST' | 'HASH';

/**
 * Partition definition for partitioned tables
 */
export interface PartitionDefinition {
  /** Partitioning strategy */
  type: PartitionType;
  /** Partition key columns */
  columns: string[];
}

/**
 * Full table definition for CREATE TABLE
 */
export interface TableDefinition {
  /** Schema name */
  schema: string;
  /** Table name */
  name: string;
  /** Column definitions */
  columns: ColumnDefinition[];
  /** Table-level constraints */
  constraints: ConstraintDefinition[];
  /** Index definitions */
  indexes: IndexDefinition[];
  /** Partition configuration */
  partition?: PartitionDefinition;
  /** Parent tables for inheritance */
  inherits?: string[];
  /** Tablespace name */
  tablespace?: string;
  /** Table comment */
  comment?: string;
  /** Whether to include OIDs (deprecated in PG 12+) */
  withOids?: boolean;
  /** Whether this is an unlogged table */
  unlogged?: boolean;
}

// ============================================
// ALTER TABLE Operation Types
// ============================================

/**
 * Column-level ALTER TABLE operations
 */
export type AlterColumnOperation =
  | { type: 'add'; column: ColumnDefinition }
  | { type: 'drop'; columnName: string; cascade?: boolean }
  | { type: 'rename'; oldName: string; newName: string }
  | { type: 'set_type'; columnName: string; newType: string; using?: string }
  | { type: 'set_nullable'; columnName: string; nullable: boolean }
  | { type: 'set_default'; columnName: string; defaultValue: string | null }
  | { type: 'set_comment'; columnName: string; comment: string | null };

/**
 * Constraint-level ALTER TABLE operations
 */
export type AlterConstraintOperation =
  | { type: 'add_constraint'; constraint: ConstraintDefinition }
  | { type: 'drop_constraint'; name: string; cascade?: boolean }
  | { type: 'rename_constraint'; oldName: string; newName: string };

/**
 * Index ALTER operations
 */
export type AlterIndexOperation =
  | { type: 'create_index'; index: IndexDefinition }
  | { type: 'drop_index'; name: string; cascade?: boolean; concurrent?: boolean }
  | { type: 'rename_index'; oldName: string; newName: string }
  | { type: 'reindex'; name: string; concurrent?: boolean };

/**
 * Batch of ALTER TABLE operations to execute
 */
export interface AlterTableBatch {
  /** Target schema */
  schema: string;
  /** Target table */
  table: string;
  /** Column operations */
  columnOperations: AlterColumnOperation[];
  /** Constraint operations */
  constraintOperations: AlterConstraintOperation[];
  /** Index operations */
  indexOperations: AlterIndexOperation[];
  /** New table name (for RENAME TO) */
  renameTable?: string;
  /** New schema (for SET SCHEMA) */
  setSchema?: string;
  /** Table comment (null to remove) */
  comment?: string | null;
}

/**
 * Result of DDL operations
 */
export interface DDLResult {
  /** Whether all operations succeeded */
  success: boolean;
  /** SQL statements that were executed */
  executedSql: string[];
  /** Errors encountered during execution */
  errors?: string[];
}

// ============================================
// Database Metadata Types
// ============================================

/**
 * Sequence information for default value picker
 */
export interface SequenceInfo {
  /** Schema containing the sequence */
  schema: string;
  /** Sequence name */
  name: string;
  /** Data type of the sequence */
  dataType: string;
  /** Start value */
  startValue: string;
  /** Increment value */
  increment: string;
}

/**
 * Custom type information (enums, composites, etc.)
 */
export interface CustomTypeInfo {
  /** Schema containing the type */
  schema: string;
  /** Type name */
  name: string;
  /** Type category */
  type: 'enum' | 'composite' | 'range' | 'domain';
  /** Enum values (for enum types) */
  values?: string[];
}

// ============================================
// License Types
// ============================================

/**
 * License type enumeration
 */
export type LicenseType = 'personal' | 'individual' | 'team';

/**
 * Stored license data (encrypted locally)
 */
export interface LicenseData {
  /** License key */
  key: string;
  /** Type of license */
  type: LicenseType;
  /** Email address of license owner */
  email: string;
  /** Subscription expiry date (ISO string) */
  expiresAt: string;
  /** Last version the user is entitled to use perpetually */
  perpetualVersion: string;
  /** When this license was activated (ISO string) */
  activatedAt: string;
  /** Last time the license was validated online (ISO string) */
  lastValidated: string;
}

/**
 * License status returned to the frontend
 */
export interface LicenseStatus {
  /** Whether the license is valid */
  isValid: boolean;
  /** Whether commercial use is allowed */
  isCommercial: boolean;
  /** Type of license */
  type: LicenseType;
  /** Expiry date (null for personal) */
  expiresAt: string | null;
  /** Days until expiry (null for personal or expired) */
  daysUntilExpiry: number | null;
  /** Perpetual version the user can use after expiry */
  perpetualVersion: string | null;
  /** Whether revalidation is needed */
  needsRevalidation: boolean;
  /** Email associated with the license */
  email?: string;
  /** Number of devices activated */
  devicesUsed?: number;
  /** Maximum devices allowed */
  devicesAllowed?: number;
}

/**
 * License activation request
 */
export interface LicenseActivationRequest {
  key: string;
  email: string;
}

/**
 * License activation response
 */
export interface LicenseActivationResponse {
  success: boolean;
  error?: string;
  type?: LicenseType;
  expiresAt?: string;
  perpetualVersion?: string;
  devicesUsed?: number;
  devicesAllowed?: number;
}

/**
 * License deactivation response
 */
export interface LicenseDeactivationResponse {
  success: boolean;
  error?: string;
}

// ============================================
// Saved Queries Types
// ============================================

/**
 * A saved query/snippet that can be bookmarked and reused
 */
export interface SavedQuery {
  /** Unique identifier */
  id: string;
  /** Display name for the query */
  name: string;
  /** The SQL query text */
  query: string;
  /** Optional description of what the query does */
  description?: string;
  /** Optional connection ID - if set, opens in this connection by default */
  connectionId?: string;
  /** Tags for organization and filtering */
  tags: string[];
  /** Folder path for grouping (e.g., "Reports/Monthly") */
  folder?: string;
  /** Number of times this query has been used */
  usageCount: number;
  /** Last time the query was used (Unix timestamp) */
  lastUsedAt?: number;
  /** When the query was created (Unix timestamp) */
  createdAt: number;
  /** When the query was last updated (Unix timestamp) */
  updatedAt: number;
}
