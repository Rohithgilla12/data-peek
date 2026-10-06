import type mysql from 'mysql2/promise'
import type { SchemaIntelCheckId, SchemaIntelFinding, SchemaIntelReport } from '@shared/index'
import { commentedSql, parseAggList } from '@shared/schema-intel/sql-safety'

// Every GROUP_CONCAT below passes `SEPARATOR CHAR(31)` so its payload can be
// split back apart unambiguously: a MySQL identifier may contain a comma
// (`` `region,code` ``), so the default separator cannot reconstruct the list.
// CHAR(31) is what `AGG_SEPARATOR` in `@shared/schema-intel/sql-safety` holds.

const DEFAULT_MYSQL_CHECKS: SchemaIntelCheckId[] = [
  'tables_without_pk',
  'missing_fk_indexes',
  'duplicate_indexes',
  'unused_indexes',
  'nullable_fks'
]

type Row = Record<string, unknown>

function qid(identifier: string): string {
  return '`' + identifier.replace(/`/g, '``') + '`'
}

function qualified(schema: string, name: string): string {
  return `${qid(schema)}.${qid(name)}`
}

async function runQuery(
  conn: mysql.Connection,
  sql: string,
  params: unknown[] = []
): Promise<Row[]> {
  const [result] = await conn.query(sql, params)
  return result as Row[]
}

async function checkTablesWithoutPk(
  conn: mysql.Connection,
  schema: string
): Promise<SchemaIntelFinding[]> {
  const rows = await runQuery(
    conn,
    `
    SELECT
      t.TABLE_SCHEMA AS schema_name,
      t.TABLE_NAME   AS table_name,
      t.TABLE_ROWS   AS estimated_rows,
      (t.DATA_LENGTH + t.INDEX_LENGTH) AS total_size_bytes
    FROM information_schema.TABLES t
    WHERE t.TABLE_SCHEMA = ?
      AND t.TABLE_TYPE = 'BASE TABLE'
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.TABLE_CONSTRAINTS c
        WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA
          AND c.TABLE_NAME = t.TABLE_NAME
          AND c.CONSTRAINT_TYPE = 'PRIMARY KEY'
      )
    ORDER BY (t.DATA_LENGTH + t.INDEX_LENGTH) DESC
    `,
    [schema]
  )
  return rows.map((row) => {
    const s = String(row.schema_name)
    const t = String(row.table_name)
    return {
      checkId: 'tables_without_pk',
      severity: 'warning',
      title: `${s}.${t} has no primary key`,
      detail:
        'InnoDB uses a hidden 6-byte rowid when no primary key is declared — deletes, replication and clustering all suffer. Pick a unique column and declare it PRIMARY KEY.',
      entity: { schema: s, name: t, kind: 'table' },
      metadata: {
        estimatedRows: Number(row.estimated_rows ?? 0),
        totalSizeBytes: Number(row.total_size_bytes ?? 0)
      },
      suggestedSql: commentedSql([
        'Review and pick a unique column before running:',
        `ALTER TABLE ${qualified(s, t)} ADD COLUMN id BIGINT AUTO_INCREMENT PRIMARY KEY;`
      ])
    } satisfies SchemaIntelFinding
  })
}

async function checkMissingFkIndexes(
  conn: mysql.Connection,
  schema: string
): Promise<SchemaIntelFinding[]> {
  // For each single-column FK, verify there is an index starting with that
  // column. Composite FKs are skipped (rare in practice on MySQL since they
  // usually get a supporting composite index automatically).
  const rows = await runQuery(
    conn,
    `
    SELECT
      kcu.TABLE_SCHEMA    AS schema_name,
      kcu.TABLE_NAME      AS table_name,
      kcu.CONSTRAINT_NAME AS constraint_name,
      kcu.COLUMN_NAME     AS column_name
    FROM information_schema.KEY_COLUMN_USAGE kcu
    WHERE kcu.TABLE_SCHEMA = ?
      AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.STATISTICS s
        WHERE s.TABLE_SCHEMA = kcu.TABLE_SCHEMA
          AND s.TABLE_NAME   = kcu.TABLE_NAME
          AND s.SEQ_IN_INDEX = 1
          AND s.COLUMN_NAME  = kcu.COLUMN_NAME
      )
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.KEY_COLUMN_USAGE kcu2
        WHERE kcu2.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
          AND kcu2.TABLE_SCHEMA    = kcu.TABLE_SCHEMA
          AND kcu2.TABLE_NAME      = kcu.TABLE_NAME
          AND kcu2.ORDINAL_POSITION > 1
      )
    `,
    [schema]
  )
  return rows.map((row) => {
    const s = String(row.schema_name)
    const t = String(row.table_name)
    const column = String(row.column_name)
    const idxName = `idx_${t}_${column}`.slice(0, 60)
    return {
      checkId: 'missing_fk_indexes',
      severity: 'warning',
      title: `${s}.${t}(${column}) is a FK without a supporting index`,
      detail:
        'Deletes and joins across this foreign key will scan the whole child table. Add a matching index.',
      entity: { schema: s, name: t, kind: 'foreign_key' },
      metadata: { constraint: row.constraint_name, columns: [column] },
      suggestedSql: `CREATE INDEX ${qid(idxName)} ON ${qualified(s, t)} (${qid(column)});`
    } satisfies SchemaIntelFinding
  })
}

async function checkDuplicateIndexes(
  conn: mysql.Connection,
  schema: string
): Promise<SchemaIntelFinding[]> {
  const rows = await runQuery(
    conn,
    `
    SELECT
      TABLE_SCHEMA AS schema_name,
      TABLE_NAME   AS table_name,
      cols,
      GROUP_CONCAT(INDEX_NAME ORDER BY INDEX_NAME SEPARATOR CHAR(31)) AS index_names,
      COUNT(*) AS dup_count
    FROM (
      SELECT
        TABLE_SCHEMA, TABLE_NAME, INDEX_NAME,
        GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR CHAR(31)) AS cols
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ?
      GROUP BY TABLE_SCHEMA, TABLE_NAME, INDEX_NAME
    ) x
    GROUP BY TABLE_SCHEMA, TABLE_NAME, cols
    HAVING dup_count > 1
    `,
    [schema]
  )
  return rows.map((row) => {
    const s = String(row.schema_name)
    const t = String(row.table_name)
    const names = parseAggList(row.index_names)
    const [kept, ...duplicates] = names
    return {
      checkId: 'duplicate_indexes',
      severity: 'warning',
      title: `${s}.${t} has duplicate index${duplicates.length > 1 ? 'es' : ''}: ${duplicates.join(', ')}`,
      detail: 'Keeping one index is usually enough. Duplicates inflate disk usage and slow writes.',
      entity: { schema: s, name: t, kind: 'table' },
      metadata: { keptIndex: kept, duplicates, columns: row.cols },
      suggestedSql: duplicates
        .map((idxName) => `ALTER TABLE ${qualified(s, t)} DROP INDEX ${qid(idxName)};`)
        .join('\n')
    } satisfies SchemaIntelFinding
  })
}

async function checkNullableFks(
  conn: mysql.Connection,
  schema: string
): Promise<SchemaIntelFinding[]> {
  const rows = await runQuery(
    conn,
    `
    SELECT
      kcu.TABLE_SCHEMA AS schema_name,
      kcu.TABLE_NAME   AS table_name,
      kcu.CONSTRAINT_NAME AS constraint_name,
      GROUP_CONCAT(kcu.COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION SEPARATOR CHAR(31)) AS columns
    FROM information_schema.KEY_COLUMN_USAGE kcu
    JOIN information_schema.COLUMNS c
      ON c.TABLE_SCHEMA = kcu.TABLE_SCHEMA
     AND c.TABLE_NAME   = kcu.TABLE_NAME
     AND c.COLUMN_NAME  = kcu.COLUMN_NAME
    WHERE kcu.TABLE_SCHEMA = ?
      AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      AND c.IS_NULLABLE = 'YES'
    GROUP BY kcu.TABLE_SCHEMA, kcu.TABLE_NAME, kcu.CONSTRAINT_NAME
    `,
    [schema]
  )
  return rows.map((row) => {
    const s = String(row.schema_name)
    const t = String(row.table_name)
    const cols = parseAggList(row.columns)
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

function names(list: unknown): string[] {
  return parseAggList(list)
}

/** Whether `columns` are the first columns of `index`, in order. */
function leads(index: string[], columns: string[]): boolean {
  return columns.every((column, i) => index[i] === column)
}

// Non-unique indexes with no counted read, from either source. `fk_columns` is
// what a foreign key can match: an expression part has no column name and a
// prefix part cannot serve a key, so '' keeps each one's place. Full-text
// indexes are left out because reads through them are never counted. So is a
// table that setup_objects keeps from being counted (the most specific of
// schema.table, schema.% and %.% decides), since its earlier counts stay on
// record while new reads are not added. And so is a table with nothing
// counted at all, whose counts have restarted and say nothing yet.
function unusedIndexesSql(source: string, schema: string, table: string, index: string): string {
  return `
    SELECT
      u.${schema} AS schema_name,
      u.${table}  AS table_name,
      u.${index}  AS index_name,
      GROUP_CONCAT(IFNULL(s.COLUMN_NAME, '') ORDER BY s.SEQ_IN_INDEX SEPARATOR CHAR(31)) AS columns,
      GROUP_CONCAT(
        IF(s.SUB_PART IS NULL, IFNULL(s.COLUMN_NAME, ''), '') ORDER BY s.SEQ_IN_INDEX SEPARATOR CHAR(31)
      ) AS fk_columns
    FROM ${source} u
    JOIN information_schema.STATISTICS s
      ON s.TABLE_SCHEMA = u.${schema}
     AND s.TABLE_NAME   = u.${table}
     AND s.INDEX_NAME   = u.${index}
    WHERE u.${schema} = ?
      ${source.startsWith('sys.') ? '' : 'AND u.COUNT_STAR = 0'}
      AND 'YES' = (
        SELECT o.ENABLED
        FROM performance_schema.setup_objects o
        WHERE o.OBJECT_TYPE = 'TABLE'
          AND (
            (o.OBJECT_SCHEMA = u.${schema} AND o.OBJECT_NAME IN (u.${table}, '%'))
            OR (o.OBJECT_SCHEMA = '%' AND o.OBJECT_NAME = '%')
          )
        ORDER BY o.OBJECT_SCHEMA = u.${schema} DESC, o.OBJECT_NAME = u.${table} DESC
        LIMIT 1
      )
      AND EXISTS (
        SELECT 1
        FROM performance_schema.table_io_waits_summary_by_index_usage counted
        WHERE counted.OBJECT_SCHEMA = u.${schema}
          AND counted.OBJECT_NAME   = u.${table}
          AND counted.COUNT_STAR > 0
      )
    GROUP BY u.${schema}, u.${table}, u.${index}
    HAVING MAX(s.NON_UNIQUE) = 1 -- neither PRIMARY nor a unique index
       AND MAX(s.INDEX_TYPE = 'FULLTEXT') = 0
    ORDER BY u.${table}, u.${index}
    `
}

async function checkUnusedIndexes(
  conn: mysql.Connection,
  schema: string
): Promise<SchemaIntelFinding[]> {
  // With performance_schema off, both sources below answer with no rows and
  // no error, which would read as "all used". With table reads not
  // instrumented, or the global consumer off, every count stays at 0 and an
  // index in use reads as unused.
  const [state] = await runQuery(
    conn,
    `
    SELECT
      @@performance_schema AS enabled,
      (SELECT ENABLED FROM performance_schema.setup_instruments
        WHERE NAME = 'wait/io/table/sql/handler') AS instrumented,
      (SELECT ENABLED FROM performance_schema.setup_consumers
        WHERE NAME = 'global_instrumentation') AS collecting
    `
  )
  if (Number(state?.enabled) !== 1) {
    throw new Error('performance_schema is off, so MySQL keeps no count of index reads')
  }
  if (String(state?.instrumented) !== 'YES') {
    throw new Error(
      'The wait/io/table/sql/handler instrument is disabled, so MySQL is not counting index reads'
    )
  }
  if (String(state?.collecting) !== 'YES') {
    throw new Error(
      'The global_instrumentation consumer is disabled, so MySQL is not counting index reads'
    )
  }

  let rows: Row[]
  try {
    rows = await runQuery(
      conn,
      unusedIndexesSql('sys.schema_unused_indexes', 'object_schema', 'object_name', 'index_name'),
      [schema]
    )
  } catch {
    // No sys schema (older MariaDB), or no right to read it. The view is built
    // on this table, so read it directly.
    rows = await runQuery(
      conn,
      unusedIndexesSql(
        'performance_schema.table_io_waits_summary_by_index_usage',
        'OBJECT_SCHEMA',
        'OBJECT_NAME',
        'INDEX_NAME'
      ),
      [schema]
    )
  }

  // An index a foreign key needs, on either end, is left out: MySQL refuses to
  // drop it (error 1553), and InnoDB's own lookups through it are not counted,
  // so "never read" says nothing about it. On the table a key is declared on,
  // that is an index led by the key's columns. On the table it points at,
  // InnoDB also counts the clustered key it appends to every secondary index,
  // so an index that only starts the referenced columns may be the one in use;
  // those are left out too, without working out which key is the clustered one.
  const foreignKeys = await runQuery(
    conn,
    `
    SELECT
      kcu.TABLE_SCHEMA            AS schema_name,
      kcu.TABLE_NAME              AS table_name,
      GROUP_CONCAT(kcu.COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION SEPARATOR CHAR(31)) AS columns,
      kcu.REFERENCED_TABLE_SCHEMA AS referenced_schema_name,
      kcu.REFERENCED_TABLE_NAME   AS referenced_table_name,
      GROUP_CONCAT(kcu.REFERENCED_COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION SEPARATOR CHAR(31)) AS referenced_columns
    FROM information_schema.KEY_COLUMN_USAGE kcu
    WHERE kcu.REFERENCED_TABLE_NAME IS NOT NULL
      AND (kcu.TABLE_SCHEMA = ? OR kcu.REFERENCED_TABLE_SCHEMA = ?)
    GROUP BY
      kcu.CONSTRAINT_SCHEMA, kcu.CONSTRAINT_NAME, kcu.TABLE_SCHEMA, kcu.TABLE_NAME,
      kcu.REFERENCED_TABLE_SCHEMA, kcu.REFERENCED_TABLE_NAME
    `,
    [schema, schema]
  )
  const needed = foreignKeys.flatMap((fk) => [
    {
      schema: String(fk.schema_name),
      table: String(fk.table_name),
      columns: names(fk.columns),
      referenced: false
    },
    {
      schema: String(fk.referenced_schema_name),
      table: String(fk.referenced_table_name),
      columns: names(fk.referenced_columns),
      referenced: true
    }
  ])

  const findings: SchemaIntelFinding[] = []
  for (const row of rows) {
    const s = String(row.schema_name)
    const t = String(row.table_name)
    const indexName = String(row.index_name)
    const keyParts = parseAggList(row.fk_columns, true)
    const serves = (n: (typeof needed)[number]): boolean =>
      leads(keyParts, n.columns) || (n.referenced && leads(n.columns, keyParts))
    if (needed.some((n) => n.schema === s && n.table === t && serves(n))) continue
    findings.push({
      checkId: 'unused_indexes',
      severity: 'info',
      title: `${s}.${t}.${indexName} has no recorded reads`,
      detail:
        'performance_schema has counted no reads through this index since its counts last restarted: when MySQL started, when the table was last altered, or when the summary table was truncated. If that covers a normal workload, it is a candidate to drop. Altering the table, which dropping one of its indexes does, restarts the count for the others. Unique and full-text indexes, indexes a foreign key needs, and tables whose reads are not being counted are not listed.',
      entity: { schema: s, name: indexName, kind: 'index' },
      metadata: { table: t, columns: names(row.columns) },
      suggestedSql: `ALTER TABLE ${qualified(s, t)} DROP INDEX ${qid(indexName)};`
    })
  }
  return findings
}

const CHECK_RUNNERS: Partial<
  Record<
    SchemaIntelCheckId,
    (conn: mysql.Connection, schema: string) => Promise<SchemaIntelFinding[]>
  >
> = {
  tables_without_pk: checkTablesWithoutPk,
  missing_fk_indexes: checkMissingFkIndexes,
  duplicate_indexes: checkDuplicateIndexes,
  unused_indexes: checkUnusedIndexes,
  nullable_fks: checkNullableFks
}

/**
 * Run the requested schema-intel checks using a live MySQL connection. All
 * queries are scoped to the current database (passed in the ConnectionConfig).
 */
export async function runMysqlSchemaIntel(
  conn: mysql.Connection,
  database: string,
  requested?: SchemaIntelCheckId[]
): Promise<SchemaIntelReport> {
  const started = Date.now()
  const toRun = requested && requested.length > 0 ? requested : DEFAULT_MYSQL_CHECKS
  const findings: SchemaIntelFinding[] = []
  const skipped: SchemaIntelReport['skipped'] = []

  for (const checkId of toRun) {
    const runner = CHECK_RUNNERS[checkId]
    if (!runner) {
      skipped.push({ checkId, reason: 'Check not supported on MySQL' })
      continue
    }
    try {
      const found = await runner(conn, database)
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
