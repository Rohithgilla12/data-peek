import type { ClientBase } from 'pg'
import type { SchemaIntelCheckId, SchemaIntelFinding, SchemaIntelReport } from '@shared/index'

/**
 * Default set of checks run when the caller doesn't pass an explicit list.
 * Order here is the display order in the UI fallback path.
 */
const DEFAULT_PG_CHECKS: SchemaIntelCheckId[] = [
  'tables_without_pk',
  'missing_fk_indexes',
  'duplicate_indexes',
  'unused_indexes',
  'invalid_indexes',
  'bloated_tables',
  'never_vacuumed',
  'nullable_fks'
]

type Row = Record<string, unknown>

async function runQuery(client: ClientBase, sql: string): Promise<Row[]> {
  const result = await client.query(sql)
  return result.rows as Row[]
}

function qid(identifier: string): string {
  return '"' + identifier.replace(/"/g, '""') + '"'
}

function qualified(schema: string, name: string): string {
  return `${qid(schema)}.${qid(name)}`
}

async function checkTablesWithoutPk(client: ClientBase): Promise<SchemaIntelFinding[]> {
  const rows = await runQuery(
    client,
    `
    SELECT
      n.nspname AS schema,
      c.relname AS table,
      pg_catalog.pg_total_relation_size(c.oid) AS total_size_bytes,
      s.n_live_tup AS estimated_rows
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_catalog.pg_stat_user_tables s
      ON s.schemaname = n.nspname AND s.relname = c.relname
    WHERE c.relkind = 'r'
      AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint con
        WHERE con.conrelid = c.oid AND con.contype = 'p'
      )
    ORDER BY pg_catalog.pg_total_relation_size(c.oid) DESC NULLS LAST
    `
  )
  return rows.map((row) => {
    const schema = String(row.schema)
    const table = String(row.table)
    return {
      checkId: 'tables_without_pk',
      severity: 'warning',
      title: `${schema}.${table} has no primary key`,
      detail:
        'Add a primary key (or at least a UNIQUE NOT NULL constraint) so rows can be uniquely identified for edits, replication, and tooling.',
      entity: { schema, name: table, kind: 'table' },
      metadata: {
        estimatedRows: Number(row.estimated_rows ?? 0),
        totalSizeBytes: Number(row.total_size_bytes ?? 0)
      },
      suggestedSql: `-- Review and pick a unique column before running:\n-- ALTER TABLE ${qualified(schema, table)} ADD COLUMN id BIGSERIAL PRIMARY KEY;`
    }
  })
}

async function checkMissingFkIndexes(client: ClientBase): Promise<SchemaIntelFinding[]> {
  // Find FK constraints whose column list is not a prefix of any index
  const rows = await runQuery(
    client,
    `
    WITH fk AS (
      SELECT
        con.oid AS conoid,
        n.nspname AS schema,
        cl.relname AS "table",
        con.conname AS constraint_name,
        con.conkey AS fk_cols,
        cl.oid AS table_oid
      FROM pg_catalog.pg_constraint con
      JOIN pg_catalog.pg_class cl ON cl.oid = con.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
      WHERE con.contype = 'f'
        AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
    ),
    idx AS (
      SELECT
        i.indrelid,
        i.indkey,
        i.indpred
      FROM pg_catalog.pg_index i
      WHERE i.indisvalid
    )
    SELECT
      fk.schema,
      fk."table",
      fk.constraint_name,
      (
        SELECT array_agg(a.attname ORDER BY ord.n)
        FROM unnest(fk.fk_cols) WITH ORDINALITY ord(col, n)
        JOIN pg_catalog.pg_attribute a
          ON a.attrelid = fk.table_oid AND a.attnum = ord.col
      ) AS fk_columns
    FROM fk
    WHERE NOT EXISTS (
      SELECT 1
      FROM idx
      WHERE idx.indrelid = fk.table_oid
        AND idx.indpred IS NULL
        AND (
          -- index leading columns equal fk columns (in fk order)
          (SELECT array_agg(idx.indkey[n-1] ORDER BY n)
           FROM generate_series(1, array_length(fk.fk_cols, 1)) n
          ) = fk.fk_cols
        )
    )
    ORDER BY fk.schema, fk."table", fk.constraint_name
    `
  )
  return rows.map((row) => {
    const schema = String(row.schema)
    const table = String(row.table)
    const cols = Array.isArray(row.fk_columns) ? (row.fk_columns as string[]) : []
    const colsList = cols.map(qid).join(', ')
    const idxName = `idx_${table}_${cols.join('_')}`.slice(0, 60)
    return {
      checkId: 'missing_fk_indexes',
      severity: 'warning',
      title: `${schema}.${table}(${cols.join(', ')}) is a FK without a supporting index`,
      detail:
        'Deletes on the parent table and joins over this foreign key scan the whole child table. Add a matching index.',
      entity: { schema, name: table, kind: 'foreign_key' },
      metadata: { constraint: row.constraint_name, columns: cols },
      suggestedSql: cols.length
        ? `CREATE INDEX ${qid(idxName)} ON ${qualified(schema, table)} (${colsList});`
        : undefined
    }
  })
}

async function checkDuplicateIndexes(client: ClientBase): Promise<SchemaIntelFinding[]> {
  const rows = await runQuery(
    client,
    `
    SELECT
      n.nspname AS schema,
      c.relname AS "table",
      (array_agg(i.relname ORDER BY i.relname))[1] AS kept_index,
      array_agg(i.relname ORDER BY i.relname) AS indexes,
      pg_get_indexdef(idx.indexrelid) AS definition,
      array_agg(DISTINCT pg_size_pretty(pg_relation_size(i.oid))) AS sizes
    FROM pg_catalog.pg_index idx
    JOIN pg_catalog.pg_class i ON i.oid = idx.indexrelid
    JOIN pg_catalog.pg_class c ON c.oid = idx.indrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      AND idx.indisvalid
    GROUP BY n.nspname, c.relname, idx.indkey, pg_get_indexdef(idx.indexrelid)
    HAVING count(*) > 1
    ORDER BY n.nspname, c.relname
    `
  )
  return rows.map((row) => {
    const schema = String(row.schema)
    const table = String(row.table)
    const indexes = (row.indexes as string[]) ?? []
    const duplicates = indexes.slice(1)
    return {
      checkId: 'duplicate_indexes',
      severity: 'warning',
      title: `${schema}.${table} has duplicate index${duplicates.length > 1 ? 'es' : ''}: ${duplicates.join(', ')}`,
      detail:
        'These indexes cover the same columns. Keeping one is usually enough; the others just slow down writes.',
      entity: { schema, name: table, kind: 'table' },
      metadata: {
        keptIndex: row.kept_index,
        duplicates,
        definition: row.definition
      },
      suggestedSql: duplicates
        .map((idxName) => `DROP INDEX ${qualified(schema, idxName)};`)
        .join('\n')
    }
  })
}

async function checkUnusedIndexes(client: ClientBase): Promise<SchemaIntelFinding[]> {
  const rows = await runQuery(
    client,
    `
    SELECT
      s.schemaname AS schema,
      s.relname AS "table",
      s.indexrelname AS index_name,
      pg_relation_size(s.indexrelid) AS size_bytes,
      pg_size_pretty(pg_relation_size(s.indexrelid)) AS size_pretty
    FROM pg_stat_user_indexes s
    JOIN pg_index i ON i.indexrelid = s.indexrelid
    WHERE s.idx_scan = 0
      AND NOT i.indisunique
      AND NOT i.indisprimary
      AND pg_relation_size(s.indexrelid) > 1024 * 1024 -- ignore tiny ones
    ORDER BY pg_relation_size(s.indexrelid) DESC
    LIMIT 50
    `
  )
  return rows.map((row) => {
    const schema = String(row.schema)
    const table = String(row.table)
    const indexName = String(row.index_name)
    return {
      checkId: 'unused_indexes',
      severity: 'info',
      title: `${schema}.${indexName} (${row.size_pretty}) has never been used`,
      detail:
        'No reads have hit this index since the stats were reset. If uptime is long this is a safe candidate to drop.',
      entity: { schema, name: indexName, kind: 'index' },
      metadata: {
        table,
        sizeBytes: Number(row.size_bytes ?? 0),
        sizePretty: row.size_pretty
      },
      suggestedSql: `DROP INDEX ${qualified(schema, indexName)};`
    }
  })
}

async function checkInvalidIndexes(client: ClientBase): Promise<SchemaIntelFinding[]> {
  const rows = await runQuery(
    client,
    `
    SELECT
      n.nspname AS schema,
      c.relname AS "table",
      i.relname AS index_name
    FROM pg_catalog.pg_index ix
    JOIN pg_catalog.pg_class i ON i.oid = ix.indexrelid
    JOIN pg_catalog.pg_class c ON c.oid = ix.indrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT ix.indisvalid
      AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
    `
  )
  return rows.map((row) => {
    const schema = String(row.schema)
    const indexName = String(row.index_name)
    const table = String(row.table)
    return {
      checkId: 'invalid_indexes',
      severity: 'critical',
      title: `${schema}.${indexName} is invalid`,
      detail:
        'Invalid indexes are ignored by the planner. Drop and recreate with CREATE INDEX CONCURRENTLY.',
      entity: { schema, name: indexName, kind: 'index' },
      metadata: { table },
      suggestedSql: `DROP INDEX ${qualified(schema, indexName)};\n-- Then rebuild with: CREATE INDEX CONCURRENTLY ...`
    }
  })
}

async function checkBloatedTables(client: ClientBase): Promise<SchemaIntelFinding[]> {
  const rows = await runQuery(
    client,
    `
    SELECT
      s.schemaname AS schema,
      s.relname AS "table",
      s.n_live_tup AS live_rows,
      s.n_dead_tup AS dead_rows,
      CASE WHEN s.n_live_tup + s.n_dead_tup = 0 THEN 0
           ELSE ROUND(s.n_dead_tup::numeric / (s.n_live_tup + s.n_dead_tup) * 100, 2)
      END AS dead_pct,
      pg_size_pretty(pg_total_relation_size(s.relid)) AS size_pretty,
      pg_total_relation_size(s.relid) AS size_bytes
    FROM pg_stat_user_tables s
    WHERE s.n_dead_tup > 1000
      AND s.n_live_tup + s.n_dead_tup > 0
      AND s.n_dead_tup::numeric / (s.n_live_tup + s.n_dead_tup) > 0.2
    ORDER BY s.n_dead_tup DESC
    LIMIT 30
    `
  )
  return rows.map((row) => {
    const schema = String(row.schema)
    const table = String(row.table)
    const deadPct = Number(row.dead_pct ?? 0)
    return {
      checkId: 'bloated_tables',
      severity: 'info',
      title: `${schema}.${table} is ${deadPct}% dead tuples`,
      detail:
        'Consider running VACUUM on this table. For heavy bloat, VACUUM (FULL) or pg_repack reclaims disk space.',
      entity: { schema, name: table, kind: 'table' },
      metadata: {
        liveRows: Number(row.live_rows ?? 0),
        deadRows: Number(row.dead_rows ?? 0),
        deadPct,
        sizePretty: row.size_pretty,
        sizeBytes: Number(row.size_bytes ?? 0)
      },
      suggestedSql: `VACUUM (ANALYZE, VERBOSE) ${qualified(schema, table)};`
    }
  })
}

async function checkNeverVacuumed(client: ClientBase): Promise<SchemaIntelFinding[]> {
  const rows = await runQuery(
    client,
    `
    SELECT
      s.schemaname AS schema,
      s.relname AS "table",
      s.n_live_tup AS live_rows,
      s.last_vacuum,
      s.last_autovacuum,
      s.last_analyze,
      s.last_autoanalyze
    FROM pg_stat_user_tables s
    WHERE s.n_live_tup > 1000
      AND s.last_vacuum IS NULL
      AND s.last_autovacuum IS NULL
      AND s.last_analyze IS NULL
      AND s.last_autoanalyze IS NULL
    ORDER BY s.n_live_tup DESC
    LIMIT 30
    `
  )
  return rows.map((row) => {
    const schema = String(row.schema)
    const table = String(row.table)
    return {
      checkId: 'never_vacuumed',
      severity: 'info',
      title: `${schema}.${table} has never been vacuumed or analyzed`,
      detail:
        'Planner statistics may be stale. Run ANALYZE so the query planner has accurate row estimates.',
      entity: { schema, name: table, kind: 'table' },
      metadata: { liveRows: Number(row.live_rows ?? 0) },
      suggestedSql: `ANALYZE ${qualified(schema, table)};`
    }
  })
}

async function checkNullableFks(client: ClientBase): Promise<SchemaIntelFinding[]> {
  const rows = await runQuery(
    client,
    `
    SELECT
      n.nspname AS schema,
      cl.relname AS "table",
      con.conname AS constraint_name,
      (
        SELECT array_agg(a.attname ORDER BY ord.n)
        FROM unnest(con.conkey) WITH ORDINALITY ord(col, n)
        JOIN pg_catalog.pg_attribute a
          ON a.attrelid = cl.oid AND a.attnum = ord.col
        WHERE NOT a.attnotnull
      ) AS nullable_columns
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class cl ON cl.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
    WHERE con.contype = 'f'
      AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
    `
  )
  return rows
    .filter((row) => {
      const cols = row.nullable_columns
      return Array.isArray(cols) && cols.length > 0
    })
    .map((row) => {
      const schema = String(row.schema)
      const table = String(row.table)
      const cols = (row.nullable_columns as string[]) ?? []
      return {
        checkId: 'nullable_fks',
        severity: 'info',
        title: `${schema}.${table}(${cols.join(', ')}) is a nullable foreign key`,
        detail:
          'If NULL is not a valid "no reference" for this column, add NOT NULL to prevent orphaned rows.',
        entity: { schema, name: table, kind: 'foreign_key' },
        metadata: { constraint: row.constraint_name, columns: cols }
      } satisfies SchemaIntelFinding
    })
}

const CHECK_RUNNERS: Record<
  SchemaIntelCheckId,
  (client: ClientBase) => Promise<SchemaIntelFinding[]>
> = {
  tables_without_pk: checkTablesWithoutPk,
  missing_fk_indexes: checkMissingFkIndexes,
  duplicate_indexes: checkDuplicateIndexes,
  unused_indexes: checkUnusedIndexes,
  invalid_indexes: checkInvalidIndexes,
  bloated_tables: checkBloatedTables,
  never_vacuumed: checkNeverVacuumed,
  nullable_fks: checkNullableFks
}

/**
 * Run the requested schema-intel checks against an already-connected client.
 * Checks never throw — failures surface as entries in `skipped`.
 */
export async function runPostgresSchemaIntel(
  client: ClientBase,
  requested?: SchemaIntelCheckId[]
): Promise<SchemaIntelReport> {
  const started = Date.now()
  const toRun = requested && requested.length > 0 ? requested : DEFAULT_PG_CHECKS
  const findings: SchemaIntelFinding[] = []
  const skipped: SchemaIntelReport['skipped'] = []

  for (const checkId of toRun) {
    const runner = CHECK_RUNNERS[checkId]
    if (!runner) {
      skipped.push({ checkId, reason: 'Unknown check id' })
      continue
    }
    try {
      const found = await runner(client)
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
