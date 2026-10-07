import type {
  ColumnInfo,
  QueryField,
  SchemaInfo,
  StatementResult,
  TableInfo,
  TableSizeInfo,
  TextExplainPlan
} from '@shared/index'

/** Databases hidden from the explorer. */
export const HIDDEN_DATABASES = ['system', 'INFORMATION_SCHEMA', 'information_schema']

/** The slice of @clickhouse/client's ResponseJSON the adapter reads. */
export interface ChJsonResponse {
  meta?: Array<{ name: string; type: string }>
  data: Record<string, unknown>[]
  rows?: number
  /** Present when the server hit an error after it had already started the response. */
  exception?: string
}

export interface SystemTableRow {
  database: string
  name: string
  engine: string
  total_rows: string | number | null
}

export interface SystemColumnRow {
  database: string
  table: string
  name: string
  type: string
  position: string | number
  default_kind: string
  default_expression: string
  is_in_primary_key: number
  comment: string
}

export interface SystemPartsRow {
  database: string
  table: string
  rows: string | number
  bytes_on_disk: string | number
  index_bytes: string | number
}

export type StatementKind = 'query' | 'command'

const ROW_RETURNING = new Set(['SELECT', 'WITH', 'SHOW', 'DESC', 'DESCRIBE', 'EXPLAIN', 'EXISTS'])

/** Drop leading line and block comments, whitespace, and opening parens. */
export function stripLeading(sql: string): string {
  let s = sql
  for (;;) {
    const before = s
    s = s.replace(/^[\s(]+/, '')
    if (s.startsWith('--') || s.startsWith('#')) {
      const nl = s.indexOf('\n')
      s = nl === -1 ? '' : s.slice(nl + 1)
    } else if (s.startsWith('/*')) {
      const end = s.indexOf('*/')
      s = end === -1 ? '' : s.slice(end + 2)
    }
    if (s === before) return s
  }
}

/**
 * Row-returning statements go through client.query (JSON body); everything else
 * (INSERT, DDL, SET, SYSTEM, KILL, OPTIMIZE) through client.command. `INSERT ... SELECT`
 * is a command because its first word is INSERT.
 */
export function classifyStatement(statement: string): StatementKind {
  const first =
    stripLeading(statement)
      .match(/^[A-Za-z]+/)?.[0]
      .toUpperCase() ?? ''
  return ROW_RETURNING.has(first) ? 'query' : 'command'
}

/**
 * client.query appends `FORMAT JSON`, so a user-written trailing FORMAT clause would be
 * a duplicate and a server syntax error. Refuse it with a message that says why.
 */
export function hasTrailingFormatClause(statement: string): boolean {
  return /\bFORMAT\s+[A-Za-z][A-Za-z0-9_]*\s*;?\s*$/i.test(statement)
}

export const FORMAT_CLAUSE_MESSAGE = 'Remove the FORMAT clause; data-peek formats results itself.'

export function toQueryFields(meta: ChJsonResponse['meta']): QueryField[] {
  return (meta ?? []).map((m) => ({ name: m.name, dataType: m.type }))
}

export function toStatementResult(
  statement: string,
  statementIndex: number,
  response: ChJsonResponse,
  durationMs: number
): StatementResult {
  if (typeof response.exception === 'string') throw new Error(response.exception)
  const rows = response.data ?? []
  return {
    statement,
    statementIndex,
    rows,
    fields: toQueryFields(response.meta),
    rowCount: response.rows ?? rows.length,
    durationMs,
    isDataReturning: true
  }
}

/** `written_rows` from the X-ClickHouse-Summary header, or 0 when absent. */
export function rowCountFromSummary(summary: { written_rows?: string } | undefined): number {
  const n = Number(summary?.written_rows)
  return Number.isFinite(n) ? n : 0
}

/** `max_execution_time` is whole seconds; a sub-second request still gets one. */
export function timeoutSettings(
  queryTimeoutMs: number | undefined
): { max_execution_time: number; timeout_overflow_mode: 'throw' } | Record<string, never> {
  if (
    typeof queryTimeoutMs !== 'number' ||
    !Number.isFinite(queryTimeoutMs) ||
    queryTimeoutMs <= 0
  ) {
    return {}
  }
  return { max_execution_time: Math.ceil(queryTimeoutMs / 1000), timeout_overflow_mode: 'throw' }
}

/** `Nullable(T)` or `LowCardinality(Nullable(T))` -> true. */
export function isNullableType(type: string): boolean {
  return /^(LowCardinality\()?Nullable\(/.test(type)
}

/** `Enum8('free' = 1, 'pro' = 2)` -> ['free', 'pro'], also under Nullable/LowCardinality. */
export function parseEnumValues(type: string): string[] | undefined {
  const body = type.match(/Enum(?:8|16)?\((.*)\)/)?.[1]
  if (body === undefined) return undefined
  const values: string[] = []
  const re = /'((?:[^'\\]|\\.)*)'\s*=\s*-?\d+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    values.push(m[1].replace(/\\(.)/g, '$1'))
  }
  return values
}

export function tableTypeFromEngine(engine: string): TableInfo['type'] {
  if (engine === 'MaterializedView') return 'materialized_view'
  if (engine === 'View' || engine === 'LiveView' || engine === 'WindowView') return 'view'
  return 'table'
}

/** MATERIALIZED/ALIAS/EPHEMERAL defaults keep their kind so the user can tell them apart. */
export function columnDefault(kind: string, expression: string): string | undefined {
  if (!expression) return undefined
  return kind === 'DEFAULT' ? expression : `${kind} ${expression}`
}

export function toColumnInfo(row: SystemColumnRow): ColumnInfo {
  return {
    name: row.name,
    dataType: row.type,
    isNullable: isNullableType(row.type),
    isPrimaryKey: row.is_in_primary_key === 1,
    defaultValue: columnDefault(row.default_kind, row.default_expression),
    ordinalPosition: Number(row.position),
    enumValues: parseEnumValues(row.type)
  }
}

/** Storage tables of a materialized view without a TO target. */
function isInnerTable(name: string): boolean {
  return name.startsWith('.inner.') || name.startsWith('.inner_id.')
}

/**
 * Group system rows into SchemaInfo[] (one per database). The connection's own
 * database sorts first, the rest alphabetically; tables alphabetically within.
 */
export function mapSystemRows(
  tables: SystemTableRow[],
  columns: SystemColumnRow[],
  ownDatabase: string
): SchemaInfo[] {
  const columnsByTable = new Map<string, ColumnInfo[]>()
  for (const col of columns) {
    const key = `${col.database}\u0000${col.table}`
    const list = columnsByTable.get(key) ?? []
    list.push(toColumnInfo(col))
    columnsByTable.set(key, list)
  }

  const byDatabase = new Map<string, TableInfo[]>()
  for (const t of tables) {
    if (isInnerTable(t.name)) continue
    const cols = (columnsByTable.get(`${t.database}\u0000${t.name}`) ?? []).sort(
      (a, b) => a.ordinalPosition - b.ordinalPosition
    )
    const totalRows = t.total_rows === null ? undefined : Number(t.total_rows)
    const info: TableInfo = {
      name: t.name,
      type: tableTypeFromEngine(t.engine),
      columns: cols,
      ...(totalRows !== undefined && Number.isFinite(totalRows)
        ? { estimatedRowCount: totalRows }
        : {})
    }
    const list = byDatabase.get(t.database) ?? []
    list.push(info)
    byDatabase.set(t.database, list)
  }

  const names = Array.from(byDatabase.keys()).sort((a, b) => {
    if (a === ownDatabase) return -1
    if (b === ownDatabase) return 1
    return a.localeCompare(b)
  })
  return names.map((name) => ({
    name,
    tables: byDatabase.get(name)!.sort((a, b) => a.name.localeCompare(b.name))
  }))
}

export function toTextPlan(rows: Array<{ explain: string }>): TextExplainPlan {
  return { kind: 'text', lines: rows.map((r) => r.explain) }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 bytes'
  const units = ['bytes', 'kB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

export function mapPartsRows(rows: SystemPartsRow[]): TableSizeInfo[] {
  return rows.map((r) => {
    const dataSizeBytes = Number(r.bytes_on_disk)
    const indexSizeBytes = Number(r.index_bytes)
    const totalSizeBytes = dataSizeBytes + indexSizeBytes
    return {
      schema: r.database,
      table: r.table,
      rowCountEstimate: Number(r.rows),
      dataSize: formatBytes(dataSizeBytes),
      dataSizeBytes,
      indexSize: formatBytes(indexSizeBytes),
      indexSizeBytes,
      totalSize: formatBytes(totalSizeBytes),
      totalSizeBytes
    }
  })
}
