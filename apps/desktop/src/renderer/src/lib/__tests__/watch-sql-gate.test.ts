import { describe, it, expect } from 'vitest'
import { gateForWatch } from '../watch-sql-gate'

describe('gateForWatch', () => {
  describe('accepts pollable queries', () => {
    it('plain SELECT', () => {
      expect(gateForWatch('SELECT * FROM users')).toEqual({
        ok: true,
        leadingKeyword: 'SELECT'
      })
    })

    it('SELECT with WHERE / ORDER BY / LIMIT', () => {
      const r = gateForWatch(
        'SELECT id, email FROM users WHERE active = true ORDER BY id DESC LIMIT 50'
      )
      expect(r.ok).toBe(true)
    })

    it('CTE-led SELECT (WITH)', () => {
      const r = gateForWatch('WITH t AS (SELECT 1) SELECT * FROM t')
      expect(r).toEqual({ ok: true, leadingKeyword: 'WITH' })
    })

    it('CTE that mentions a mutating keyword inside a string literal is fine', () => {
      const r = gateForWatch(
        "WITH t AS (SELECT 'INSERT INTO logs' AS msg, 1 AS id) SELECT * FROM t"
      )
      expect(r.ok).toBe(true)
    })

    it('CTE that mentions a mutating keyword inside a block comment is fine', () => {
      const r = gateForWatch('WITH t AS (SELECT 1 /* INSERT INTO logs */ AS id) SELECT * FROM t')
      expect(r.ok).toBe(true)
    })

    it('trailing semicolon is fine', () => {
      expect(gateForWatch('SELECT 1;').ok).toBe(true)
    })

    it('line + block comments are stripped', () => {
      const sql = `
        -- header comment
        /* block
           comment */
        SELECT * FROM users;
      `
      expect(gateForWatch(sql).ok).toBe(true)
    })

    it('VALUES shorthand is accepted', () => {
      expect(gateForWatch("VALUES (1, 'a'), (2, 'b')").ok).toBe(true)
    })
  })

  describe('rejects mutating CTEs (the WITH body-scan)', () => {
    it('WITH x AS (DELETE ... RETURNING ...) SELECT * FROM x', () => {
      const r = gateForWatch(
        'WITH x AS (DELETE FROM users WHERE id = 1 RETURNING *) SELECT * FROM x'
      )
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('destructive_statement')
    })

    it('WITH x AS (UPDATE ... RETURNING ...) SELECT *', () => {
      const r = gateForWatch(
        "WITH x AS (UPDATE users SET email = 'x' WHERE id = 1 RETURNING *) SELECT * FROM x"
      )
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('destructive_statement')
    })

    it('WITH x AS (INSERT ... RETURNING ...) SELECT *', () => {
      const r = gateForWatch(
        "WITH x AS (INSERT INTO logs(msg) VALUES ('hi') RETURNING *) SELECT * FROM x"
      )
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('destructive_statement')
    })

    it('WITH x AS (CREATE TABLE ...) — DDL inside CTE is also refused', () => {
      // Not valid PG (CREATE inside CTE is rejected by the planner), but the
      // gate should reject early so the watch never gets to dispatch it.
      const r = gateForWatch('WITH x AS (CREATE TABLE foo (id int)) SELECT 1')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('ddl_statement')
    })
  })

  describe('rejects mutating queries', () => {
    it('INSERT', () => {
      const r = gateForWatch('INSERT INTO users (id) VALUES (1)')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('destructive_statement')
    })

    it('UPDATE', () => {
      const r = gateForWatch('UPDATE users SET email = NULL')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('destructive_statement')
    })

    it('DELETE', () => {
      const r = gateForWatch('DELETE FROM users WHERE id = 1')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('destructive_statement')
    })

    it('TRUNCATE', () => {
      const r = gateForWatch('TRUNCATE TABLE users')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('destructive_statement')
    })

    it('COPY', () => {
      const r = gateForWatch('COPY users FROM STDIN')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('destructive_statement')
    })
  })

  describe('rejects DDL', () => {
    it('CREATE TABLE', () => {
      const r = gateForWatch('CREATE TABLE users (id int)')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('ddl_statement')
    })

    it('DROP TABLE', () => {
      const r = gateForWatch('DROP TABLE users')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('ddl_statement')
    })

    it('ALTER TABLE', () => {
      const r = gateForWatch('ALTER TABLE users ADD COLUMN foo int')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('ddl_statement')
    })

    it('VACUUM', () => {
      const r = gateForWatch('VACUUM users')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('ddl_statement')
    })
  })

  describe('rejects transaction control', () => {
    it('BEGIN', () => {
      const r = gateForWatch('BEGIN')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('transaction_statement')
    })

    it('SET LOCAL', () => {
      const r = gateForWatch("SET LOCAL search_path = 'public'")
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('transaction_statement')
    })
  })

  describe('rejects multi-statement', () => {
    it('two SELECTs', () => {
      const r = gateForWatch('SELECT 1; SELECT 2')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('multi_statement')
    })

    it('SELECT followed by mutating statement', () => {
      const r = gateForWatch('SELECT 1; DELETE FROM users')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('multi_statement')
    })

    it('semicolons inside strings do not split', () => {
      const r = gateForWatch("SELECT ';' FROM users")
      expect(r.ok).toBe(true)
    })

    it('semicolons inside dollar-quotes do not split', () => {
      const r = gateForWatch('SELECT $body$ a; b $body$ FROM x')
      expect(r.ok).toBe(true)
    })

    it('escaped quotes inside strings do not break parsing', () => {
      const r = gateForWatch("SELECT 'it''s fine; really' FROM x")
      expect(r.ok).toBe(true)
    })
  })

  describe('rejects empty / unrecognized', () => {
    it('empty string', () => {
      const r = gateForWatch('')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('empty')
    })

    it('only comments', () => {
      const r = gateForWatch('-- nothing here')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('empty')
    })

    it('only whitespace', () => {
      const r = gateForWatch('   \n\t  ')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('empty')
    })

    it('garbage', () => {
      const r = gateForWatch('lorem ipsum dolor')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('unrecognized')
    })
  })
})
