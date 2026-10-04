import type Database from 'better-sqlite3'
import type { SchemaIntelCheckId, SchemaIntelFinding, SchemaIntelReport } from '@shared/index'

const DEFAULT_SQLITE_CHECKS: SchemaIntelCheckId[] = [
  'tables_without_pk',
  'missing_fk_indexes',
  'duplicate_indexes',
  'nullable_fks'
]

// These read usage and maintenance statistics that SQLite does not keep.
const NOT_APPLICABLE: Partial<Record<SchemaIntelCheckId, string>> = {
  unused_indexes: 'SQLite does not record how often an index is used',
  invalid_indexes: 'SQLite has no invalid index state: an index is either built or absent',
  bloated_tables: 'SQLite does not track dead rows per table',
  never_vacuumed: 'SQLite keeps no per-table vacuum history'
}

// SQLite has no schemas; the adapter reports everything under "main".
const SCHEMA = 'main'

interface TableListRow {
  schema: string
  name: string
  type: string
}

interface TableInfoRow {
  name: string
  notnull: number
  pk: number
}

interface ForeignKeyRow {
  id: number
  seq: number
  table: string
  from: string
}

interface IndexListRow {
  name: string
  origin: string
  partial: number
}

interface IndexXInfoRow {
  seqno: number
  name: string | null
  desc: number
  coll: string | null
  key: number
}

interface ForeignKey {
  referencedTable: string
  columns: string[]
}

interface IndexKey {
  name: string
  origin: string
  columns: string[]
  /** Columns with their sort order and collation, to tell real duplicates apart. */
  signature: string
}

function qid(identifier: string): string {
  return '"' + identifier.replace(/"/g, '""') + '"'
}

function pragma<T>(db: Database.Database, name: string, argument?: string): T[] {
  const sql = argument === undefined ? `PRAGMA ${name}` : `PRAGMA ${name}(${qid(argument)})`
  return db.prepare(sql).all() as T[]
}

/** Ordinary user tables: no views, virtual tables, their shadow tables or sqlite_ internals. */
function listTables(db: Database.Database): string[] {
  return pragma<TableListRow>(db, 'table_list')
    .filter((t) => t.schema === SCHEMA && t.type === 'table' && !t.name.startsWith('sqlite_'))
    .map((t) => t.name)
    .sort()
}

function primaryKeyColumns(columns: TableInfoRow[]): string[] {
  return columns
    .filter((c) => c.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((c) => c.name)
}

function listForeignKeys(db: Database.Database, table: string): ForeignKey[] {
  const byId = new Map<number, ForeignKeyRow[]>()
  for (const row of pragma<ForeignKeyRow>(db, 'foreign_key_list', table)) {
    byId.set(row.id, [...(byId.get(row.id) ?? []), row])
  }
  return [...byId.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, rows]) => ({
      referencedTable: rows[0].table,
      columns: rows.sort((a, b) => a.seq - b.seq).map((r) => r.from)
    }))
}

/**
 * Indexes that cover every row with plain columns. Partial indexes and indexes
 * on expressions are left out: neither can stand in for a full column index.
 */
function listFullColumnIndexes(db: Database.Database, table: string): IndexKey[] {
  const indexes: IndexKey[] = []
  for (const index of pragma<IndexListRow>(db, 'index_list', table)) {
    if (index.partial) continue
    const keys = pragma<IndexXInfoRow>(db, 'index_xinfo', index.name)
      .filter((k) => k.key === 1)
      .sort((a, b) => a.seqno - b.seqno)
    if (keys.some((k) => k.name === null)) continue
    indexes.push({
      name: index.name,
      origin: index.origin,
      columns: keys.map((k) => k.name as string),
      signature: keys.map((k) => `${k.name}\u0000${k.desc}\u0000${k.coll ?? ''}`).join('\u0001')
    })
  }
  return indexes
}

function leadsWith(indexColumns: string[], columns: string[]): boolean {
  if (indexColumns.length < columns.length) return false
  const leading = new Set(indexColumns.slice(0, columns.length))
  return columns.every((c) => leading.has(c))
}

function checkTablesWithoutPk(db: Database.Database): SchemaIntelFinding[] {
  const findings: SchemaIntelFinding[] = []
  for (const table of listTables(db)) {
    const columns = pragma<TableInfoRow>(db, 'table_info', table)
    if (primaryKeyColumns(columns).length > 0) continue
    findings.push({
      checkId: 'tables_without_pk',
      severity: 'warning',
      title: `${SCHEMA}.${table} has no primary key`,
      detail:
        'Rows are only identified by the hidden rowid, which VACUUM can renumber and a foreign key cannot reference. SQLite cannot add a primary key to an existing table: recreate the table with one and copy the rows across.',
      entity: { schema: SCHEMA, name: table, kind: 'table' }
    })
  }
  return findings
}

function checkMissingFkIndexes(db: Database.Database): SchemaIntelFinding[] {
  const findings: SchemaIntelFinding[] = []
  for (const table of listTables(db)) {
    const foreignKeys = listForeignKeys(db, table)
    if (foreignKeys.length === 0) continue
    // The primary key is searchable too, including an INTEGER PRIMARY KEY,
    // which is the rowid and so has no entry in index_list.
    const searchable = [
      primaryKeyColumns(pragma<TableInfoRow>(db, 'table_info', table)),
      ...listFullColumnIndexes(db, table).map((i) => i.columns)
    ]
    for (const fk of foreignKeys) {
      if (searchable.some((columns) => leadsWith(columns, fk.columns))) continue
      const indexName = `idx_${table}_${fk.columns.join('_')}`
      findings.push({
        checkId: 'missing_fk_indexes',
        severity: 'warning',
        title: `${SCHEMA}.${table}(${fk.columns.join(', ')}) is a FK without a supporting index`,
        detail:
          'Deletes and updates on the parent table, and joins across this foreign key, scan the whole child table. Add an index that starts with these columns.',
        entity: { schema: SCHEMA, name: table, kind: 'foreign_key' },
        metadata: { columns: fk.columns, referencedTable: fk.referencedTable },
        suggestedSql: `CREATE INDEX ${qid(indexName)} ON ${qid(table)} (${fk.columns.map(qid).join(', ')});`
      })
    }
  }
  return findings
}

function checkNullableFks(db: Database.Database): SchemaIntelFinding[] {
  const findings: SchemaIntelFinding[] = []
  for (const table of listTables(db)) {
    const foreignKeys = listForeignKeys(db, table)
    if (foreignKeys.length === 0) continue
    // A primary key column is left out: table_info reports notnull = 0 for an
    // INTEGER PRIMARY KEY although it can never hold NULL.
    const nullable = new Set(
      pragma<TableInfoRow>(db, 'table_info', table)
        .filter((c) => c.notnull === 0 && c.pk === 0)
        .map((c) => c.name)
    )
    for (const fk of foreignKeys) {
      const columns = fk.columns.filter((c) => nullable.has(c))
      if (columns.length === 0) continue
      findings.push({
        checkId: 'nullable_fks',
        severity: 'info',
        title: `${SCHEMA}.${table}(${columns.join(', ')}) is a nullable foreign key`,
        detail:
          'If NULL is not a valid "no parent" for this column, declare it NOT NULL to avoid silently orphaned rows.',
        entity: { schema: SCHEMA, name: table, kind: 'foreign_key' },
        metadata: { columns, referencedTable: fk.referencedTable }
      })
    }
  }
  return findings
}

function checkDuplicateIndexes(db: Database.Database): SchemaIntelFinding[] {
  const findings: SchemaIntelFinding[] = []
  for (const table of listTables(db)) {
    const bySignature = new Map<string, IndexKey[]>()
    for (const index of listFullColumnIndexes(db, table)) {
      bySignature.set(index.signature, [...(bySignature.get(index.signature) ?? []), index])
    }
    for (const group of bySignature.values()) {
      if (group.length < 2) continue
      // An index that backs a PRIMARY KEY or UNIQUE constraint cannot be
      // dropped, so it is the one to keep.
      const ordered = [...group].sort(
        (a, b) =>
          Number(a.origin === 'c') - Number(b.origin === 'c') || a.name.localeCompare(b.name)
      )
      const [kept, ...rest] = ordered
      const duplicates = rest.filter((i) => i.origin === 'c').map((i) => i.name)
      if (duplicates.length === 0) continue
      findings.push({
        checkId: 'duplicate_indexes',
        severity: 'warning',
        title: `${SCHEMA}.${table} has duplicate index${duplicates.length > 1 ? 'es' : ''}: ${duplicates.join(', ')}`,
        detail:
          'Keeping one index is usually enough. Duplicates inflate the database file and slow writes.',
        entity: { schema: SCHEMA, name: table, kind: 'table' },
        metadata: { keptIndex: kept.name, duplicates, columns: kept.columns },
        suggestedSql: duplicates.map((name) => `DROP INDEX ${qid(name)};`).join('\n')
      })
    }
  }
  return findings
}

const CHECK_RUNNERS: Partial<
  Record<SchemaIntelCheckId, (db: Database.Database) => SchemaIntelFinding[]>
> = {
  tables_without_pk: checkTablesWithoutPk,
  missing_fk_indexes: checkMissingFkIndexes,
  duplicate_indexes: checkDuplicateIndexes,
  nullable_fks: checkNullableFks
}

/**
 * Run the requested schema-intel checks on an open SQLite database. The
 * structural checks are read from PRAGMAs.
 */
export function runSqliteSchemaIntel(
  db: Database.Database,
  requested?: SchemaIntelCheckId[]
): SchemaIntelReport {
  const started = Date.now()
  const toRun = requested && requested.length > 0 ? requested : DEFAULT_SQLITE_CHECKS
  const findings: SchemaIntelFinding[] = []
  const skipped: SchemaIntelReport['skipped'] = []

  for (const checkId of toRun) {
    const runner = CHECK_RUNNERS[checkId]
    if (!runner) {
      skipped.push({ checkId, reason: NOT_APPLICABLE[checkId] ?? 'Check not supported on SQLite' })
      continue
    }
    try {
      findings.push(...runner(db))
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
