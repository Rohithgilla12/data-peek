import { randomUUID, createHash } from 'crypto'
import { join } from 'path'
import { createRequire } from 'module'
import type BetterSqlite3 from 'better-sqlite3'
import {
  TM_MAX_SNAPSHOT_PAYLOAD_BYTES,
  TM_MAX_RUNS_PER_QUERY,
  TM_GLOBAL_BUDGET_BYTES
} from '@shared/index'
import type {
  TimeMachineCapturePayload,
  TimeMachineRunMeta,
  TimeMachineSnapshot,
  TimeMachineStats
} from '@shared/index'
import { createLogger } from './lib/logger'

const log = createLogger('time-machine-storage')

// Meta queries must never touch the rows column — payloads stay on disk until
// a snapshot is explicitly requested.
const META_COLUMNS = `id, connection_id, fingerprint, sql, captured_at, duration_ms,
  row_count, stored_row_count, truncated, content_hash, key_strategy, key_columns,
  payload_bytes, (rows IS NOT NULL) AS has_rows`

interface RunMetaRow {
  id: string
  connection_id: string
  fingerprint: string
  sql: string
  captured_at: number
  duration_ms: number
  row_count: number
  stored_row_count: number
  truncated: number
  content_hash: string
  key_strategy: 'primary_key' | 'row_position'
  key_columns: string
  payload_bytes: number
  has_rows: number
}

interface SnapshotRow extends RunMetaRow {
  columns: string
  rows: string | null
}

function rowToRunMeta(row: RunMetaRow): TimeMachineRunMeta {
  return {
    id: row.id,
    connectionId: row.connection_id,
    fingerprint: row.fingerprint,
    sql: row.sql,
    capturedAt: row.captured_at,
    durationMs: row.duration_ms,
    rowCount: row.row_count,
    storedRowCount: row.stored_row_count,
    truncated: row.truncated === 1,
    contentHash: row.content_hash,
    keyStrategy: row.key_strategy,
    keyColumns: JSON.parse(row.key_columns) as string[],
    hasRows: row.has_rows === 1
  }
}

// Cap overrides exist for tests only — production callers rely on the shared defaults.
export interface TimeMachineStorageOptions {
  maxRunsPerQuery?: number
  globalBudgetBytes?: number
  maxPayloadBytes?: number
}

export class TimeMachineStorage {
  private db: BetterSqlite3.Database
  private maxRunsPerQuery: number
  private globalBudgetBytes: number
  private maxPayloadBytes: number

  constructor(userDataPath: string, options: TimeMachineStorageOptions = {}) {
    this.maxRunsPerQuery = options.maxRunsPerQuery ?? TM_MAX_RUNS_PER_QUERY
    this.globalBudgetBytes = options.globalBudgetBytes ?? TM_GLOBAL_BUDGET_BYTES
    this.maxPayloadBytes = options.maxPayloadBytes ?? TM_MAX_SNAPSHOT_PAYLOAD_BYTES

    const dbPath = join(userDataPath, 'time-machine.db')

    // Load the native module lazily so a broken-arch better-sqlite3 binary does
    // not crash the main process at import time. The constructor try/catch in
    // index.ts can then degrade to null storage.
    const Database = createRequire(import.meta.url)('better-sqlite3') as typeof BetterSqlite3
    this.db = new Database(dbPath)
    // auto_vacuum only takes effect when set before the first table is created,
    // which is why it precedes init(). incremental_vacuum then actually shrinks
    // the file after evictions.
    this.db.pragma('auto_vacuum = INCREMENTAL')
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.init()
    log.info('TimeMachineStorage initialised', dbPath)
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        sql TEXT NOT NULL,
        captured_at INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        row_count INTEGER NOT NULL,
        stored_row_count INTEGER NOT NULL,
        truncated INTEGER NOT NULL DEFAULT 0,
        content_hash TEXT NOT NULL,
        key_strategy TEXT NOT NULL,
        key_columns TEXT NOT NULL,
        columns TEXT NOT NULL,
        rows TEXT,
        payload_bytes INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_runs_conn_fp_at
        ON runs (connection_id, fingerprint, captured_at DESC);
    `)
  }

  private vacuum(): void {
    this.db.pragma('incremental_vacuum')
  }

  insertRun(payload: TimeMachineCapturePayload, fingerprint: string): TimeMachineRunMeta {
    const id = randomUUID()
    const rowsJson = JSON.stringify(payload.rows)
    const payloadBytes = Buffer.byteLength(rowsJson)
    const contentHash = createHash('sha256').update(rowsJson).digest('hex')
    const overCap = payloadBytes > this.maxPayloadBytes

    const insertInTransaction = this.db.transaction((): boolean => {
      this.db
        .prepare(
          `INSERT INTO runs (
            id, connection_id, fingerprint, sql, captured_at, duration_ms,
            row_count, stored_row_count, truncated, content_hash, key_strategy,
            key_columns, columns, rows, payload_bytes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          payload.connectionId,
          fingerprint,
          payload.sql,
          payload.capturedAt,
          payload.durationMs,
          payload.rowCount,
          overCap ? 0 : payload.rows.length,
          payload.truncated ? 1 : 0,
          contentHash,
          payload.keyStrategy,
          JSON.stringify(payload.keyColumns),
          JSON.stringify(payload.columns),
          overCap ? null : rowsJson,
          // Metadata-only runs store nothing — counting their would-be size
          // against the global budget would evict real snapshots for phantom
          // bytes and inflate the Settings usage figure.
          overCap ? 0 : payloadBytes
        )

      // The just-inserted run is exempt from its own cap pass; otherwise a
      // backwards clock step (its captured_at older than the kept timeline)
      // would delete it and the post-transaction meta read would explode.
      const perQueryEvicted = this.db
        .prepare(
          `DELETE FROM runs
           WHERE connection_id = ? AND fingerprint = ? AND id != ?
             AND id NOT IN (
               SELECT id FROM runs
               WHERE connection_id = ? AND fingerprint = ? AND id != ?
               ORDER BY captured_at DESC, rowid DESC
               LIMIT ?
             )`
        )
        .run(
          payload.connectionId,
          fingerprint,
          id,
          payload.connectionId,
          fingerprint,
          id,
          this.maxRunsPerQuery - 1
        ).changes

      let budgetEvicted = 0
      let totalBytes = (
        this.db.prepare('SELECT COALESCE(SUM(payload_bytes), 0) AS total FROM runs').get() as {
          total: number
        }
      ).total

      if (totalBytes > this.globalBudgetBytes) {
        // Oldest-first eviction, never touching the run just inserted — if it
        // alone exceeds the budget it was already stored metadata-only or is
        // the sole survivor.
        const candidates = this.db
          .prepare(
            'SELECT id, payload_bytes FROM runs WHERE id != ? ORDER BY captured_at ASC, rowid ASC'
          )
          .all(id) as { id: string; payload_bytes: number }[]
        const deleteRun = this.db.prepare('DELETE FROM runs WHERE id = ?')
        for (const candidate of candidates) {
          if (totalBytes <= this.globalBudgetBytes) break
          deleteRun.run(candidate.id)
          totalBytes -= candidate.payload_bytes
          budgetEvicted++
        }
      }

      return perQueryEvicted > 0 || budgetEvicted > 0
    })

    const evicted = insertInTransaction()
    if (evicted) this.vacuum()

    const row = this.db
      .prepare(`SELECT ${META_COLUMNS} FROM runs WHERE id = ?`)
      .get(id) as RunMetaRow
    return rowToRunMeta(row)
  }

  listRuns(connectionId: string, fingerprint: string): TimeMachineRunMeta[] {
    const rows = this.db
      .prepare(
        `SELECT ${META_COLUMNS} FROM runs
         WHERE connection_id = ? AND fingerprint = ?
         ORDER BY captured_at DESC, rowid DESC`
      )
      .all(connectionId, fingerprint) as RunMetaRow[]
    return rows.map(rowToRunMeta)
  }

  getSnapshot(id: string): TimeMachineSnapshot {
    const row = this.db
      .prepare(
        `SELECT id, connection_id, fingerprint, sql, captured_at, duration_ms,
           row_count, stored_row_count, truncated, content_hash, key_strategy,
           key_columns, payload_bytes, columns, rows, (rows IS NOT NULL) AS has_rows
         FROM runs WHERE id = ?`
      )
      .get(id) as SnapshotRow | undefined

    if (!row) throw new Error(`Snapshot not found: ${id}`)
    if (row.rows === null) throw new Error('Snapshot payload was not stored (over size cap)')

    return {
      ...rowToRunMeta(row),
      columns: JSON.parse(row.columns) as { name: string; dataType: string }[],
      rows: JSON.parse(row.rows) as unknown[][]
    }
  }

  deleteRun(id: string): void {
    this.db.prepare('DELETE FROM runs WHERE id = ?').run(id)
    this.vacuum()
  }

  clearQuery(connectionId: string, fingerprint: string): void {
    this.db
      .prepare('DELETE FROM runs WHERE connection_id = ? AND fingerprint = ?')
      .run(connectionId, fingerprint)
    this.vacuum()
  }

  clearAll(connectionId?: string): void {
    if (connectionId) {
      this.db.prepare('DELETE FROM runs WHERE connection_id = ?').run(connectionId)
    } else {
      this.db.prepare('DELETE FROM runs').run()
    }
    this.vacuum()
  }

  stats(): TimeMachineStats {
    const row = this.db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM runs) AS run_count,
           (SELECT COUNT(*) FROM (SELECT DISTINCT connection_id, fingerprint FROM runs))
             AS query_count,
           (SELECT COALESCE(SUM(payload_bytes), 0) FROM runs) AS total_bytes,
           (SELECT MIN(captured_at) FROM runs) AS oldest_captured_at`
      )
      .get() as {
      run_count: number
      query_count: number
      total_bytes: number
      oldest_captured_at: number | null
    }

    return {
      runCount: row.run_count,
      queryCount: row.query_count,
      totalBytes: row.total_bytes,
      oldestCapturedAt: row.oldest_captured_at
    }
  }

  close(): void {
    // Truncate the WAL so deleted snapshot content doesn't linger in the
    // sidecar file after quit.
    try {
      this.db.pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      // Checkpoint is best-effort; close regardless.
    }
    this.db.close()
  }
}
