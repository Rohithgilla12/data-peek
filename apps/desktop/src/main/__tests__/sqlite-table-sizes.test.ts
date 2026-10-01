import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { ConnectionConfig } from '@shared/index'
import { SQLiteAdapter } from '../adapters/sqlite-adapter'

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

describe.skipIf(!sqliteAvailable)('SQLiteAdapter.getTableSizes', () => {
  let dir: string
  let dbPath: string
  let config: ConnectionConfig
  const adapter = new SQLiteAdapter()

  function seed(sql: string): void {
    const db = new Database(dbPath)
    db.exec(sql)
    db.close()
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sqlite-table-sizes-'))
    dbPath = join(dir, 'test.db')
    config = {
      id: 'test-connection',
      name: 'Test SQLite',
      host: '',
      port: 0,
      database: dbPath,
      dbType: 'sqlite',
      dstPort: 0
    }
    seed(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE
      );
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        status TEXT DEFAULT 'pending'
      );
      CREATE INDEX idx_orders_user ON orders(user_id);
      CREATE INDEX idx_orders_status ON orders(status);
      CREATE VIEW named_users AS SELECT * FROM users WHERE name IS NOT NULL;
      INSERT INTO users (name, email) VALUES
        ('Alice', 'alice@example.com'),
        ('Bob', 'bob@example.com'),
        ('Charlie', 'charlie@example.com');
      INSERT INTO orders (user_id) VALUES (1), (2);
    `)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports the database size as its pages times the page size', async () => {
    const db = new Database(dbPath, { readonly: true })
    const expected =
      Number(db.pragma('page_count', { simple: true })) *
      Number(db.pragma('page_size', { simple: true }))
    db.close()

    const { dbSize } = await adapter.getTableSizes(config)

    expect(dbSize.totalSizeBytes).toBe(expected)
    expect(dbSize.totalSizeBytes).toBeGreaterThan(0)
    expect(dbSize.totalSize).toMatch(/kB$/)
  })

  it('reports a size and a row count for each table', async () => {
    const { tables } = await adapter.getTableSizes(config)
    const users = tables.find((t) => t.table === 'users')!

    expect(users.schema).toBe('main')
    expect(users.rowCountEstimate).toBe(3)
    expect(users.dataSizeBytes).toBeGreaterThan(0)
    expect(users.totalSizeBytes).toBe(users.dataSizeBytes + users.indexSizeBytes)
    expect(users.totalSize).toMatch(/kB$/)
  })

  it('counts an index toward the table it belongs to', async () => {
    const { tables } = await adapter.getTableSizes(config)
    const orders = tables.find((t) => t.table === 'orders')!

    // idx_orders_user and idx_orders_status each hold at least one page.
    expect(orders.indexSizeBytes).toBeGreaterThanOrEqual(2 * 4096)
    expect(tables.map((t) => t.table)).not.toContain('idx_orders_user')
  })

  it('lists tables only, largest first', async () => {
    const { tables } = await adapter.getTableSizes(config)
    const names = tables.map((t) => t.table)

    expect(names).toContain('users')
    expect(names).toContain('orders')
    expect(names).not.toContain('named_users')
    expect(names.some((name) => name.startsWith('sqlite_'))).toBe(false)
    const sizes = tables.map((t) => t.totalSizeBytes)
    expect(sizes).toEqual([...sizes].sort((x, y) => y - x))
  })

  it('takes the row count from sqlite_stat1 when ANALYZE has run, without scanning', async () => {
    // The statistics are as of the ANALYZE, so the row added after it is not counted:
    // that is what tells an estimate read from sqlite_stat1 from a COUNT(*).
    seed(`ANALYZE; INSERT INTO users (name, email) VALUES ('Dana', 'dana@example.com');`)

    const { tables } = await adapter.getTableSizes(config)

    expect(tables.find((t) => t.table === 'users')!.rowCountEstimate).toBe(3)
  })

  it('lists no more than 50 tables', async () => {
    seed(Array.from({ length: 60 }, (_, i) => `CREATE TABLE extra_${i} (id INTEGER);`).join('\n'))

    const { tables } = await adapter.getTableSizes(config)

    expect(tables).toHaveLength(50)
  })

  it('reports a full-text table as one table, with its shadow tables counted in', async () => {
    seed(`
      CREATE VIRTUAL TABLE docs USING fts5(body);
      INSERT INTO docs (body) VALUES ('first document'), ('second document');
    `)

    const { tables } = await adapter.getTableSizes(config)
    const names = tables.map((t) => t.table)
    const docs = tables.find((t) => t.table === 'docs')!

    expect(docs.rowCountEstimate).toBe(2)
    expect(docs.totalSizeBytes).toBeGreaterThan(0)
    expect(names.filter((name) => name.startsWith('docs_'))).toEqual([])
  })

  it('reports a contentless full-text table by its own name', async () => {
    seed(`
      CREATE VIRTUAL TABLE tags USING fts5(label, content='');
      INSERT INTO tags (rowid, label) VALUES (1, 'red'), (2, 'green'), (3, 'blue');
    `)

    const { tables } = await adapter.getTableSizes(config)
    const names = tables.map((t) => t.table)

    expect(tables.find((t) => t.table === 'tags')!.rowCountEstimate).toBe(3)
    expect(names.filter((name) => name.startsWith('tags_'))).toEqual([])
  })

  it('keeps an external-content table separate from the full-text table that indexes it', async () => {
    seed(`
      CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT);
      INSERT INTO notes (body) VALUES ('alpha'), ('beta');
      CREATE VIRTUAL TABLE notes_fts USING fts5(body, content='notes', content_rowid='id');
      INSERT INTO notes_fts (rowid, body) SELECT id, body FROM notes;
    `)

    const { tables } = await adapter.getTableSizes(config)
    const names = tables.map((t) => t.table)
    const notes = tables.find((t) => t.table === 'notes')!

    expect(notes.rowCountEstimate).toBe(2)
    expect(notes.dataSizeBytes).toBe(4096)
    expect(names).toContain('notes_fts')
    expect(names.filter((name) => name.startsWith('notes_fts_'))).toEqual([])
  })
})
