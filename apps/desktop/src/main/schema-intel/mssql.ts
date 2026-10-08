import { createHash } from 'node:crypto'
import type sql from 'mssql'
import type { SchemaIntelCheckId, SchemaIntelFinding, SchemaIntelReport } from '@shared/index'
import { commentedSql } from '@shared/schema-intel/sql-safety'

const DEFAULT_MSSQL_CHECKS: SchemaIntelCheckId[] = [
  'tables_without_pk',
  'missing_fk_indexes',
  'duplicate_indexes',
  'unused_indexes',
  'nullable_fks'
]

type Row = Record<string, unknown>

function qid(identifier: string): string {
  return '[' + identifier.replace(/\]/g, ']]') + ']'
}

function qualified(schema: string, name: string): string {
  return `${qid(schema)}.${qid(name)}`
}

async function runQuery(pool: sql.ConnectionPool, query: string): Promise<Row[]> {
  const result = await pool.request().query(query)
  return result.recordset as unknown as Row[]
}

async function checkTablesWithoutPk(pool: sql.ConnectionPool): Promise<SchemaIntelFinding[]> {
  const rows = await runQuery(
    pool,
    `
    SELECT
      s.name AS schema_name,
      t.name AS table_name,
      SUM(p.rows) AS estimated_rows
    FROM sys.tables t
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    LEFT JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
    WHERE NOT EXISTS (
      SELECT 1 FROM sys.indexes i
      WHERE i.object_id = t.object_id AND i.is_primary_key = 1
    )
    GROUP BY s.name, t.name
    ORDER BY SUM(p.rows) DESC
    `
  )
  return rows.map((row) => {
    const s = String(row.schema_name)
    const t = String(row.table_name)
    return {
      checkId: 'tables_without_pk',
      severity: 'warning',
      title: `${s}.${t} has no primary key`,
      detail:
        'SQL Server can still use a clustered index, but rows without a PK are harder to uniquely identify for edits and replication.',
      entity: { schema: s, name: t, kind: 'table' },
      metadata: { estimatedRows: Number(row.estimated_rows ?? 0) },
      suggestedSql: commentedSql([
        'Review and pick a unique column before running:',
        `ALTER TABLE ${qualified(s, t)} ADD id BIGINT IDENTITY(1,1) PRIMARY KEY;`
      ])
    } satisfies SchemaIntelFinding
  })
}

/**
 * The FK's columns, in constraint order, as a JSON array of `{"name": ...}`.
 *
 * A comma-separated string is ambiguous: SQL Server allows a comma inside an
 * identifier, so `[a,b]` cannot be told apart from the two columns `a` and `b`.
 * `FOR XML PATH` keeps the order deterministic on every supported version
 * (STRING_AGG only accepts ORDER BY from 2022 on) and `FOR JSON PATH` gives an
 * unambiguous payload.
 */
function columnList(objectIdAlias: string, filter = ''): string {
  return `(
      SELECT c.name AS name
      FROM sys.foreign_key_columns fkc
      JOIN sys.columns c
        ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
      WHERE fkc.constraint_object_id = ${objectIdAlias}.object_id
        ${filter}
      ORDER BY fkc.constraint_column_id
      FOR JSON PATH
    )`
}

/** Parses a `FOR JSON PATH` payload into its rows; tolerant of NULL, empty and junk. */
function parseJsonRows(raw: unknown): Row[] {
  if (typeof raw !== 'string' || raw === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is Row => typeof entry === 'object' && entry !== null)
  } catch {
    return []
  }
}

/** Parses the payload from {@link columnList}; tolerant of NULL, empty and junk. */
export function parseFkColumns(raw: unknown): string[] {
  return parseJsonRows(raw)
    .map((entry) => String(entry.name ?? ''))
    .filter(Boolean)
}

/**
 * A deterministic name for the suggested index.
 *
 * Naively truncating a long name makes different (table, column) combinations
 * collide, so the DDL a user copy-pastes can clash with an index that already
 * exists. The digest keeps the name unique while staying a comfortable length.
 */
export function suggestIndexName(table: string, cols: string[]): string {
  const base = `idx_${table}_${cols.join('_')}`
  if (base.length <= 60) return base
  const digest = createHash('sha1')
    .update(`${table}\u0000${cols.join('\u0000')}`)
    .digest('hex')
    .slice(0, 8)
  return `${base.slice(0, 51)}_${digest}`
}

async function checkMissingFkIndexes(pool: sql.ConnectionPool): Promise<SchemaIntelFinding[]> {
  // A covering index has the FK columns as its leading key columns, in the same
  // order, so each FK column must sit at key_ordinal = its constraint_column_id.
  // Included columns carry key_ordinal 0, so they never match. A filtered index
  // does not cover every row, so it cannot serve the FK either.
  const rows = await runQuery(
    pool,
    `
    SELECT
      s.name AS schema_name,
      t.name AS table_name,
      fk.name AS constraint_name,
      ${columnList('fk')} AS columns_json
    FROM sys.foreign_keys fk
    JOIN sys.tables t ON t.object_id = fk.parent_object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM sys.indexes i
      WHERE i.object_id = fk.parent_object_id
        AND i.is_disabled = 0
        AND i.is_hypothetical = 0
        AND i.has_filter = 0
        AND NOT EXISTS (
          SELECT 1
          FROM sys.foreign_key_columns fkc
          WHERE fkc.constraint_object_id = fk.object_id
            AND NOT EXISTS (
              SELECT 1
              FROM sys.index_columns ic
              WHERE ic.object_id = i.object_id
                AND ic.index_id = i.index_id
                AND ic.column_id = fkc.parent_column_id
                AND ic.key_ordinal = fkc.constraint_column_id
            )
        )
    )
    ORDER BY s.name, t.name, fk.name
    `
  )
  return toMissingFkIndexFindings(rows)
}

/** Shapes the query's rows into findings. Exported so the shaping is testable. */
export function toMissingFkIndexFindings(rows: Row[]): SchemaIntelFinding[] {
  return rows.map((row) => {
    const s = String(row.schema_name)
    const t = String(row.table_name)
    const cols = parseFkColumns(row.columns_json)
    const idxName = suggestIndexName(t, cols)
    return {
      checkId: 'missing_fk_indexes',
      severity: 'warning',
      title: `${s}.${t}(${cols.join(', ')}) is a FK without a supporting index`,
      detail:
        'Deletes on the parent table and joins over this foreign key scan the whole child table. Add a matching index.',
      entity: { schema: s, name: t, kind: 'foreign_key' },
      metadata: { constraint: row.constraint_name, columns: cols },
      suggestedSql: cols.length
        ? `CREATE INDEX ${qid(idxName)} ON ${qualified(s, t)} (${cols.map(qid).join(', ')});`
        : undefined
    } satisfies SchemaIntelFinding
  })
}

async function checkNullableFks(pool: sql.ConnectionPool): Promise<SchemaIntelFinding[]> {
  const rows = await runQuery(
    pool,
    `
    SELECT
      s.name AS schema_name,
      t.name AS table_name,
      fk.name AS constraint_name,
      ${columnList('fk', 'AND c.is_nullable = 1')} AS columns_json
    FROM sys.foreign_keys fk
    JOIN sys.tables t ON t.object_id = fk.parent_object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE EXISTS (
      SELECT 1
      FROM sys.foreign_key_columns fkc
      JOIN sys.columns c
        ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
      WHERE fkc.constraint_object_id = fk.object_id
        AND c.is_nullable = 1
    )
    ORDER BY s.name, t.name, fk.name
    `
  )
  return toNullableFkFindings(rows)
}

/** Shapes the query's rows into findings. Exported so the shaping is testable. */
export function toNullableFkFindings(rows: Row[]): SchemaIntelFinding[] {
  return rows.map((row) => {
    const s = String(row.schema_name)
    const t = String(row.table_name)
    const cols = parseFkColumns(row.columns_json)
    return {
      checkId: 'nullable_fks',
      severity: 'info',
      title: `${s}.${t}(${cols.join(', ')}) is a nullable foreign key`,
      detail:
        'If NULL is not a valid "no parent" for this column, switch it to NOT NULL to avoid silently orphaned rows.',
      entity: { schema: s, name: t, kind: 'foreign_key' },
      metadata: { constraint: row.constraint_name, columns: cols }
    } satisfies SchemaIntelFinding
  })
}

/**
 * An index's columns as a JSON array of `{"name": ..., "desc": ...}`: the key
 * columns in key order with their sort direction, or the included columns in
 * column order. Same reasoning as {@link columnList}: a comma-joined list
 * cannot be split back apart once a name contains a comma.
 */
function indexColumnList(indexAlias: string, part: 'key' | 'include'): string {
  const filter = part === 'key' ? 'ic.key_ordinal > 0' : 'ic.is_included_column = 1'
  const order = part === 'key' ? 'ic.key_ordinal' : 'ic.column_id'
  return `(
      SELECT c.name AS name, ic.is_descending_key AS [desc]
      FROM sys.index_columns ic
      JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
      WHERE ic.object_id = ${indexAlias}.object_id
        AND ic.index_id = ${indexAlias}.index_id
        AND ${filter}
      ORDER BY ${order}
      FOR JSON PATH
    )`
}

interface IndexColumn {
  name: string
  desc: boolean
}

/** Parses the payload from {@link indexColumnList}; tolerant of NULL, empty and junk. */
export function parseIndexColumns(raw: unknown): IndexColumn[] {
  return parseJsonRows(raw)
    .map((entry) => ({ name: String(entry.name ?? ''), desc: Number(entry.desc) === 1 }))
    .filter((column) => column.name !== '')
}

interface IndexRow {
  schema: string
  table: string
  name: string
  /** `sys.indexes.type`: 1 is clustered, 2 nonclustered. */
  type: number
  isUnique: boolean
  isPrimaryKey: boolean
  isUniqueConstraint: boolean
  filter: string | null
  keys: IndexColumn[]
  includes: string[]
}

function readIndexRow(row: Row): IndexRow {
  return {
    schema: String(row.schema_name),
    table: String(row.table_name),
    name: String(row.index_name),
    type: Number(row.index_type),
    isUnique: Number(row.is_unique) === 1,
    isPrimaryKey: Number(row.is_primary_key) === 1,
    isUniqueConstraint: Number(row.is_unique_constraint) === 1,
    filter: row.filter_definition == null ? null : String(row.filter_definition),
    keys: parseIndexColumns(row.key_columns_json),
    includes: parseIndexColumns(row.included_columns_json).map((column) => column.name)
  }
}

/**
 * Orders a group of duplicates so the one to keep comes first. A clustered
 * index is the table itself, a primary key or unique constraint is part of the
 * schema's contract, and after that the first name is as good as any.
 */
function keptFirst(a: IndexRow, b: IndexRow): number {
  const rank = (index: IndexRow): number =>
    index.type === 1 ? 0 : index.isPrimaryKey ? 1 : index.isUniqueConstraint ? 2 : 3
  return rank(a) - rank(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
}

/** The statement that removes an index; one backing a constraint goes through the constraint. */
function dropIndexSql(index: IndexRow): string {
  const table = qualified(index.schema, index.table)
  return index.isPrimaryKey || index.isUniqueConstraint
    ? `ALTER TABLE ${table} DROP CONSTRAINT ${qid(index.name)};`
    : `DROP INDEX ${qid(index.name)} ON ${table};`
}

async function checkDuplicateIndexes(pool: sql.ConnectionPool): Promise<SchemaIntelFinding[]> {
  // One row per rowstore index, grouped in TypeScript. Grouping in T-SQL would
  // mean GROUP BY over the JSON payloads, and a catalog query that fails only
  // degrades to a skipped check, which the canned-row tests cannot see.
  // XML, spatial and columnstore indexes have no key list to compare.
  const rows = await runQuery(
    pool,
    `
    SELECT
      s.name AS schema_name,
      t.name AS table_name,
      i.name AS index_name,
      i.type AS index_type,
      i.is_unique,
      i.is_primary_key,
      i.is_unique_constraint,
      i.filter_definition,
      ${indexColumnList('i', 'key')} AS key_columns_json,
      ${indexColumnList('i', 'include')} AS included_columns_json
    FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE i.index_id > 0
      AND i.type IN (1, 2)
      AND i.is_hypothetical = 0
      AND i.is_disabled = 0
    ORDER BY s.name, t.name, i.name
    `
  )
  return toDuplicateIndexFindings(rows)
}

/** Groups the query's rows into findings. Exported so the grouping is testable. */
export function toDuplicateIndexFindings(rows: Row[]): SchemaIntelFinding[] {
  // Two indexes are duplicates when everything but the name matches: key
  // columns in order with their sort direction, included columns, uniqueness
  // and filter. Clustered and nonclustered compare alike, since a nonclustered
  // index on the clustered key is redundant with it.
  const groups = new Map<string, IndexRow[]>()
  for (const row of rows) {
    const index = readIndexRow(row)
    // An unreadable column payload must not pair up with another one.
    if (index.keys.length === 0) continue
    const signature = JSON.stringify([
      index.schema,
      index.table,
      index.isUnique,
      index.filter,
      index.keys,
      index.includes
    ])
    groups.set(signature, [...(groups.get(signature) ?? []), index])
  }

  const findings: SchemaIntelFinding[] = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const [kept, ...duplicates] = [...group].sort(keptFirst)
    const names = duplicates.map((index) => index.name)
    findings.push({
      checkId: 'duplicate_indexes',
      severity: 'warning',
      title: `${kept.schema}.${kept.table} has duplicate index${names.length > 1 ? 'es' : ''}: ${names.join(', ')}`,
      detail:
        'These indexes have the same key columns, included columns, uniqueness and filter. Keeping one is usually enough; the others only slow down writes.',
      entity: { schema: kept.schema, name: kept.table, kind: 'table' },
      metadata: {
        keptIndex: kept.name,
        duplicates: names,
        columns: kept.keys.map((column) => column.name),
        includedColumns: kept.includes
      },
      suggestedSql: duplicates.map(dropIndexSql).join('\n')
    })
  }
  return findings
}

async function checkUnusedIndexes(pool: sql.ConnectionPool): Promise<SchemaIntelFinding[]> {
  // sys.dm_db_index_usage_stats needs VIEW SERVER STATE (VIEW DATABASE STATE
  // on Azure SQL Database). Without it the query fails, and the runner records
  // the check as skipped with the server's reason. Only nonclustered rowstore
  // indexes are candidates: dropping a clustered index rebuilds the table, and
  // a primary key or unique index enforces a rule whether or not it is read.
  // An index with writes but no reads is the signal; one with no row in the
  // DMV at all has seen nothing since the counters reset, which says nothing.
  const rows = await runQuery(
    pool,
    `
    SELECT
      s.name AS schema_name,
      t.name AS table_name,
      i.name AS index_name,
      u.user_updates,
      u.last_user_update,
      ${indexColumnList('i', 'key')} AS key_columns_json
    FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    JOIN sys.dm_db_index_usage_stats u
      ON u.database_id = DB_ID() AND u.object_id = i.object_id AND u.index_id = i.index_id
    WHERE i.type = 2
      AND i.is_primary_key = 0
      AND i.is_unique = 0
      AND i.is_hypothetical = 0
      AND i.is_disabled = 0
      AND u.user_seeks + u.user_scans + u.user_lookups = 0
      AND u.user_updates > 0
    ORDER BY u.user_updates DESC, s.name, t.name, i.name
    `
  )
  return toUnusedIndexFindings(rows)
}

function timestamp(value: unknown): string | undefined {
  if (value == null) return undefined
  return value instanceof Date ? value.toISOString() : String(value)
}

/** Shapes the query's rows into findings. Exported so the shaping is testable. */
export function toUnusedIndexFindings(rows: Row[]): SchemaIntelFinding[] {
  return rows.map((row) => {
    const s = String(row.schema_name)
    const t = String(row.table_name)
    const indexName = String(row.index_name)
    const userUpdates = Number(row.user_updates ?? 0)
    return {
      checkId: 'unused_indexes',
      severity: 'info',
      title: `${s}.${t}.${indexName} has no recorded reads`,
      detail: `Written ${userUpdates} time${userUpdates === 1 ? '' : 's'} and never read since the usage counters last reset, which happens when SQL Server restarts or the database comes online. If that covers a normal workload, it is a candidate to drop. Clustered indexes, primary keys and unique indexes are not listed.`,
      entity: { schema: s, name: indexName, kind: 'index' },
      metadata: {
        table: t,
        columns: parseIndexColumns(row.key_columns_json).map((column) => column.name),
        userUpdates,
        lastUserUpdate: timestamp(row.last_user_update)
      },
      suggestedSql: `DROP INDEX ${qid(indexName)} ON ${qualified(s, t)};`
    } satisfies SchemaIntelFinding
  })
}

const CHECK_RUNNERS: Partial<
  Record<SchemaIntelCheckId, (pool: sql.ConnectionPool) => Promise<SchemaIntelFinding[]>>
> = {
  tables_without_pk: checkTablesWithoutPk,
  missing_fk_indexes: checkMissingFkIndexes,
  duplicate_indexes: checkDuplicateIndexes,
  unused_indexes: checkUnusedIndexes,
  nullable_fks: checkNullableFks
}

export async function runMssqlSchemaIntel(
  pool: sql.ConnectionPool,
  requested?: SchemaIntelCheckId[]
): Promise<SchemaIntelReport> {
  const started = Date.now()
  const toRun = requested && requested.length > 0 ? requested : DEFAULT_MSSQL_CHECKS
  const findings: SchemaIntelFinding[] = []
  const skipped: SchemaIntelReport['skipped'] = []

  for (const checkId of toRun) {
    const runner = CHECK_RUNNERS[checkId]
    if (!runner) {
      skipped.push({ checkId, reason: 'Check not supported on SQL Server' })
      continue
    }
    try {
      const found = await runner(pool)
      findings.push(...found)
    } catch (err) {
      skipped.push({
        checkId,
        reason: err instanceof Error ? err.message : String(err)
      })
    }
  }
  return {
    findings,
    skipped,
    durationMs: Date.now() - started,
    ranAt: Date.now()
  }
}
