import { describe, it, expect } from 'vitest'
import { parseTabReferences } from '../cross-tab-parser'

describe('parseTabReferences', () => {
  it('finds a basic reference', () => {
    const r = parseTabReferences('SELECT * FROM @active_users')
    expect(r.references).toHaveLength(1)
    expect(r.references[0].name).toBe('active_users')
    expect(r.references[0].raw).toBe('@active_users')
    expect(r.referencedNames).toEqual(new Set(['active_users']))
  })

  it('finds multiple distinct references', () => {
    const r = parseTabReferences(
      'SELECT * FROM @active_users JOIN @recent_purchases USING(user_id)'
    )
    expect(r.references).toHaveLength(2)
    expect(r.referencedNames).toEqual(new Set(['active_users', 'recent_purchases']))
  })

  it('deduplicates the same name in referencedNames', () => {
    const r = parseTabReferences(
      'SELECT * FROM @active_users a, @active_users b WHERE a.id < b.id'
    )
    expect(r.references).toHaveLength(2)
    expect(r.referencedNames.size).toBe(1)
  })

  it('records correct start/end positions', () => {
    const sql = 'SELECT * FROM @active_users LIMIT 1'
    const r = parseTabReferences(sql)
    const ref = r.references[0]
    expect(sql.slice(ref.start, ref.end)).toBe('@active_users')
  })

  describe('ignores references inside strings', () => {
    it('single-quoted string', () => {
      const r = parseTabReferences("SELECT '@hidden' FROM users")
      expect(r.references).toHaveLength(0)
    })

    it('doubled-quote escape', () => {
      const r = parseTabReferences("SELECT 'it''s @gone' FROM users")
      expect(r.references).toHaveLength(0)
    })

    it('double-quoted identifier', () => {
      const r = parseTabReferences('SELECT "col@name" FROM users')
      expect(r.references).toHaveLength(0)
    })

    it('dollar-quoted body', () => {
      const r = parseTabReferences("SELECT $body$ @ignored $body$ FROM x")
      expect(r.references).toHaveLength(0)
    })

    it('mixed: real ref + ref inside string', () => {
      const r = parseTabReferences("SELECT '@x' FROM @real_tab")
      expect(r.references).toHaveLength(1)
      expect(r.references[0].name).toBe('real_tab')
    })
  })

  describe('ignores references inside comments', () => {
    it('line comment', () => {
      const r = parseTabReferences('SELECT 1 -- @ignored\nFROM x')
      expect(r.references).toHaveLength(0)
    })

    it('block comment', () => {
      const r = parseTabReferences('SELECT /* @ignored */ 1 FROM x')
      expect(r.references).toHaveLength(0)
    })

    it('nested block comment', () => {
      const r = parseTabReferences('SELECT /* /* @ignored */ */ 1 FROM x')
      expect(r.references).toHaveLength(0)
    })

    it('real ref after a block comment', () => {
      const r = parseTabReferences('SELECT /* @x */ * FROM @real')
      expect(r.references).toHaveLength(1)
      expect(r.references[0].name).toBe('real')
    })
  })

  describe('email-like sequences', () => {
    it('alice@example.com is not a reference', () => {
      const r = parseTabReferences("SELECT 'alice@example.com'")
      expect(r.references).toHaveLength(0)
    })

    it('unquoted alice@example only consumes valid lowercase ident', () => {
      // The `@` here is preceded by `e` (word continuation), so not a ref.
      const r = parseTabReferences('SELECT alice@example FROM x')
      expect(r.references).toHaveLength(0)
    })

    it('@ at start of input is fine', () => {
      const r = parseTabReferences('@foo')
      expect(r.references).toHaveLength(1)
      expect(r.references[0].name).toBe('foo')
    })
  })

  describe('boundaries', () => {
    it('@ followed by invalid char is not consumed', () => {
      const r = parseTabReferences('SELECT @ FROM x')
      expect(r.references).toHaveLength(0)
    })

    it('@ followed by digit is not consumed (must start with letter)', () => {
      const r = parseTabReferences('SELECT @1foo FROM x')
      expect(r.references).toHaveLength(0)
    })

    it('@FOO uppercase is not consumed (must be lowercase)', () => {
      const r = parseTabReferences('SELECT @FOO FROM x')
      expect(r.references).toHaveLength(0)
    })

    it('lone @ at end of input', () => {
      const r = parseTabReferences('SELECT * FROM x WHERE c = @')
      expect(r.references).toHaveLength(0)
    })

    it('reference followed by punctuation', () => {
      const r = parseTabReferences('SELECT * FROM @t WHERE id IN (SELECT id FROM @other);')
      expect(r.references.map((x) => x.name)).toEqual(['t', 'other'])
    })

    it('reference followed by underscore continues the name', () => {
      const r = parseTabReferences('SELECT * FROM @my_long_name__id')
      expect(r.references).toHaveLength(1)
      expect(r.references[0].name).toBe('my_long_name__id')
    })
  })

  it('no references → empty result', () => {
    const r = parseTabReferences('SELECT * FROM users')
    expect(r.references).toHaveLength(0)
    expect(r.referencedNames.size).toBe(0)
  })

  it('empty input → empty result', () => {
    const r = parseTabReferences('')
    expect(r.references).toHaveLength(0)
  })
})
