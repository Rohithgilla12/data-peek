import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { ConnectionConfig, SchemaIntelCheckId, SchemaIntelFinding } from '@shared/index'
import { SCHEMA_INTEL_CHECKS } from '@shared/index'
import { SQLiteAdapter } from '../adapters/sqlite-adapter'
import { runSqliteSchemaIntel } from '../schema-intel/sqlite'

// better-sqlite3 is compiled for Electron's ABI; under plain node the whole
// suite skips. Run for real via `pnpm test:electron`.
const sqliteAvailable = (() => {
  try {
    new Database(':memory:').close()
    return true
  } catch {
    return false
  }
})()

const SCHEMA = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE
  );
  CREATE INDEX idx_users_email ON users(email);

  CREATE TABLE no_pk (a TEXT, b TEXT);

  CREATE TABLE codes (
    code TEXT,
    region TEXT,
    PRIMARY KEY (code, region)
  ) WITHOUT ROWID;

  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    referrer_id INTEGER REFERENCES users(id),
    code TEXT NOT NULL,
    region TEXT NOT NULL,
    note TEXT,
    FOREIGN KEY (code, region) REFERENCES codes(code, region)
  );
  CREATE INDEX idx_orders_referrer ON orders(referrer_id);
  CREATE INDEX idx_orders_referrer_dup ON orders(referrer_id);
  CREATE INDEX idx_orders_region_code ON orders(region, code, id);
  CREATE INDEX idx_orders_user_partial ON orders(user_id) WHERE user_id > 10;
  CREATE INDEX idx_orders_note ON orders(note);
  CREATE INDEX idx_orders_note_desc ON orders(note DESC);

  CREATE TABLE profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    bio TEXT
  );

  CREATE VIEW user_emails AS SELECT email FROM users;
  CREATE VIRTUAL TABLE docs USING fts5(body);
`

function byCheck(findings: SchemaIntelFinding[], checkId: SchemaIntelCheckId) {
  return findings.filter((f) => f.checkId === checkId)
}

describe.skipIf(!sqliteAvailable)('runSqliteSchemaIntel', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(SCHEMA)
  })

  afterEach(() => {
    db.close()
  })

  it('reports only the table with no primary key', () => {
    const report = runSqliteSchemaIntel(db, ['tables_without_pk'])

    expect(report.skipped).toEqual([])
    expect(report.findings.map((f) => f.entity)).toEqual([
      { schema: 'main', name: 'no_pk', kind: 'table' }
    ])
    expect(report.findings[0].title).toBe('main.no_pk has no primary key')
  })

  it('reports a foreign key with no index that leads with its columns', () => {
    const findings = byCheck(
      runSqliteSchemaIntel(db, ['missing_fk_indexes']).findings,
      'missing_fk_indexes'
    )

    // referrer_id has a full index, (code, region) leads idx_orders_region_code,
    // and profiles.user_id is the rowid. Only user_id is left: its one index is partial.
    expect(findings).toHaveLength(1)
    expect(findings[0].entity).toEqual({ schema: 'main', name: 'orders', kind: 'foreign_key' })
    expect(findings[0].metadata).toMatchObject({ columns: ['user_id'], referencedTable: 'users' })
    expect(findings[0].suggestedSql).toBe(
      'CREATE INDEX "idx_orders_user_id" ON "orders" ("user_id");'
    )
  })

  it('reports a foreign key column that allows NULL', () => {
    const findings = byCheck(runSqliteSchemaIntel(db, ['nullable_fks']).findings, 'nullable_fks')

    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('info')
    expect(findings[0].entity).toEqual({ schema: 'main', name: 'orders', kind: 'foreign_key' })
    expect(findings[0].metadata).toMatchObject({ columns: ['referrer_id'] })
  })

  it('reports indexes with the same columns and keeps the constraint-backed one', () => {
    const findings = byCheck(
      runSqliteSchemaIntel(db, ['duplicate_indexes']).findings,
      'duplicate_indexes'
    )

    expect(findings.map((f) => [f.entity?.name, f.metadata])).toEqual([
      [
        'orders',
        {
          keptIndex: 'idx_orders_referrer',
          duplicates: ['idx_orders_referrer_dup'],
          columns: ['referrer_id']
        }
      ],
      [
        'users',
        {
          keptIndex: 'sqlite_autoindex_users_1',
          duplicates: ['idx_users_email'],
          columns: ['email']
        }
      ]
    ])
    expect(findings[0].suggestedSql).toBe('DROP INDEX "idx_orders_referrer_dup";')
  })

  it('runs the four structural checks when none are requested', () => {
    const report = runSqliteSchemaIntel(db)

    expect(new Set(report.findings.map((f) => f.checkId))).toEqual(
      new Set(['tables_without_pk', 'missing_fk_indexes', 'duplicate_indexes', 'nullable_fks'])
    )
    expect(report.skipped).toEqual([])
  })

  it('skips the statistics-based checks with a reason', () => {
    const statsChecks: SchemaIntelCheckId[] = [
      'unused_indexes',
      'invalid_indexes',
      'bloated_tables',
      'never_vacuumed'
    ]
    const report = runSqliteSchemaIntel(db, statsChecks)

    expect(report.findings).toEqual([])
    expect(report.skipped.map((s) => s.checkId)).toEqual(statsChecks)
    for (const skipped of report.skipped) {
      expect(skipped.reason).toMatch(/SQLite/)
    }
  })

  it('finds nothing in an empty database', () => {
    const empty = new Database(':memory:')
    try {
      expect(runSqliteSchemaIntel(empty)).toMatchObject({ findings: [], skipped: [] })
    } finally {
      empty.close()
    }
  })

  it('quotes identifiers in the suggested SQL', () => {
    const odd = new Database(':memory:')
    try {
      odd.exec(`
        CREATE TABLE "par""ent" (id INTEGER PRIMARY KEY);
        CREATE TABLE "chi ld" (
          id INTEGER PRIMARY KEY,
          "par ent" INTEGER NOT NULL REFERENCES "par""ent"(id)
        );
      `)
      const [finding] = runSqliteSchemaIntel(odd, ['missing_fk_indexes']).findings

      expect(finding.suggestedSql).toBe(
        'CREATE INDEX "idx_chi ld_par ent" ON "chi ld" ("par ent");'
      )
      odd.exec(finding.suggestedSql as string)
      expect(runSqliteSchemaIntel(odd, ['missing_fk_indexes']).findings).toEqual([])
    } finally {
      odd.close()
    }
  })
})

describe.skipIf(!sqliteAvailable)('SQLiteAdapter.runSchemaIntel', () => {
  let dir: string
  let config: ConnectionConfig

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sqlite-schema-intel-'))
    const dbPath = join(dir, 'test.db')
    const db = new Database(dbPath)
    db.exec(SCHEMA)
    db.close()
    config = {
      id: 'test-connection',
      name: 'Test SQLite',
      host: '',
      port: 0,
      database: dbPath,
      dbType: 'sqlite',
      dstPort: 0
    }
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('runs the checks against the database file', async () => {
    const report = await new SQLiteAdapter().runSchemaIntel(config, ['tables_without_pk'])

    expect(report.findings.map((f) => f.entity?.name)).toEqual(['no_pk'])
    expect(report.skipped).toEqual([])
  })
})

describe('SCHEMA_INTEL_CHECKS', () => {
  it('lists SQLite for the structural checks only', () => {
    const forSqlite = SCHEMA_INTEL_CHECKS.filter((c) => c.supportedDbTypes.includes('sqlite'))

    expect(forSqlite.map((c) => c.id).sort()).toEqual([
      'duplicate_indexes',
      'missing_fk_indexes',
      'nullable_fks',
      'tables_without_pk'
    ])
  })
})
