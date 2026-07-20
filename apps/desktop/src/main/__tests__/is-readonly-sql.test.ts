import { describe, it, expect } from 'vitest'
import { isReadOnlySql } from '@shared/index'

describe('isReadOnlySql', () => {
  it('accepts single read statements', () => {
    expect(isReadOnlySql('SELECT * FROM users')).toBe(true)
    expect(isReadOnlySql('select count(*) from orders;')).toBe(true)
    expect(isReadOnlySql('WITH t AS (SELECT 1) SELECT * FROM t')).toBe(true)
    expect(isReadOnlySql('SHOW server_version')).toBe(true)
    expect(isReadOnlySql('EXPLAIN SELECT 1')).toBe(true)
    expect(isReadOnlySql('(SELECT 1)')).toBe(true)
  })

  it('is not fooled by write keywords inside string/identifier literals or names', () => {
    expect(isReadOnlySql("SELECT 'insert into x' AS note")).toBe(true)
    expect(isReadOnlySql('SELECT "update" FROM t')).toBe(true)
    expect(isReadOnlySql('SELECT * FROM lock_events')).toBe(true)
    expect(isReadOnlySql('SELECT created_at FROM users')).toBe(true)
  })

  it('rejects a read statement chained with a second, mutating statement', () => {
    // The exact bypass the review flagged.
    expect(isReadOnlySql('SELECT 1; REFRESH MATERIALIZED VIEW v')).toBe(false)
    expect(isReadOnlySql('SELECT 1; DROP TABLE users')).toBe(false)
    expect(isReadOnlySql('SELECT 1; LOCK TABLE t')).toBe(false)
    expect(isReadOnlySql('SELECT 1; CLUSTER t')).toBe(false)
    expect(isReadOnlySql('SELECT 1 ; RENAME TABLE a TO b')).toBe(false)
    expect(isReadOnlySql('SELECT 1; -- x\nUPDATE t SET a = 1')).toBe(false)
  })

  it('rejects outright writes / DDL / side-effecting statements', () => {
    expect(isReadOnlySql('UPDATE t SET a = 1')).toBe(false)
    expect(isReadOnlySql('DELETE FROM t')).toBe(false)
    expect(isReadOnlySql('REFRESH MATERIALIZED VIEW v')).toBe(false)
    expect(isReadOnlySql('SELECT * INTO t2 FROM t1')).toBe(false)
    expect(isReadOnlySql('WITH x AS (INSERT INTO t VALUES (1) RETURNING *) SELECT * FROM x')).toBe(
      false
    )
    expect(isReadOnlySql('')).toBe(false)
  })
})
