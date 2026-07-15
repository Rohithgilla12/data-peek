import { test, expect } from './fixtures/electron-app'
import { startSeededPostgres, type SeededPostgres } from './fixtures/postgres'

/**
 * Manual transaction (auto-commit off) tests against the seeded Postgres. These pin
 * the session-pinned-client contract end-to-end: begin/commit/rollback IPC handlers →
 * PostgresAdapter session map → a dedicated pool client held open across calls.
 *
 * Each test uses its own sessionId so a failed assertion can't leak an open
 * transaction into the next test.
 */

let pg: SeededPostgres

test.beforeAll(async () => {
  pg = await startSeededPostgres()
})

test.afterAll(async () => {
  await pg?.stop()
})

test('uncommitted changes are visible in-session but invisible outside it', async ({ window }) => {
  const result = await window.evaluate(async (cfg) => {
    const sessionId = 'e2e-tx-visibility'
    const begin = await window.api.db.beginTransaction(cfg, sessionId)

    await window.api.db.query(
      cfg,
      "UPDATE users SET name = 'TX Pending' WHERE email = (SELECT email FROM users ORDER BY email LIMIT 1)",
      undefined,
      undefined,
      sessionId
    )

    const inSession = await window.api.db.query(
      cfg,
      "SELECT count(*)::int AS n FROM users WHERE name = 'TX Pending'",
      undefined,
      undefined,
      sessionId
    )
    // No sessionId → separate pooled client → must not see the uncommitted row.
    const outsideSession = await window.api.db.query(
      cfg,
      "SELECT count(*)::int AS n FROM users WHERE name = 'TX Pending'"
    )

    await window.api.db.rollbackTransaction(cfg, sessionId)

    const afterRollback = await window.api.db.query(
      cfg,
      "SELECT count(*)::int AS n FROM users WHERE name = 'TX Pending'"
    )

    const count = (r: unknown): number =>
      ((r as { data?: { results?: Array<{ rows: Array<{ n: number }> }> } }).data?.results?.[0]
        ?.rows?.[0]?.n ?? -1) as number

    return {
      beginOk: begin.success,
      inSession: count(inSession),
      outsideSession: count(outsideSession),
      afterRollback: count(afterRollback)
    }
  }, pg.config)

  expect(result.beginOk).toBe(true)
  expect(result.inSession).toBe(1)
  expect(result.outsideSession).toBe(0)
  expect(result.afterRollback).toBe(0)
})

test('commit persists in-session changes', async ({ window }) => {
  const result = await window.evaluate(async (cfg) => {
    const sessionId = 'e2e-tx-commit'
    await window.api.db.beginTransaction(cfg, sessionId)

    await window.api.db.query(
      cfg,
      "INSERT INTO users (email, name) VALUES ('tx-commit@example.com', 'TX Committed')",
      undefined,
      undefined,
      sessionId
    )

    const commit = await window.api.db.commitTransaction(cfg, sessionId)

    const afterCommit = await window.api.db.query(
      cfg,
      "SELECT count(*)::int AS n FROM users WHERE email = 'tx-commit@example.com'"
    )

    const n =
      (
        afterCommit as {
          data?: { results?: Array<{ rows: Array<{ n: number }> }> }
        }
      ).data?.results?.[0]?.rows?.[0]?.n ?? -1

    // Clean up so other specs' row-count expectations aren't disturbed.
    await window.api.db.query(cfg, "DELETE FROM users WHERE email = 'tx-commit@example.com'")

    return { commitOk: commit.success, afterCommit: n }
  }, pg.config)

  expect(result.commitOk).toBe(true)
  expect(result.afterCommit).toBe(1)
})

test('a failed statement poisons the transaction until rollback', async ({ window }) => {
  const result = await window.evaluate(async (cfg) => {
    const sessionId = 'e2e-tx-poison'
    await window.api.db.beginTransaction(cfg, sessionId)

    const bad = await window.api.db.query(
      cfg,
      'SELECT * FROM nonexistent_table_xyzzy',
      undefined,
      undefined,
      sessionId
    )
    // Postgres aborts the tx: further statements on the session must fail...
    const afterError = await window.api.db.query(
      cfg,
      'SELECT 1 AS n',
      undefined,
      undefined,
      sessionId
    )

    const rollback = await window.api.db.rollbackTransaction(cfg, sessionId)

    // ...and after rollback the connection pool must still be healthy.
    const afterRollback = await window.api.db.query(cfg, 'SELECT 1 AS n')

    return {
      badOk: bad.success,
      afterErrorOk: afterError.success,
      rollbackOk: rollback.success,
      afterRollbackOk: afterRollback.success
    }
  }, pg.config)

  expect(result.badOk).toBe(false)
  expect(result.afterErrorOk).toBe(false)
  expect(result.rollbackOk).toBe(true)
  expect(result.afterRollbackOk).toBe(true)
})

test('double begin on the same session is rejected', async ({ window }) => {
  const result = await window.evaluate(async (cfg) => {
    const sessionId = 'e2e-tx-double-begin'
    const first = await window.api.db.beginTransaction(cfg, sessionId)
    const second = await window.api.db.beginTransaction(cfg, sessionId)
    await window.api.db.rollbackTransaction(cfg, sessionId)
    return { firstOk: first.success, secondOk: second.success, secondError: second.error }
  }, pg.config)

  expect(result.firstOk).toBe(true)
  expect(result.secondOk).toBe(false)
  expect(result.secondError).toContain('already has an active transaction')
})

test('commit and rollback without an active session are safe no-ops', async ({ window }) => {
  const result = await window.evaluate(async (cfg) => {
    const commit = await window.api.db.commitTransaction(cfg, 'e2e-tx-ghost')
    const rollback = await window.api.db.rollbackTransaction(cfg, 'e2e-tx-ghost')
    return { commitOk: commit.success, rollbackOk: rollback.success }
  }, pg.config)

  expect(result.commitOk).toBe(true)
  expect(result.rollbackOk).toBe(true)
})

test('edit batch with a sessionId executes inside the open transaction', async ({ window }) => {
  const result = await window.evaluate(async (cfg) => {
    const sessionId = 'e2e-tx-edit-batch'
    await window.api.db.beginTransaction(cfg, sessionId)

    const columns = [
      { name: 'email', dataType: 'character varying' },
      { name: 'name', dataType: 'character varying' }
    ]
    const batch = {
      sessionId,
      context: {
        schema: 'public',
        table: 'users',
        primaryKeyColumns: ['id'],
        columns: columns.map((c) => ({ ...c, nullable: false }))
      },
      operations: [
        {
          type: 'insert',
          id: 'op-1',
          values: { email: 'tx-batch@example.com', name: 'TX Batch' },
          columns
        }
      ]
    }
    const exec = await window.api.db.execute(cfg, batch as never)

    // Visible in-session, not outside.
    const outside = await window.api.db.query(
      cfg,
      "SELECT count(*)::int AS n FROM users WHERE email = 'tx-batch@example.com'"
    )

    await window.api.db.rollbackTransaction(cfg, sessionId)

    const afterRollback = await window.api.db.query(
      cfg,
      "SELECT count(*)::int AS n FROM users WHERE email = 'tx-batch@example.com'"
    )

    const count = (r: unknown): number =>
      ((r as { data?: { results?: Array<{ rows: Array<{ n: number }> }> } }).data?.results?.[0]
        ?.rows?.[0]?.n ?? -1) as number

    return {
      execOk: exec.success && exec.data?.success,
      rowsAffected: exec.data?.rowsAffected,
      outside: count(outside),
      afterRollback: count(afterRollback)
    }
  }, pg.config)

  expect(result.execOk).toBe(true)
  expect(result.rowsAffected).toBe(1)
  expect(result.outside).toBe(0)
  expect(result.afterRollback).toBe(0)
})
