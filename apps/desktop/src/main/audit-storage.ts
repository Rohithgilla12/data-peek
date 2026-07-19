import Database from 'better-sqlite3'
import { createHash } from 'crypto'
import { writeFileSync } from 'fs'
import type { AuditEntry, AuditEntryInput, AuditFilters, AuditVerifyResult } from '@shared/index'
import { createLogger } from './lib/logger'

const log = createLogger('audit-storage')

const ZERO_HASH = '0'.repeat(64)

function entryHash(prevHash: string, e: AuditEntryInput & { ts: string }): string {
  const canonical = JSON.stringify([
    e.ts,
    e.source,
    e.connectionId,
    e.connectionName,
    e.dbType,
    e.sql,
    e.rowCount,
    e.success,
    e.error ?? null,
    e.durationMs ?? null
  ])
  return createHash('sha256').update(`${prevHash}\n${canonical}`).digest('hex')
}

interface Row {
  id: number
  ts: string
  source: string
  connection_id: string
  connection_name: string
  db_type: string
  sql: string
  row_count: number | null
  success: number
  error: string | null
  duration_ms: number | null
  prev_hash: string
  hash: string
}

function toEntry(r: Row): AuditEntry {
  return {
    id: r.id,
    ts: r.ts,
    source: r.source as AuditEntry['source'],
    connectionId: r.connection_id,
    connectionName: r.connection_name,
    dbType: r.db_type,
    sql: r.sql,
    rowCount: r.row_count,
    success: r.success === 1,
    error: r.error ?? undefined,
    durationMs: r.duration_ms ?? undefined,
    prevHash: r.prev_hash,
    hash: r.hash
  }
}

function whereClause(f: AuditFilters): { sql: string; params: unknown[] } {
  const conds: string[] = []
  const params: unknown[] = []
  if (f.source) {
    conds.push('source = ?')
    params.push(f.source)
  }
  if (f.connectionId) {
    conds.push('connection_id = ?')
    params.push(f.connectionId)
  }
  if (f.from) {
    conds.push('ts >= ?')
    params.push(f.from)
  }
  if (f.to) {
    conds.push('ts <= ?')
    params.push(f.to)
  }
  return { sql: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params }
}

function csvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  if (/^[=+\-@\t]/.test(s.trimStart()) || /^[\r\n]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export class AuditStorage {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        source TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        connection_name TEXT NOT NULL,
        db_type TEXT NOT NULL,
        sql TEXT NOT NULL,
        row_count INTEGER,
        success INTEGER NOT NULL,
        error TEXT,
        duration_ms INTEGER,
        prev_hash TEXT NOT NULL,
        hash TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log (ts);
      CREATE TABLE IF NOT EXISTS audit_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `)
  }

  private get anchor(): string {
    const row = this.db.prepare("SELECT value FROM audit_meta WHERE key = 'chainAnchor'").get() as
      { value: string } | undefined
    return row?.value ?? ZERO_HASH
  }

  private lastHash(): string {
    const row = this.db.prepare('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1').get() as
      { hash: string } | undefined
    return row?.hash ?? this.anchor
  }

  record(entry: AuditEntryInput): void {
    const ts = new Date().toISOString()
    const prevHash = this.lastHash()
    const hash = entryHash(prevHash, { ...entry, ts })
    this.db
      .prepare(
        `INSERT INTO audit_log
         (ts, source, connection_id, connection_name, db_type, sql, row_count, success, error, duration_ms, prev_hash, hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        ts,
        entry.source,
        entry.connectionId,
        entry.connectionName,
        entry.dbType,
        entry.sql,
        entry.rowCount,
        entry.success ? 1 : 0,
        entry.error ?? null,
        entry.durationMs ?? null,
        prevHash,
        hash
      )
  }

  list(opts: AuditFilters & { limit: number; offset: number }): AuditEntry[] {
    const { sql, params } = whereClause(opts)
    const rows = this.db
      .prepare(`SELECT * FROM audit_log ${sql} ORDER BY id ASC LIMIT ? OFFSET ?`)
      .all(...params, opts.limit, opts.offset) as Row[]
    return rows.map(toEntry)
  }

  count(filters: AuditFilters): number {
    const { sql, params } = whereClause(filters)
    const row = this.db.prepare(`SELECT count(*) AS n FROM audit_log ${sql}`).get(...params) as {
      n: number
    }
    return row.n
  }

  verify(): AuditVerifyResult {
    const rows = this.db.prepare('SELECT * FROM audit_log ORDER BY id ASC').all() as Row[]
    let prev = this.anchor
    for (const r of rows) {
      const expected = entryHash(prev, {
        ts: r.ts,
        source: r.source as AuditEntryInput['source'],
        connectionId: r.connection_id,
        connectionName: r.connection_name,
        dbType: r.db_type,
        sql: r.sql,
        rowCount: r.row_count,
        success: r.success === 1,
        error: r.error ?? undefined,
        durationMs: r.duration_ms ?? undefined
      })
      if (r.prev_hash !== prev || r.hash !== expected) {
        return { valid: false, entries: rows.length, firstBrokenId: r.id }
      }
      prev = r.hash
    }
    return { valid: true, entries: rows.length }
  }

  exportTo(
    format: 'csv' | 'json',
    filePath: string,
    filters: AuditFilters = {}
  ): { entries: number } {
    const entries = this.list({ ...filters, limit: Number.MAX_SAFE_INTEGER, offset: 0 })
    if (format === 'json') {
      writeFileSync(filePath, JSON.stringify(entries, null, 2))
    } else {
      const header =
        'ts,source,connectionId,connectionName,dbType,sql,rowCount,success,error,durationMs,prevHash,hash'
      const lines = entries.map((e) =>
        [
          e.ts,
          e.source,
          e.connectionId,
          e.connectionName,
          e.dbType,
          e.sql,
          e.rowCount,
          e.success,
          e.error,
          e.durationMs,
          e.prevHash,
          e.hash
        ]
          .map(csvField)
          .join(',')
      )
      writeFileSync(filePath, [header, ...lines].join('\n'))
    }
    log.debug(`Exported ${entries.length} audit entries to ${filePath}`)
    return { entries: entries.length }
  }

  prune(maxAgeDays: number): number {
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 3600 * 1000).toISOString()
    const runPrune = this.db.transaction((cutoffTs: string) => {
      // The hash chain is ordered by id, so pruning must remove a contiguous id-prefix
      // and re-anchor to the last removed row's hash. Deleting `WHERE ts < cutoff`
      // directly would leave a hole if a backward clock change made an earlier-inserted
      // row's ts newer than a later one — the survivors would be orphaned from the anchor
      // and verify() would fail permanently. So pick the boundary as the highest id whose
      // ts is older than the cutoff, then delete by id up to (and including) that boundary.
      const boundary = this.db
        .prepare('SELECT id, hash FROM audit_log WHERE ts < ? ORDER BY id DESC LIMIT 1')
        .get(cutoffTs) as { id: number; hash: string } | undefined
      if (!boundary) return 0
      const result = this.db.prepare('DELETE FROM audit_log WHERE id <= ?').run(boundary.id)
      this.db
        .prepare(
          "INSERT INTO audit_meta (key, value) VALUES ('chainAnchor', ?) " +
            'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        )
        .run(boundary.hash)
      return result.changes
    })
    return runPrune(cutoff)
  }

  close(): void {
    this.db.close()
  }
}
