import { createHash } from 'node:crypto'
import type sql from 'mssql'
import type { SchemaIntelCheckId, SchemaIntelFinding, SchemaIntelReport } from '@shared/index'
import { commentedSql } from '@shared/schema-intel/sql-safety'

const DEFAULT_MSSQL_CHECKS: SchemaIntelCheckId[] = [
  'tables_without_pk',
  'missing_fk_indexes',
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

/** Parses the payload from {@link columnList}; tolerant of NULL, empty and junk. */
export function parseFkColumns(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => String((entry as { name?: unknown } | undefined)?.name ?? ''))
      .filter(Boolean)
  } catch {
    return []
  }
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

const CHECK_RUNNERS: Partial<
  Record<SchemaIntelCheckId, (pool: sql.ConnectionPool) => Promise<SchemaIntelFinding[]>>
> = {
  tables_without_pk: checkTablesWithoutPk,
  missing_fk_indexes: checkMissingFkIndexes,
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
