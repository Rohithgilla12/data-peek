import type sql from 'mssql'
import type { SchemaIntelCheckId, SchemaIntelFinding, SchemaIntelReport } from '@shared/index'

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
      suggestedSql: `-- Review and pick a unique column before running:\n-- ALTER TABLE ${qualified(s, t)} ADD id BIGINT IDENTITY(1,1) PRIMARY KEY;`
    } satisfies SchemaIntelFinding
  })
}

/**
 * The FK's columns, in constraint order, as one comma-separated string. FOR XML
 * PATH keeps the order deterministic on every supported SQL Server version
 * (STRING_AGG only accepts ORDER BY from 2022 on).
 */
function columnList(objectIdAlias: string, filter = ''): string {
  return `STUFF((
      SELECT ',' + c.name
      FROM sys.foreign_key_columns fkc
      JOIN sys.columns c
        ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
      WHERE fkc.constraint_object_id = ${objectIdAlias}.object_id
        ${filter}
      ORDER BY fkc.constraint_column_id
      FOR XML PATH(''), TYPE
    ).value('.', 'nvarchar(max)'), 1, 1, '')`
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
      ${columnList('fk')} AS columns
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
  return rows.map((row) => {
    const s = String(row.schema_name)
    const t = String(row.table_name)
    const cols = String(row.columns ?? '')
      .split(',')
      .filter(Boolean)
    const idxName = `idx_${t}_${cols.join('_')}`.slice(0, 60)
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
      ${columnList('fk', 'AND c.is_nullable = 1')} AS columns
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
  return rows.map((row) => {
    const s = String(row.schema_name)
    const t = String(row.table_name)
    const cols = String(row.columns ?? '')
      .split(',')
      .filter(Boolean)
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
