import { describe, it, expect } from 'vitest'
import { SQL_KEYWORDS } from '@/constants/sql-keywords'

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
