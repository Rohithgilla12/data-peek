import type sql from 'mssql'
import type { SchemaIntelCheckId, SchemaIntelFinding, SchemaIntelReport } from '@shared/index'

const DEFAULT_MSSQL_CHECKS: SchemaIntelCheckId[] = ['tables_without_pk']

type Row = Record<string, unknown>

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
      metadata: { estimatedRows: Number(row.estimated_rows ?? 0) }
    } satisfies SchemaIntelFinding
  })
}

const CHECK_RUNNERS: Partial<
  Record<SchemaIntelCheckId, (pool: sql.ConnectionPool) => Promise<SchemaIntelFinding[]>>
> = {
  tables_without_pk: checkTablesWithoutPk
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