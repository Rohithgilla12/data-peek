import type { DatabaseType } from "./index";

/** User-facing features that exist for some databases and not others. */
export type Capability =
  | "inlineEdit"
  | "tableDesigner"
  | "csvImport"
  | "dataGenerator"
  | "transactions"
  | "stepThrough"
  | "notifications"
  | "pgDump"
  | "performanceAnalysis"
  | "columnStats"
  | "crossTabRefs"
  | "healthActiveQueries"
  | "healthTableSizes"
  | "healthCacheStats"
  | "healthLocks"
  | "killQuery";

export type CapabilityRow = Readonly<Record<Capability, boolean>>;

/**
 * The single declaration of what each database can do in data-peek.
 *
 * Every dbType declares every capability, so adding a dbType or a capability does not
 * compile until the cell is filled. The literal type feeds `DbTypesWith<C>`, which the
 * dialect builders use as their key type: a builder cannot be handed a dbType whose
 * cell is false. db-capabilities.test.ts checks the rows against the optional adapter
 * methods and against SCHEMA_INTEL_CHECKS.
 */
export const DB_CAPABILITIES = {
  postgresql: {
    inlineEdit: true,
    tableDesigner: true,
    csvImport: true,
    dataGenerator: true,
    transactions: true,
    stepThrough: true,
    notifications: true,
    pgDump: true,
    performanceAnalysis: true,
    columnStats: true,
    crossTabRefs: true,
    healthActiveQueries: true,
    healthTableSizes: true,
    healthCacheStats: true,
    healthLocks: true,
    killQuery: true,
  },
  mysql: {
    inlineEdit: true,
    tableDesigner: true,
    csvImport: true,
    dataGenerator: true,
    transactions: false,
    stepThrough: false,
    notifications: false,
    pgDump: false,
    performanceAnalysis: false,
    columnStats: true,
    crossTabRefs: true,
    healthActiveQueries: true,
    healthTableSizes: true,
    healthCacheStats: true,
    healthLocks: true,
    killQuery: true,
  },
  mssql: {
    inlineEdit: true,
    tableDesigner: true,
    csvImport: true,
    dataGenerator: true,
    transactions: false,
    stepThrough: false,
    notifications: false,
    pgDump: false,
    performanceAnalysis: false,
    columnStats: true,
    crossTabRefs: true,
    healthActiveQueries: true,
    healthTableSizes: true,
    healthCacheStats: true,
    healthLocks: true,
    killQuery: true,
  },
  sqlite: {
    inlineEdit: true,
    tableDesigner: true,
    csvImport: true,
    dataGenerator: true,
    transactions: false,
    stepThrough: false,
    notifications: false,
    pgDump: false,
    performanceAnalysis: false,
    columnStats: false,
    crossTabRefs: true,
    healthActiveQueries: false,
    healthTableSizes: true,
    healthCacheStats: false,
    healthLocks: false,
    killQuery: false,
  },
  clickhouse: {
    inlineEdit: false,
    tableDesigner: false,
    csvImport: false,
    dataGenerator: false,
    transactions: false,
    stepThrough: false,
    notifications: false,
    pgDump: false,
    performanceAnalysis: false,
    columnStats: false,
    crossTabRefs: false,
    healthActiveQueries: false,
    healthTableSizes: true,
    healthCacheStats: false,
    healthLocks: false,
    killQuery: false,
  },
} as const satisfies Record<DatabaseType, CapabilityRow>;

/** Database types whose cell for `C` is literally `true`. */
export type DbTypesWith<C extends Capability> = {
  [K in DatabaseType]: (typeof DB_CAPABILITIES)[K][C] extends true ? K : never;
}[DatabaseType];

export const CAPABILITY_LABELS: Readonly<Record<Capability, string>> = {
  inlineEdit: "Inline editing",
  tableDesigner: "Table designer",
  csvImport: "CSV import",
  dataGenerator: "Data generator",
  transactions: "Transaction support",
  stepThrough: "Step-through execution",
  notifications: "LISTEN/NOTIFY",
  pgDump: "Database export and import",
  performanceAnalysis: "Performance analysis",
  columnStats: "Column profiling",
  crossTabRefs: "Cross-tab referencing",
  healthActiveQueries: "Active query monitoring",
  healthTableSizes: "Table size monitoring",
  healthCacheStats: "Cache monitoring",
  healthLocks: "Lock monitoring",
  killQuery: "Kill query",
};

export const DB_TYPE_LABELS: Readonly<Record<DatabaseType, string>> = {
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mssql: "SQL Server",
  sqlite: "SQLite",
  clickhouse: "ClickHouse",
};

export const NO_CAPABILITIES: CapabilityRow = Object.freeze(
  Object.fromEntries(Object.keys(CAPABILITY_LABELS).map((k) => [k, false])),
) as CapabilityRow;

export function hasCapability<C extends Capability>(
  dbType: DatabaseType | undefined,
  cap: C,
): dbType is DbTypesWith<C> {
  return dbType !== undefined && DB_CAPABILITIES[dbType][cap];
}

export function capabilityErrorMessage(
  dbType: DatabaseType,
  cap: Capability,
): string {
  return `${CAPABILITY_LABELS[cap]} is not available for ${DB_TYPE_LABELS[dbType]} connections.`;
}

/** Thrown by main (IPC guard and adapter backstops). */
export class CapabilityError extends Error {
  readonly code = "CAPABILITY_UNAVAILABLE" as const;
  constructor(
    readonly dbType: DatabaseType,
    readonly capability: Capability,
  ) {
    super(capabilityErrorMessage(dbType, capability));
    this.name = "CapabilityError";
  }
}
