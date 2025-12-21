export { PG_TYPE_MAP, resolvePostgresType } from "./type-maps";

/**
 * Base URL for the data-peek website
 */
export const DATAPEEK_BASE_URL = "https://www.datapeek.dev";

/**
 * UTM parameters for tracking
 */
export interface UTMParams {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
}

/**
 * Build a URL with UTM tracking parameters
 */
export function buildTrackingUrl(path: string, utm: UTMParams = {}): string {
  const params = new URLSearchParams();

  if (utm.source) params.set("utm_source", utm.source);
  if (utm.medium) params.set("utm_medium", utm.medium);
  if (utm.campaign) params.set("utm_campaign", utm.campaign);
  if (utm.content) params.set("utm_content", utm.content);

  const queryString = params.toString();
  const separator = path.includes("?") ? "&" : "?";

  return `${DATAPEEK_BASE_URL}${path}${queryString ? separator + queryString : ""}`;
}

/**
 * Supported AI providers
 */
export type AIProvider = "openai" | "anthropic" | "google" | "groq" | "ollama";

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
 * Configuration for a single AI provider (API key and optional base URL)
 */
export interface AIProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Map of provider ID to provider configuration
 */
export type AIProviderConfigs = Partial<Record<AIProvider, AIProviderConfig>>;

/**
 * Multi-provider AI configuration
 * Stores API keys for all providers and tracks active provider/model
 */
export interface AIMultiProviderConfig {
  /** API keys and base URLs for each provider */
  providers: AIProviderConfigs;
  /** Currently active provider */
  activeProvider: AIProvider;
  /** Currently selected model for each provider */
  activeModels: Partial<Record<AIProvider, string>>;
}

/**
 * Provider model information for UI display
 */
export interface ProviderModel {
  id: string;
  name: string;
  recommended?: boolean;
  description?: string;
}

/**
 * Provider configuration for UI display
 */
export interface ProviderInfo {
  id: AIProvider;
  name: string;
  description: string;
  keyPrefix: string | null;
  keyUrl: string;
  models: ProviderModel[];
}

/**
 * Available AI providers with their models
 * This is the single source of truth for provider and model information
 */
export const AI_PROVIDERS: readonly ProviderInfo[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-5.1 Codex, GPT-5.1 Mini/Nano, GPT-4o",
    keyPrefix: "sk-",
    keyUrl: "https://platform.openai.com/api-keys",
    models: [
      {
        id: "gpt-5.1-codex",
        name: "GPT-5.1 Codex",
        recommended: true,
        description: "Best for SQL & code",
      },
      { id: "gpt-5.1", name: "GPT-5.1", description: "Most capable" },
      {
        id: "gpt-5.1-codex-mini",
        name: "GPT-5.1 Codex Mini",
        description: "Balanced",
      },
      { id: "gpt-5-nano", name: "GPT-5 Nano", description: "Fast & efficient" },
      { id: "gpt-4o", name: "GPT-4o", description: "Previous gen" },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        description: "Faster & cheaper",
      },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude Sonnet 4.5, Claude Opus 4.5",
    keyPrefix: "sk-ant-",
    keyUrl: "https://console.anthropic.com/settings/keys",
    models: [
      {
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet 4.5",
        recommended: true,
        description: "Balanced",
      },
      {
        id: "claude-opus-4-5",
        name: "Claude Opus 4.5",
        description: "Best for coding",
      },
      {
        id: "claude-haiku-4-5",
        name: "Claude 4.5 Haiku",
        description: "Faster & cheaper",
      },
    ],
  },
  {
    id: "google",
    name: "Google",
    description: "Gemini 3, Gemini 2.5",
    keyPrefix: "AI",
    keyUrl: "https://aistudio.google.com/app/apikey",
    models: [
      {
        id: "gemini-3-pro-preview",
        name: "Gemini 3 Pro",
        recommended: true,
        description: "Most capable",
      },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Balanced" },
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        description: "Faster",
      },
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        description: "Previous gen",
      },
    ],
  },
  {
    id: "groq",
    name: "Groq",
    description: "Llama 3.3, Mixtral (Ultra Fast)",
    keyPrefix: "gsk_",
    keyUrl: "https://console.groq.com/keys",
    models: [
      {
        id: "llama-3.3-70b-versatile",
        name: "Llama 3.3 70B",
        recommended: true,
      },
      {
        id: "llama-3.1-8b-instant",
        name: "Llama 3.1 8B",
        description: "Fastest",
      },
      { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B" },
      { id: "qwen-qwq-32b", name: "Qwen QwQ 32B", description: "Reasoning" },
    ],
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Local models (no API key)",
    keyPrefix: null,
    keyUrl: "https://ollama.ai",
    models: [
      { id: "llama3.2", name: "Llama 3.2", recommended: true },
      {
        id: "qwen2.5-coder:32b",
        name: "Qwen 2.5 Coder 32B",
        description: "Best for SQL",
      },
      { id: "codellama", name: "Code Llama" },
      { id: "mistral", name: "Mistral" },
      { id: "deepseek-coder-v2", name: "DeepSeek Coder V2" },
    ],
  },
] as const;

/**
 * Helper function to get the recommended model ID for a provider
 * Falls back to the first model if no recommended model is found
 */
function getRecommendedModel(providerId: AIProvider): string {
  const provider = AI_PROVIDERS.find((p) => p.id === providerId);
  if (!provider) {
    throw new Error(`Provider ${providerId} not found in AI_PROVIDERS`);
  }
  // Prefer recommended model, fall back to first model
  const recommendedModel =
    provider.models.find((m) => m.recommended) || provider.models[0];
  if (!recommendedModel) {
    throw new Error(`No models found for provider ${providerId}`);
  }
  return recommendedModel.id;
}

/**
 * Default model for each AI provider
 * Derived from AI_PROVIDERS - uses the recommended model for each provider
 */
export const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: getRecommendedModel("openai"),
  anthropic: getRecommendedModel("anthropic"),
  google: getRecommendedModel("google"),
  groq: getRecommendedModel("groq"),
  ollama: getRecommendedModel("ollama"),
};

/**
 * AI message for chat conversations
 */
export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * AI response types for structured output
 */
export type AIResponseType =
  | "message"
  | "query"
  | "chart"
  | "metric"
  | "schema";

/**
 * AI structured response - flat object with nullable fields.
 * Using flat structure instead of discriminated union for AI provider compatibility.
 * Check the 'type' field to determine which fields are populated.
 */
export interface AIStructuredResponse {
  type: AIResponseType;
  message: string;
  // Query fields (null when type is not query)
  sql: string | null;
  explanation: string | null;
  warning: string | null;
  /** If true, query should NOT be auto-executed (UPDATE/DELETE operations) */
  requiresConfirmation: boolean | null;
  // Chart fields (null when type is not chart)
  title: string | null;
  description: string | null;
  chartType: "bar" | "line" | "pie" | "area" | null;
  xKey: string | null;
  yKeys: string[] | null;
  // Metric fields (null when type is not metric)
  label: string | null;
  format: "number" | "currency" | "percent" | "duration" | null;
  // Schema fields (null when type is not schema)
  tables: string[] | null;
}

/**
 * Alias for AIChatResponse (same as AIStructuredResponse)
 */
export type AIChatResponse = AIStructuredResponse;

// Stored response data types (without message field since it's in content)

/**
 * Stored query data for persistence
 */
export interface StoredQueryData {
  type: "query";
  sql: string;
  explanation: string;
  warning?: string;
}

/**
 * Stored chart data for persistence
 */
export interface StoredChartData {
  type: "chart";
  title: string;
  description?: string;
  chartType: "bar" | "line" | "pie" | "area";
  sql: string;
  xKey: string;
  yKeys: string[];
}

/**
 * Stored metric data for persistence
 */
export interface StoredMetricData {
  type: "metric";
  label: string;
  sql: string;
  format: "number" | "currency" | "percent" | "duration";
}

/**
 * Stored schema data for persistence
 */
export interface StoredSchemaData {
  type: "schema";
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
  role: "user" | "assistant" | "system";
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

/**
 * SQLite connection mode (local file only)
 */
export type SQLiteMode = "local";

/**
 * SQLite-specific connection options
 */
export interface SQLiteConnectionOptions {
  /** Connection mode: local file */
  mode: SQLiteMode;
}

/**
 * MSSQL-specific connection options
 */
export interface MSSQLConnectionOptions {
  authentication?:
  | "SQL Server Authentication"
  | "ActiveDirectoryIntegrated"
  | "ActiveDirectoryPassword"
  | "ActiveDirectoryServicePrincipal"
  | "ActiveDirectoryDeviceCodeFlow";
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  enableArithAbort?: boolean;
  connectionTimeout?: number;
  requestTimeout?: number;
  pool?: {
    max?: number;
    min?: number;
    idleTimeoutMillis?: number;
  };
}

export interface ConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user?: string; // Optional for MSSQL with Azure AD authentication
  password?: string;
  ssl?: boolean;
  ssh?: boolean;
  dbType: DatabaseType;
  dstPort: number;
  sshConfig?: SSHConfig;
  /** MSSQL-specific connection options (only used when dbType is 'mssql') */
  mssqlOptions?: MSSQLConnectionOptions;
  /** SQLite-specific connection options (only used when dbType is 'sqlite') */
  sqliteOptions?: SQLiteConnectionOptions;
}

export interface SSHConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  passphrase?: string;
  localport?: number;
  authMethod: SSHAuthenticationMethod;
  privateKeyPath: string;
}

/**
 * Supported database types
 */
export type DatabaseType = "postgresql" | "mysql" | "sqlite" | "mssql";

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

/**
 * Result from a single SQL statement within a multi-statement query
 * Includes the statement that produced this result for reference
 */
export interface StatementResult {
  /** The SQL statement that produced this result */
  statement: string;
  /** Index of this statement in the original query (0-based) */
  statementIndex: number;
  /** Row data */
  rows: Record<string, unknown>[];
  /** Column metadata */
  fields: QueryField[];
  /** Number of rows returned/affected */
  rowCount: number;
  /** Execution time for this statement */
  durationMs: number;
  /** Whether this statement returns rows (SELECT) or affects rows (INSERT/UPDATE/DELETE) */
  isDataReturning: boolean;
}

/**
 * Result from executing multiple SQL statements
 * Supports queries like "SELECT * FROM users; SELECT * FROM orders;"
 */
export interface MultiStatementResult {
  /** Array of results, one per statement */
  results: StatementResult[];
  /** Total execution time for all statements */
  totalDurationMs: number;
  /** Total number of statements executed */
  statementCount: number;
}

export interface IpcResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

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
  /** Enum values (if this column is an enum type) */
  enumValues?: string[];
}

/**
 * Table or view metadata
 */
export interface TableInfo {
  name: string;
  type: "table" | "view";
  columns: ColumnInfo[];
  /** Estimated row count (if available) */
  estimatedRowCount?: number;
}

/**
 * Parameter metadata for a routine (function/procedure)
 */
export interface RoutineParameterInfo {
  name: string;
  dataType: string;
  /** Parameter mode: IN, OUT, INOUT */
  mode: "IN" | "OUT" | "INOUT";
  /** Default value (if any) */
  defaultValue?: string;
  /** Position in parameter list (1-indexed) */
  ordinalPosition: number;
}

/**
 * Stored procedure or function metadata
 */
export interface RoutineInfo {
  name: string;
  type: "function" | "procedure";
  /** Return type (for functions) */
  returnType?: string;
  /** Parameters */
  parameters: RoutineParameterInfo[];
  /** Language the routine is written in (e.g., 'plpgsql', 'sql') */
  language?: string;
  /** Whether the function is deterministic (IMMUTABLE/STABLE/VOLATILE) */
  volatility?: "IMMUTABLE" | "STABLE" | "VOLATILE";
  /** Brief description/comment */
  comment?: string;
}

/**
 * Schema/namespace metadata
 * Note: SQLite doesn't have schemas, will use 'main' as default
 */
export interface SchemaInfo {
  name: string;
  tables: TableInfo[];
  /** Stored procedures and functions */
  routines?: RoutineInfo[];
}

/**
 * Complete database schema structure
 */
export interface DatabaseSchema {
  schemas: SchemaInfo[];
  /** When the schema was last fetched */
  fetchedAt: number;
}

/**
 * Extended database schema response with cache metadata
 * Used for IPC communication between main and renderer processes
 */
export interface DatabaseSchemaResponse extends DatabaseSchema {
  /** Custom database types (enums, composites, etc.) */
  customTypes?: CustomTypeInfo[];
  /** Whether the response was served from cache */
  fromCache?: boolean;
  /** Whether the cached data is stale (past TTL but still usable) */
  stale?: boolean;
  /** Error message if background refresh failed */
  refreshError?: string;
}

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
  type: "update";
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
  type: "insert";
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
  type: "delete";
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

/**
 * PostgreSQL data types for the type selector dropdown
 */
export type PostgresDataType =
  | "smallint"
  | "integer"
  | "bigint"
  | "serial"
  | "bigserial"
  | "numeric"
  | "real"
  | "double precision"
  | "money"
  | "char"
  | "varchar"
  | "text"
  | "bytea"
  | "timestamp"
  | "timestamptz"
  | "date"
  | "time"
  | "timetz"
  | "interval"
  | "boolean"
  | "uuid"
  | "json"
  | "jsonb"
  | "xml"
  | "point"
  | "line"
  | "lseg"
  | "box"
  | "path"
  | "polygon"
  | "circle"
  | "cidr"
  | "inet"
  | "macaddr"
  | "int4range"
  | "int8range"
  | "numrange"
  | "tsrange"
  | "tstzrange"
  | "daterange";

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
  defaultType?: "value" | "expression" | "sequence";
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
  | "primary_key"
  | "foreign_key"
  | "unique"
  | "check"
  | "exclude";

/**
 * Foreign key referential actions
 */
export type ReferentialAction =
  | "NO ACTION"
  | "RESTRICT"
  | "CASCADE"
  | "SET NULL"
  | "SET DEFAULT";

/**
 * Index access methods
 */
export type IndexMethod = "btree" | "hash" | "gist" | "gin" | "spgist" | "brin";

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
  order?: "ASC" | "DESC";
  /** NULLS position */
  nullsPosition?: "FIRST" | "LAST";
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
export type PartitionType = "RANGE" | "LIST" | "HASH";

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

/**
 * Column-level ALTER TABLE operations
 */
export type AlterColumnOperation =
  | { type: "add"; column: ColumnDefinition }
  | { type: "drop"; columnName: string; cascade?: boolean }
  | { type: "rename"; oldName: string; newName: string }
  | { type: "set_type"; columnName: string; newType: string; using?: string }
  | { type: "set_nullable"; columnName: string; nullable: boolean }
  | { type: "set_default"; columnName: string; defaultValue: string | null }
  | { type: "set_comment"; columnName: string; comment: string | null };

/**
 * Constraint-level ALTER TABLE operations
 */
export type AlterConstraintOperation =
  | { type: "add_constraint"; constraint: ConstraintDefinition }
  | { type: "drop_constraint"; name: string; cascade?: boolean }
  | { type: "rename_constraint"; oldName: string; newName: string };

/**
 * Index ALTER operations
 */
export type AlterIndexOperation =
  | { type: "create_index"; index: IndexDefinition }
  | {
    type: "drop_index";
    name: string;
    cascade?: boolean;
    concurrent?: boolean;
  }
  | { type: "rename_index"; oldName: string; newName: string }
  | { type: "reindex"; name: string; concurrent?: boolean };

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
  type: "enum" | "composite" | "range" | "domain";
  /** Enum values (for enum types) */
  values?: string[];
}

/**
 * License type enumeration
 */
export type LicenseType = "personal" | "individual" | "team";

/**
 * Stored license data (encrypted locally)
 */
export interface LicenseData {
  /** License key (from Dodo Payments) */
  key: string;
  /** Type of license */
  type: LicenseType;
  /** Email address of license owner */
  email: string;
  /** Subscription expiry date / updates_until (ISO string) */
  expiresAt: string;
  /** Last version the user is entitled to use perpetually */
  perpetualVersion: string;
  /** When this license was activated (ISO string) */
  activatedAt: string;
  /** Last time the license was validated online (ISO string) */
  lastValidated: string;
  /** Dodo instance ID for this activation (needed for deactivation) */
  instanceId?: string;
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
  /** Whether this query is pinned (favorites) */
  isPinned?: boolean;
  /** Number of times this query has been used */
  usageCount: number;
  /** Last time the query was used (Unix timestamp) */
  lastUsedAt?: number;
  /** When the query was created (Unix timestamp) */
  createdAt: number;
  /** When the query was last updated (Unix timestamp) */
  updatedAt: number;
}

export type SSHAuthenticationMethod = "Password" | "Public Key";

/**
 * Individual timing phase within query execution
 */
export interface TimingPhase {
  /** Phase name (e.g., 'tcp_handshake', 'execution') */
  name: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Offset from query start in milliseconds */
  startOffset: number;
}

/**
 * Comprehensive telemetry data for a single query execution
 */
export interface QueryTelemetry {
  /** Unique identifier for this execution */
  executionId: string;
  /** Total execution time in milliseconds */
  totalDurationMs: number;
  /** All timing phases */
  phases: TimingPhase[];

  // Individual phase durations (convenience accessors)
  /** TCP connection establishment time */
  tcpHandshakeMs?: number;
  /** Database authentication/protocol handshake time */
  dbHandshakeMs?: number;
  /** Network round-trip latency */
  networkLatencyMs?: number;
  /** Query plan generation time (from EXPLAIN) */
  planningMs?: number;
  /** Server-side query execution time */
  executionMs?: number;
  /** Data transfer time from server */
  downloadMs?: number;
  /** Client-side result parsing time */
  parseMs?: number;

  // Metadata
  /** Whether an existing connection was reused */
  connectionReused: boolean;
  /** Number of rows returned */
  rowCount: number;
  /** Bytes received from server */
  bytesReceived?: number;
  /** Unix timestamp when telemetry was recorded */
  timestamp: number;
}

/**
 * Statistical aggregations for benchmark runs
 */
export interface TelemetryStats {
  avg: number;
  min: number;
  max: number;
  p90: number;
  p95: number;
  p99: number;
  stdDev: number;
}

/**
 * Per-phase statistics for benchmark analysis
 */
export interface PhaseStats {
  avg: number;
  p90: number;
  p95: number;
  p99: number;
}

/**
 * Results from running a query multiple times (benchmark mode)
 */
export interface BenchmarkResult {
  /** Number of iterations completed */
  runCount: number;
  /** Individual telemetry data for each run */
  telemetryRuns: QueryTelemetry[];
  /** Aggregated statistics across all runs */
  stats: TelemetryStats;
  /** Per-phase statistics (keyed by phase name) */
  phaseStats: Record<string, PhaseStats>;
}

/**
 * Extended query options with telemetry support
 */
export interface TelemetryQueryOptions {
  /** Unique execution ID for cancellation support */
  executionId?: string;
  /** Whether to collect detailed telemetry */
  collectTelemetry?: boolean;
  /** Number of times to run query for benchmarking */
  benchmarkRuns?: number;
}

/**
 * Multi-statement result extended with telemetry data
 */
export interface MultiStatementResultWithTelemetry extends MultiStatementResult {
  /** Telemetry data for this execution */
  telemetry?: QueryTelemetry;
  /** Benchmark results (when benchmarkRuns > 1) */
  benchmark?: BenchmarkResult;
}

/**
 * Severity levels for performance issues
 */
export type PerformanceIssueSeverity = 'critical' | 'warning' | 'info'

/**
 * Categories of performance issues detected during analysis
 */
export type PerformanceIssueType =
  | 'missing_index'
  | 'n_plus_one'
  | 'slow_query'
  | 'high_filter_ratio'
  | 'row_estimate_off'
  | 'disk_spill'

/**
 * A single performance issue detected during query analysis
 */
export interface PerformanceIssue {
  /** Unique identifier for this issue */
  id: string
  /** Type of performance issue */
  type: PerformanceIssueType
  /** Severity level */
  severity: PerformanceIssueSeverity
  /** Short title describing the issue */
  title: string
  /** Detailed description of the issue */
  message: string
  /** Actionable suggestion to fix the issue */
  suggestion: string
  /** Table name if applicable */
  tableName?: string
  /** Column name if applicable */
  columnName?: string
  /** Suggested CREATE INDEX statement */
  indexSuggestion?: string
  /** Related queries for N+1 patterns */
  relatedQueries?: string[]
  /** Threshold that was exceeded (for slow queries) */
  threshold?: number
  /** Actual value that exceeded the threshold */
  actualValue?: number
  /** Plan node type from EXPLAIN (e.g., 'Seq Scan') */
  planNodeType?: string
  /** Additional details from the plan node */
  planNodeDetails?: Record<string, unknown>
}

/**
 * Detected N+1 query pattern from history analysis
 */
export interface NplusOnePattern {
  /** Normalized query fingerprint */
  fingerprint: string
  /** Query template with placeholders */
  queryTemplate: string
  /** Number of occurrences detected */
  occurrences: number
  /** Sample queries (limited to 3) */
  querySamples: string[]
  /** Table name extracted from query */
  tableName?: string
  /** Column name in WHERE clause */
  columnName?: string
  /** Time window in which these occurred (ms) */
  timeWindowMs: number
}

/**
 * Complete result of performance analysis
 */
export interface PerformanceAnalysisResult {
  /** Unique identifier for this analysis */
  queryId: string
  /** Original query that was analyzed */
  query: string
  /** Unix timestamp when analysis was performed */
  analyzedAt: number
  /** Time taken to perform analysis (ms) */
  durationMs: number
  /** Issue counts by severity */
  issueCount: {
    critical: number
    warning: number
    info: number
  }
  /** Detected performance issues */
  issues: PerformanceIssue[]
  /** Detected N+1 patterns */
  nplusOnePatterns: NplusOnePattern[]
  /** Raw EXPLAIN plan for reference */
  explainPlan?: unknown
  /** Database type */
  dbType: 'postgresql'
  /** Connection identifier */
  connectionId: string
}

/**
 * Configuration options for performance analysis
 */
export interface PerformanceAnalysisConfig {
  /** Threshold for slow query warning (default: 1000ms) */
  slowQueryThresholdMs: number
  /** Time window for N+1 detection (default: 5000ms) */
  nplusOneWindowMs: number
  /** Minimum occurrences to flag N+1 (default: 3) */
  nplusOneMinOccurrences: number
  /** Number of recent queries to analyze for N+1 (default: 50) */
  historyLookbackCount: number
}

/**
 * Query history item for N+1 detection
 */
export interface QueryHistoryItemForAnalysis {
  /** The SQL query */
  query: string
  /** Unix timestamp when executed */
  timestamp: number
  /** Connection ID */
  connectionId: string
}

// ============================================================================
// SCHEDULED QUERIES
// ============================================================================

/**
 * Cron schedule expression or preset
 */
export type SchedulePreset =
  | 'every_minute'
  | 'every_5_minutes'
  | 'every_15_minutes'
  | 'every_30_minutes'
  | 'every_hour'
  | 'every_6_hours'
  | 'every_12_hours'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'custom'

/**
 * Maps schedule presets to human-readable labels and cron expressions
 */
export const SCHEDULE_PRESETS: Record<Exclude<SchedulePreset, 'custom'>, { label: string; cron: string }> = {
  every_minute: { label: 'Every minute', cron: '* * * * *' },
  every_5_minutes: { label: 'Every 5 minutes', cron: '*/5 * * * *' },
  every_15_minutes: { label: 'Every 15 minutes', cron: '*/15 * * * *' },
  every_30_minutes: { label: 'Every 30 minutes', cron: '*/30 * * * *' },
  every_hour: { label: 'Every hour', cron: '0 * * * *' },
  every_6_hours: { label: 'Every 6 hours', cron: '0 */6 * * *' },
  every_12_hours: { label: 'Every 12 hours', cron: '0 */12 * * *' },
  daily: { label: 'Daily at midnight', cron: '0 0 * * *' },
  weekly: { label: 'Weekly on Sunday', cron: '0 0 * * 0' },
  monthly: { label: 'Monthly on 1st', cron: '0 0 1 * *' }
}

/**
 * Schedule configuration for a scheduled query
 */
export interface ScheduleConfig {
  /** Preset schedule type */
  preset: SchedulePreset
  /** Custom cron expression (when preset is 'custom') */
  cronExpression?: string
  /** Timezone for schedule (default: local) */
  timezone?: string
}

/**
 * Status of a scheduled query
 */
export type ScheduledQueryStatus = 'active' | 'paused' | 'error'

/**
 * Result of a scheduled query execution
 */
export interface ScheduledQueryRun {
  /** Unique run identifier */
  id: string
  /** Scheduled query ID */
  scheduledQueryId: string
  /** When the run started (Unix timestamp) */
  startedAt: number
  /** When the run completed (Unix timestamp) */
  completedAt?: number
  /** Duration in milliseconds */
  durationMs?: number
  /** Whether the run succeeded */
  success: boolean
  /** Error message if failed */
  error?: string
  /** Number of rows returned/affected */
  rowCount?: number
  /** Truncated preview of results (first few rows) */
  resultPreview?: Record<string, unknown>[]
}

/**
 * A scheduled query that runs on a cron-like schedule
 */
export interface ScheduledQuery {
  /** Unique identifier */
  id: string
  /** Display name for the scheduled query */
  name: string
  /** The SQL query to execute */
  query: string
  /** Optional description */
  description?: string
  /** Connection ID to run against (required) */
  connectionId: string
  /** Schedule configuration */
  schedule: ScheduleConfig
  /** Current status */
  status: ScheduledQueryStatus
  /** Whether to show desktop notifications on completion */
  notifyOnComplete: boolean
  /** Whether to show desktop notifications on failure */
  notifyOnError: boolean
  /** Maximum number of runs to keep in history */
  maxHistoryRuns: number
  /** Last error message (if status is 'error') */
  lastError?: string
  /** Next scheduled run time (Unix timestamp) */
  nextRunAt?: number
  /** Last run time (Unix timestamp) */
  lastRunAt?: number
  /** When the scheduled query was created (Unix timestamp) */
  createdAt: number
  /** When the scheduled query was last updated (Unix timestamp) */
  updatedAt: number
}

/**
 * Input for creating a new scheduled query
 */
export type CreateScheduledQueryInput = Omit<
  ScheduledQuery,
  'id' | 'status' | 'lastError' | 'nextRunAt' | 'lastRunAt' | 'createdAt' | 'updatedAt'
>

/**
 * Input for updating a scheduled query
 */
export type UpdateScheduledQueryInput = Partial<
  Omit<ScheduledQuery, 'id' | 'createdAt' | 'updatedAt'>
>

export type WidgetType = 'chart' | 'kpi' | 'table'
export type ChartWidgetType = 'bar' | 'line' | 'area' | 'pie'
export type KPIFormat = 'number' | 'currency' | 'percent' | 'duration'

/**
 * Data source configuration for a widget
 * Supports both saved queries and inline SQL
 */
export interface WidgetDataSource {
  /** Whether to use a saved query or inline SQL */
  type: 'saved-query' | 'inline'
  /** Reference to saved query (when type is 'saved-query') */
  savedQueryId?: string
  /** Inline SQL query (when type is 'inline') */
  sql?: string
  /** Connection to execute against */
  connectionId: string
}

/**
 * Configuration for chart widgets
 */
export interface ChartWidgetConfig {
  widgetType: 'chart'
  chartType: ChartWidgetType
  /** Column to use for X axis */
  xKey: string
  /** Columns to use for Y axis (supports multiple series) */
  yKeys: string[]
  /** Custom colors for series */
  colors?: string[]
  /** Whether to show legend */
  showLegend?: boolean
  /** Whether to show grid lines */
  showGrid?: boolean
  /** Chart title */
  title?: string
  /** Chart description */
  description?: string
}

/**
 * Configuration for KPI/metric widgets
 */
export interface KPIWidgetConfig {
  widgetType: 'kpi'
  /** Display format for the value */
  format: KPIFormat
  /** Label shown above the value */
  label: string
  /** Column containing the main value */
  valueKey: string
  /** Column for trend calculation (optional) */
  trendKey?: string
  /** Whether up is good or bad for trend coloring */
  trendType?: 'up-good' | 'down-good'
  /** Column for sparkline data (optional) */
  sparklineKey?: string
  /** Prefix for value display (e.g., '$') */
  prefix?: string
  /** Suffix for value display (e.g., '%') */
  suffix?: string
}

/**
 * Configuration for table preview widgets
 */
export interface TableWidgetConfig {
  widgetType: 'table'
  /** Maximum rows to display */
  maxRows: number
  /** Specific columns to show (all if not specified) */
  columns?: string[]
  /** Default sort configuration */
  sortBy?: { column: string; direction: 'asc' | 'desc' }
}

/**
 * Union type for all widget configurations
 */
export type WidgetConfig = ChartWidgetConfig | KPIWidgetConfig | TableWidgetConfig

/**
 * Widget position and size in the grid layout
 */
export interface WidgetLayout {
  /** X position in grid units */
  x: number
  /** Y position in grid units */
  y: number
  /** Width in grid units */
  w: number
  /** Height in grid units */
  h: number
  /** Minimum width (optional) */
  minW?: number
  /** Minimum height (optional) */
  minH?: number
}

/**
 * A dashboard widget
 */
export interface Widget {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /** Data source configuration */
  dataSource: WidgetDataSource
  /** Widget-specific configuration */
  config: WidgetConfig
  /** Position and size in grid */
  layout: WidgetLayout
  /** Auto-refresh interval in seconds (optional) */
  refreshInterval?: number
  /** Whether this widget was AI-generated */
  aiGenerated?: boolean
  /** When the widget was created (Unix timestamp) */
  createdAt: number
  /** When the widget was last updated (Unix timestamp) */
  updatedAt: number
}

/**
 * Result of executing a widget's query
 */
export interface WidgetRunResult {
  /** Widget ID */
  widgetId: string
  /** Whether execution succeeded */
  success: boolean
  /** Query result data */
  data?: Record<string, unknown>[]
  /** Column metadata */
  fields?: QueryField[]
  /** Error message if failed */
  error?: string
  /** Execution duration in milliseconds */
  durationMs: number
  /** Number of rows returned */
  rowCount: number
  /** When the query was executed (Unix timestamp) */
  executedAt: number
}

/**
 * A dashboard containing widgets
 */
export interface Dashboard {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /** Optional description */
  description?: string
  /** Tags for organization */
  tags: string[]
  /** Widgets in this dashboard */
  widgets: Widget[]
  /** Number of columns in the grid layout */
  layoutCols: number
  /** Auto-refresh schedule configuration */
  refreshSchedule?: {
    /** Whether auto-refresh is enabled */
    enabled: boolean
    /** Schedule preset */
    preset: SchedulePreset
    /** Custom cron expression (when preset is 'custom') */
    cronExpression?: string
    /** Timezone for schedule */
    timezone?: string
  }
  /** When the dashboard was created (Unix timestamp) */
  createdAt: number
  /** When the dashboard was last updated (Unix timestamp) */
  updatedAt: number
  /** Version number for conflict detection (future sync) */
  version: number
  /** Server-assigned sync ID (for future cloud sync) */
  syncId?: string
}

/**
 * Input for creating a new dashboard
 */
export type CreateDashboardInput = Omit<
  Dashboard,
  'id' | 'createdAt' | 'updatedAt' | 'version'
>

/**
 * Input for updating a dashboard
 */
export type UpdateDashboardInput = Partial<
  Omit<Dashboard, 'id' | 'createdAt' | 'updatedAt'>
>

/**
 * Input for creating a new widget
 */
export type CreateWidgetInput = Omit<Widget, 'id' | 'createdAt' | 'updatedAt'>

/**
 * Input for updating a widget
 */
export type UpdateWidgetInput = Partial<Omit<Widget, 'id' | 'createdAt' | 'updatedAt'>>
