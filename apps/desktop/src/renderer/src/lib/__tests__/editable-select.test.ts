import { describe, it, expect } from 'vitest'
import { analyzeEditableSelect } from '../editable-select'

describe('analyzeEditableSelect', () => {
  describe('simple single-table selects', () => {
    it('SELECT * FROM users', () => {
      expect(analyzeEditableSelect('SELECT * FROM users', 'postgresql')).toEqual({
        schema: null,
        table: 'users',
        alias: null,
        projection: { type: 'star' }
      })
    })

    it('handles trailing semicolon', () => {
      expect(analyzeEditableSelect('SELECT * FROM users;', 'postgresql')).toEqual({
        schema: null,
        table: 'users',
        alias: null,
        projection: { type: 'star' }
      })
    })

    it('handles WHERE clause', () => {
      const r = analyzeEditableSelect('SELECT * FROM users WHERE id = 1', 'postgresql')
      expect(r?.table).toBe('users')
      expect(r?.projection).toEqual({ type: 'star' })
    })

    it('handles LIMIT', () => {
      const r = analyzeEditableSelect('SELECT * FROM bookings2 limit 1', 'postgresql')
      expect(r?.table).toBe('bookings2')
    })

    it("handles WHERE id='y' with string literal containing keywords", () => {
      const r = analyzeEditableSelect("SELECT * FROM bookings2 WHERE id='y join'", 'postgresql')
      expect(r?.table).toBe('bookings2')
    })

    it('handles ORDER BY + LIMIT + OFFSET', () => {
      const r = analyzeEditableSelect(
        'SELECT * FROM users ORDER BY id DESC LIMIT 10 OFFSET 5',
        'postgresql'
      )
      expect(r?.table).toBe('users')
    })

    it('is case-insensitive for keywords', () => {
      const r = analyzeEditableSelect('select * from users', 'postgresql')
      expect(r?.table).toBe('users')
    })

    it('handles schema-qualified table', () => {
      const r = analyzeEditableSelect('SELECT * FROM public.users', 'postgresql')
      expect(r?.schema).toBe('public')
      expect(r?.table).toBe('users')
    })

    it('handles table alias', () => {
      const r = analyzeEditableSelect('SELECT * FROM users u', 'postgresql')
      expect(r?.table).toBe('users')
      expect(r?.alias).toBe('u')
    })

    it('handles AS alias', () => {
      const r = analyzeEditableSelect('SELECT * FROM users AS u', 'postgresql')
      expect(r?.alias).toBe('u')
    })

    it('handles explicit column list', () => {
      const r = analyzeEditableSelect('SELECT id, name FROM users', 'postgresql')
      expect(r?.projection).toEqual({ type: 'columns', names: ['id', 'name'] })
    })

    it('handles alias-prefixed columns', () => {
      const r = analyzeEditableSelect('SELECT u.id, u.name FROM users u', 'postgresql')
      expect(r?.projection).toEqual({ type: 'columns', names: ['id', 'name'] })
    })

    it('handles alias.* as star', () => {
      const r = analyzeEditableSelect('SELECT u.* FROM users u', 'postgresql')
      expect(r?.projection).toEqual({ type: 'star' })
    })

    it('handles quoted identifier for table', () => {
      const r = analyzeEditableSelect('SELECT * FROM "Users"', 'postgresql')
      expect(r?.table).toBe('Users')
    })

    it('handles backtick identifier for mysql', () => {
      const r = analyzeEditableSelect('SELECT * FROM `my-table`', 'mysql')
      expect(r?.table).toBe('my-table')
    })

    it('handles bracket identifier for mssql', () => {
      const r = analyzeEditableSelect('SELECT * FROM [users]', 'mssql')
      expect(r?.table).toBe('users')
    })

    it('handles line comments', () => {
      const r = analyzeEditableSelect('-- comment\nSELECT * FROM users', 'postgresql')
      expect(r?.table).toBe('users')
    })

    it('handles block comments', () => {
      const r = analyzeEditableSelect('/* block */ SELECT * FROM users', 'postgresql')
      expect(r?.table).toBe('users')
    })

    it('handles # comments for mysql', () => {
      const r = analyzeEditableSelect('# comment\nSELECT * FROM users', 'mysql')
      expect(r?.table).toBe('users')
    })

    it('handles WHERE with column comparison using keyword-like values', () => {
      const r = analyzeEditableSelect("SELECT * FROM tasks WHERE status = 'group by'", 'postgresql')
      expect(r?.table).toBe('tasks')
    })
  })

  describe('rejects non-editable queries', () => {
    it('INSERT', () => {
      expect(analyzeEditableSelect('INSERT INTO users VALUES (1)', 'postgresql')).toBeNull()
    })

    it('UPDATE', () => {
      expect(analyzeEditableSelect('UPDATE users SET x=1', 'postgresql')).toBeNull()
    })

    it('DELETE', () => {
      expect(analyzeEditableSelect('DELETE FROM users', 'postgresql')).toBeNull()
    })

    it('empty string', () => {
      expect(analyzeEditableSelect('', 'postgresql')).toBeNull()
    })

    it('whitespace only', () => {
      expect(analyzeEditableSelect('   \n\t  ', 'postgresql')).toBeNull()
    })

    it('CTE (WITH)', () => {
      expect(
        analyzeEditableSelect('WITH u AS (SELECT * FROM users) SELECT * FROM u', 'postgresql')
      ).toBeNull()
    })

    it('JOIN', () => {
      expect(
        analyzeEditableSelect(
          'SELECT * FROM users u JOIN orders o ON u.id = o.user_id',
          'postgresql'
        )
      ).toBeNull()
    })

    it('LEFT JOIN', () => {
      expect(
        analyzeEditableSelect('SELECT * FROM users LEFT JOIN orders ON 1=1', 'postgresql')
      ).toBeNull()
    })

    it('CROSS JOIN', () => {
      expect(
        analyzeEditableSelect('SELECT * FROM users CROSS JOIN orders', 'postgresql')
      ).toBeNull()
    })

    it('comma join', () => {
      expect(analyzeEditableSelect('SELECT * FROM users, orders', 'postgresql')).toBeNull()
    })

    it('UNION', () => {
      expect(
        analyzeEditableSelect('SELECT * FROM users UNION SELECT * FROM other', 'postgresql')
      ).toBeNull()
    })

    it('DISTINCT', () => {
      expect(analyzeEditableSelect('SELECT DISTINCT * FROM users', 'postgresql')).toBeNull()
    })

    it('GROUP BY', () => {
      expect(analyzeEditableSelect('SELECT id FROM users GROUP BY id', 'postgresql')).toBeNull()
    })

    it('aggregate in projection', () => {
      expect(analyzeEditableSelect('SELECT COUNT(*) FROM users', 'postgresql')).toBeNull()
    })

    it('expression in projection', () => {
      expect(analyzeEditableSelect('SELECT id + 1 FROM users', 'postgresql')).toBeNull()
    })

    it('aliased projection column', () => {
      expect(analyzeEditableSelect('SELECT id AS foo FROM users', 'postgresql')).toBeNull()
    })

    it('subquery in FROM', () => {
      expect(
        analyzeEditableSelect('SELECT * FROM (SELECT * FROM users) sub', 'postgresql')
      ).toBeNull()
    })

    it('multiple statements', () => {
      expect(
        analyzeEditableSelect('SELECT * FROM users; SELECT * FROM other', 'postgresql')
      ).toBeNull()
    })

    it('MSSQL TOP', () => {
      expect(analyzeEditableSelect('SELECT TOP 10 * FROM users', 'mssql')).toBeNull()
    })
  })
})
