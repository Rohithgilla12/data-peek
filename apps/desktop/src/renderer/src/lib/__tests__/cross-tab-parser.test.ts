import { describe, it, expect } from 'vitest'
import { parseTabReferences } from '../cross-tab-parser'

const pg = (sql: string) => parseTabReferences(sql, { dialect: 'postgresql' })
const my = (sql: string) => parseTabReferences(sql, { dialect: 'mysql' })
const ms = (sql: string) => parseTabReferences(sql, { dialect: 'mssql' })

describe('parseTabReferences', () => {
  it('finds a basic reference', () => {
    const r = pg('SELECT * FROM @active_users')
    expect(r.references).toHaveLength(1)
    expect(r.references[0].name).toBe('active_users')
    expect(r.references[0].raw).toBe('@active_users')
    expect(r.referencedNames).toEqual(new Set(['active_users']))
  })

  it('finds multiple distinct references', () => {
    const r = pg('SELECT * FROM @active_users JOIN @recent_purchases USING(user_id)')
    expect(r.references).toHaveLength(2)
    expect(r.referencedNames).toEqual(new Set(['active_users', 'recent_purchases']))
  })

  it('deduplicates the same name in referencedNames', () => {
    const r = pg('SELECT * FROM @active_users a, @active_users b WHERE a.id < b.id')
    expect(r.references).toHaveLength(2)
    expect(r.referencedNames.size).toBe(1)
  })

  it('records correct start/end positions', () => {
    const sql = 'SELECT * FROM @active_users LIMIT 1'
    const r = pg(sql)
    const ref = r.references[0]
    expect(sql.slice(ref.start, ref.end)).toBe('@active_users')
  })

  describe('ignores references inside strings', () => {
    it('single-quoted string', () => {
      expect(pg("SELECT '@hidden' FROM users").references).toHaveLength(0)
    })

    it('doubled-quote escape', () => {
      expect(pg("SELECT 'it''s @gone' FROM users").references).toHaveLength(0)
    })

    it('MySQL backslash escape keeps the string open', () => {
      // Bug fix: `\'` inside a single-quoted string is an escape in MySQL
      // default mode; the string continues, the `@bar` is hidden inside it.
      const r = my("SELECT 'foo\\'@bar' FROM t")
      expect(r.references).toHaveLength(0)
    })

    it('PG E-string backslash escape keeps the string open', () => {
      const r = pg("SELECT E'foo\\'@bar' FROM t")
      expect(r.references).toHaveLength(0)
    })

    it('double-quoted identifier', () => {
      expect(pg('SELECT "col@name" FROM users').references).toHaveLength(0)
    })

    it('MySQL backtick-quoted identifier hides @-tokens inside', () => {
      const r = my('SELECT `@col` FROM t')
      expect(r.references).toHaveLength(0)
    })

    it('MySQL doubled-backtick escape inside backtick identifier', () => {
      const r = my('SELECT `a``@b` FROM t')
      expect(r.references).toHaveLength(0)
    })

    it('MSSQL bracket-quoted identifier hides @-tokens inside', () => {
      const r = ms('SELECT [@col] FROM dbo.t')
      expect(r.references).toHaveLength(0)
    })

    it('MSSQL `]]` escapes a literal `]` inside brackets', () => {
      const r = ms('SELECT [a]]@b] FROM dbo.t')
      expect(r.references).toHaveLength(0)
    })

    it('dollar-quoted body (PG)', () => {
      expect(pg('SELECT $body$ @ignored $body$ FROM x').references).toHaveLength(0)
    })

    it('empty dollar-tag `$$ ... $$` (PG)', () => {
      expect(pg('SELECT $$ @ignored $$ FROM x').references).toHaveLength(0)
    })

    it('`$1$ ... $1$` is NOT a dollar-quote (PG positional placeholder)', () => {
      // Bug fix: dollar-quote tags can't start with a digit. `$1$` is the
      // positional placeholder $1 followed by $. The `@hidden` inside is
      // a real reference.
      const r = pg('SELECT * FROM @users WHERE id = $1 AND tag = $1$ @hidden $1$')
      const names = r.references.map((x) => x.name).sort()
      expect(names).toEqual(['hidden', 'users'])
    })

    it('mixed: real ref + ref inside string', () => {
      const r = pg("SELECT '@x' FROM @real_tab")
      expect(r.references).toHaveLength(1)
      expect(r.references[0].name).toBe('real_tab')
    })
  })

  describe('ignores references inside comments', () => {
    it('line comment terminated by \\n', () => {
      expect(pg('SELECT 1 -- @ignored\nFROM x').references).toHaveLength(0)
    })

    it('lone \\r terminates a line comment (bug fix)', () => {
      // Old-Mac line endings: previously consumed the rest of the file.
      const r = pg('SELECT 1 -- @hidden\r@visible FROM x')
      expect(r.references.map((x) => x.name)).toEqual(['visible'])
    })

    it('block comment', () => {
      expect(pg('SELECT /* @ignored */ 1 FROM x').references).toHaveLength(0)
    })

    it('nested block comment (PG only)', () => {
      expect(pg('SELECT /* /* @ignored */ */ 1 FROM x').references).toHaveLength(0)
    })

    it('MySQL block comments do NOT nest', () => {
      // Bug fix: in MySQL the first `*/` closes the outermost comment, so
      // `@exposed` is outside any comment.
      const r = my('SELECT /* outer /* inner */ @exposed */ 1 FROM x')
      expect(r.references.map((x) => x.name)).toEqual(['exposed'])
    })

    it('MSSQL block comments do NOT nest', () => {
      const r = ms('SELECT /* outer /* inner */ @exposed */ 1 FROM x')
      expect(r.references.map((x) => x.name)).toEqual(['exposed'])
    })

    it('real ref after a block comment', () => {
      const r = pg('SELECT /* @x */ * FROM @real')
      expect(r.references).toHaveLength(1)
      expect(r.references[0].name).toBe('real')
    })
  })

  describe('system variables and word boundaries', () => {
    it('@@version (MySQL/MSSQL system var) is NOT captured', () => {
      // Bug fix: previously `@@version` captured `@version` as a ref.
      expect(my('SELECT @@version').references).toHaveLength(0)
      expect(ms('SELECT @@version').references).toHaveLength(0)
      expect(pg('SELECT @@version').references).toHaveLength(0)
    })

    it('@@rowcount and @@identity (MSSQL)', () => {
      expect(ms('SELECT @@rowcount, @@identity').references).toHaveLength(0)
    })

    it('alice@example.com is not a reference', () => {
      expect(pg("SELECT 'alice@example.com'").references).toHaveLength(0)
    })

    it('unquoted alice@example does not produce a ref', () => {
      expect(pg('SELECT alice@example FROM x').references).toHaveLength(0)
    })

    it('@ at start of input is fine', () => {
      const r = pg('@foo')
      expect(r.references).toHaveLength(1)
      expect(r.references[0].name).toBe('foo')
    })
  })

  describe('reference boundaries', () => {
    it('@ followed by invalid char is not consumed', () => {
      expect(pg('SELECT @ FROM x').references).toHaveLength(0)
    })

    it('@ followed by digit is not consumed (must start with letter)', () => {
      expect(pg('SELECT @1foo FROM x').references).toHaveLength(0)
    })

    it('@FOO uppercase is not consumed (must be lowercase)', () => {
      expect(pg('SELECT @FOO FROM x').references).toHaveLength(0)
    })

    it('@fooBar does NOT partial-parse to @foo (bug fix)', () => {
      // Previously: regex `^[a-z][a-z0-9_]*` matched just `foo`, leaving
      // `Bar` floating. Now the negative lookahead rejects the match.
      expect(pg('SELECT * FROM @fooBar').references).toHaveLength(0)
    })

    it('@foo-bar parses as @foo followed by `-bar` (SQL operator)', () => {
      // Hyphen is a SQL token separator (`SELECT @foo - 1`), so it's a
      // valid termination for a ref. Word characters (letters/digits/_)
      // would invalidate the match via the negative lookahead, but the
      // hyphen breaks the identifier cleanly.
      const r = pg('SELECT * FROM @foo-bar')
      expect(r.references).toHaveLength(1)
      expect(r.references[0].name).toBe('foo')
    })

    it('lone @ at end of input', () => {
      expect(pg('SELECT * FROM x WHERE c = @').references).toHaveLength(0)
    })

    it('reference followed by punctuation', () => {
      const r = pg('SELECT * FROM @t WHERE id IN (SELECT id FROM @other);')
      expect(r.references.map((x) => x.name)).toEqual(['t', 'other'])
    })

    it('reference followed by underscore continues the name', () => {
      const r = pg('SELECT * FROM @my_long_name__id')
      expect(r.references).toHaveLength(1)
      expect(r.references[0].name).toBe('my_long_name__id')
    })
  })

  describe('knownNames filter (MySQL/MSSQL @var coexistence)', () => {
    it('without knownNames, every @name token is emitted', () => {
      const r = my('SET @count = 5; SELECT @count, @users FROM x')
      const names = new Set(r.references.map((x) => x.name))
      expect(names.has('count')).toBe(true)
      expect(names.has('users')).toBe(true)
    })

    it('with knownNames, only matching names are emitted', () => {
      const r = parseTabReferences(
        'SET @count = 5; SELECT @count, @users FROM x',
        { dialect: 'mysql', knownNames: new Set(['users']) }
      )
      expect(r.references.map((x) => x.name)).toEqual(['users'])
    })

    it('with empty knownNames set, nothing is emitted', () => {
      const r = parseTabReferences('SELECT @count, @users FROM x', {
        dialect: 'mysql',
        knownNames: new Set()
      })
      expect(r.references).toHaveLength(0)
    })
  })

  it('no references → empty result', () => {
    expect(pg('SELECT * FROM users').references).toHaveLength(0)
  })

  it('empty input → empty result', () => {
    expect(pg('').references).toHaveLength(0)
  })
})
