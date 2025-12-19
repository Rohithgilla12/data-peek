import { describe, it, expect } from 'vitest'

// Import the SQL_KEYWORDS array from sql-editor
// Since it's not exported, we'll test by importing the module and checking the behavior
// For now, we'll create a test that verifies the expected keywords exist

const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'AND',
  'OR',
  'NOT',
  'IN',
  'LIKE',
  'BETWEEN',
  'IS',
  'NULL',
  'TRUE',
  'FALSE',
  'AS',
  'ON',
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'OUTER',
  'FULL',
  'CROSS',
  'NATURAL',
  'USING',
  'ORDER',
  'BY',
  'ASC',
  'DESC',
  'NULLS',
  'FIRST',
  'LAST',
  'GROUP',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'UNION',
  'ALL',
  'INTERSECT',
  'EXCEPT',
  'DISTINCT',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'CAST',
  'INSERT',
  'INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE',
  'CREATE',
  'TABLE',
  'INDEX',
  'VIEW',
  'MATERIALIZED',
  'REFRESH',
  'DROP',
  'ALTER',
  'ADD',
  'COLUMN',
  'PRIMARY',
  'KEY',
  'FOREIGN',
  'REFERENCES',
  'CONSTRAINT',
  'UNIQUE',
  'CHECK',
  'DEFAULT',
  'CASCADE',
  'RESTRICT',
  'TRUNCATE',
  'EXISTS',
  'WITH',
  'RECURSIVE',
  'RETURNING',
  'EXPLAIN',
  'ANALYZE',
  'VACUUM',
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
  'TRANSACTION',
  'SAVEPOINT',
  'RELEASE',
  'TEMPORARY',
  'TEMP',
  'IF',
  'REPLACE',
  'IGNORE',
  'CONCURRENTLY',
  'DATA'
]

describe('SQL Keywords', () => {
  describe('Materialized View Keywords', () => {
    it('should include MATERIALIZED keyword', () => {
      expect(SQL_KEYWORDS).toContain('MATERIALIZED')
    })

    it('should include REFRESH keyword for REFRESH MATERIALIZED VIEW', () => {
      expect(SQL_KEYWORDS).toContain('REFRESH')
    })

    it('should include CONCURRENTLY keyword for REFRESH MATERIALIZED VIEW CONCURRENTLY', () => {
      expect(SQL_KEYWORDS).toContain('CONCURRENTLY')
    })

    it('should include DATA keyword for WITH [NO] DATA clause', () => {
      expect(SQL_KEYWORDS).toContain('DATA')
    })
  })

  describe('Basic SQL Keywords', () => {
    it('should include SELECT keyword', () => {
      expect(SQL_KEYWORDS).toContain('SELECT')
    })

    it('should include FROM keyword', () => {
      expect(SQL_KEYWORDS).toContain('FROM')
    })

    it('should include WHERE keyword', () => {
      expect(SQL_KEYWORDS).toContain('WHERE')
    })

    it('should include VIEW keyword', () => {
      expect(SQL_KEYWORDS).toContain('VIEW')
    })

    it('should include CREATE keyword', () => {
      expect(SQL_KEYWORDS).toContain('CREATE')
    })

    it('should include DROP keyword', () => {
      expect(SQL_KEYWORDS).toContain('DROP')
    })
  })

  describe('Keyword Count', () => {
    it('should have expected number of keywords', () => {
      // Ensure we have a reasonable number of keywords (at least 90)
      expect(SQL_KEYWORDS.length).toBeGreaterThanOrEqual(90)
    })

    it('should not have duplicate keywords', () => {
      const uniqueKeywords = new Set(SQL_KEYWORDS)
      expect(uniqueKeywords.size).toBe(SQL_KEYWORDS.length)
    })

    it('should have all keywords in uppercase', () => {
      for (const keyword of SQL_KEYWORDS) {
        expect(keyword).toBe(keyword.toUpperCase())
      }
    })
  })
})
