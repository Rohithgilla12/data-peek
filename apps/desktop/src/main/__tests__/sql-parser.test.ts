import { describe, it, expect } from 'vitest'
import { splitStatements, createStatementSplitter, SQL_PARSER_CONFIGS } from '../lib/sql-parser'

describe('splitStatements', () => {
  describe('basic functionality', () => {
    it('should return empty array for empty string', () => {
      expect(splitStatements('', 'postgresql')).toEqual([])
    })

    it('should return empty array for whitespace only', () => {
      expect(splitStatements('   \n\t  ', 'postgresql')).toEqual([])
    })

    it('should handle single statement without semicolon', () => {
      expect(splitStatements('SELECT * FROM users', 'postgresql')).toEqual(['SELECT * FROM users'])
    })

    it('should handle single statement with semicolon', () => {
      expect(splitStatements('SELECT * FROM users;', 'postgresql')).toEqual(['SELECT * FROM users'])
    })

    it('should split multiple statements', () => {
      const sql = 'SELECT 1; SELECT 2; SELECT 3'
      expect(splitStatements(sql, 'postgresql')).toEqual(['SELECT 1', 'SELECT 2', 'SELECT 3'])
    })

    it('should handle multiple statements with trailing semicolon', () => {
      const sql = 'SELECT 1; SELECT 2;'
      expect(splitStatements(sql, 'postgresql')).toEqual(['SELECT 1', 'SELECT 2'])
    })

    it('should trim whitespace from statements', () => {
      const sql = '  SELECT 1  ;  SELECT 2  '
      expect(splitStatements(sql, 'postgresql')).toEqual(['SELECT 1', 'SELECT 2'])
    })

    it('should skip empty statements', () => {
      const sql = 'SELECT 1;;; SELECT 2'
      expect(splitStatements(sql, 'postgresql')).toEqual(['SELECT 1', 'SELECT 2'])
    })

    it('should preserve newlines within statements', () => {
      const sql = `SELECT
        id,
        name
      FROM users`
      const result = splitStatements(sql, 'postgresql')
      expect(result).toHaveLength(1)
      expect(result[0]).toContain('\n')
    })
  })

  describe('single-quoted strings', () => {
    it('should not split on semicolons inside single-quoted strings', () => {
      const sql = "SELECT 'hello; world' FROM t"
      expect(splitStatements(sql, 'postgresql')).toEqual(["SELECT 'hello; world' FROM t"])
    })

    it('should handle escaped single quotes (doubled)', () => {
      const sql = "SELECT 'it''s a test; really' FROM t"
      expect(splitStatements(sql, 'postgresql')).toEqual(["SELECT 'it''s a test; really' FROM t"])
    })

    it('should handle multiple strings in one statement', () => {
      const sql = "SELECT 'a;b', 'c;d' FROM t"
      expect(splitStatements(sql, 'postgresql')).toEqual(["SELECT 'a;b', 'c;d' FROM t"])
    })

    it('should handle empty string', () => {
      const sql = "SELECT '' FROM t; SELECT 1"
      expect(splitStatements(sql, 'postgresql')).toEqual(["SELECT '' FROM t", 'SELECT 1'])
    })

    it('should handle string at end of statement', () => {
      const sql = "INSERT INTO t VALUES ('test;')"
      expect(splitStatements(sql, 'postgresql')).toEqual(["INSERT INTO t VALUES ('test;')"])
    })
  })

  describe('double-quoted identifiers', () => {
    it('should not split on semicolons inside double-quoted identifiers', () => {
      const sql = 'SELECT "column;name" FROM t'
      expect(splitStatements(sql, 'postgresql')).toEqual(['SELECT "column;name" FROM t'])
    })

    it('should handle escaped double quotes (doubled)', () => {
      const sql = 'SELECT "col""name;test" FROM t'
      expect(splitStatements(sql, 'postgresql')).toEqual(['SELECT "col""name;test" FROM t'])
    })

    it('should handle mixed quotes', () => {
      const sql = `SELECT "col;1", 'val;1' FROM t`
      expect(splitStatements(sql, 'postgresql')).toEqual([`SELECT "col;1", 'val;1' FROM t`])
    })
  })

  describe('line comments (--)', () => {
    it('should ignore semicolons in line comments', () => {
      const sql = 'SELECT 1 -- this is a comment; with semicolon\nFROM t'
      expect(splitStatements(sql, 'postgresql')).toEqual([
        'SELECT 1 -- this is a comment; with semicolon\nFROM t'
      ])
    })

    it('should handle comment at end of statement', () => {
      const sql = 'SELECT 1; -- comment\nSELECT 2'
      expect(splitStatements(sql, 'postgresql')).toEqual(['SELECT 1', '-- comment\nSELECT 2'])
    })

    it('should handle multiple line comments', () => {
      const sql = `SELECT 1 -- first; comment
      -- second; comment
      FROM t`
      const result = splitStatements(sql, 'postgresql')
      expect(result).toHaveLength(1)
      expect(result[0]).toContain('-- first; comment')
      expect(result[0]).toContain('-- second; comment')
    })

    it('should handle comment-only input', () => {
      const sql = '-- just a comment'
      expect(splitStatements(sql, 'postgresql')).toEqual(['-- just a comment'])
    })
  })

  describe('block comments (/* */)', () => {
    it('should ignore semicolons in block comments', () => {
      const sql = 'SELECT /* comment; here */ 1 FROM t'
      expect(splitStatements(sql, 'postgresql')).toEqual(['SELECT /* comment; here */ 1 FROM t'])
    })

    it('should handle multi-line block comments', () => {
      const sql = `SELECT /*
        this is a;
        multi-line comment;
      */ 1 FROM t`
      expect(splitStatements(sql, 'postgresql')).toHaveLength(1)
    })

    it('should handle block comment at end', () => {
      const sql = 'SELECT 1 /* comment */'
      expect(splitStatements(sql, 'postgresql')).toEqual(['SELECT 1 /* comment */'])
    })

    it('should handle unclosed block comment', () => {
      const sql = 'SELECT 1 /* unclosed comment'
      expect(splitStatements(sql, 'postgresql')).toEqual(['SELECT 1 /* unclosed comment'])
    })
  })
})

describe('PostgreSQL-specific features', () => {
  describe('dollar-quoted strings', () => {
    it('should handle simple $$ dollar quotes', () => {
      const sql = 'SELECT $$ hello; world $$'
      expect(splitStatements(sql, 'postgresql')).toEqual(['SELECT $$ hello; world $$'])
    })

    it('should handle tagged dollar quotes', () => {
      const sql = 'SELECT $tag$ hello; world $tag$'
      expect(splitStatements(sql, 'postgresql')).toEqual(['SELECT $tag$ hello; world $tag$'])
    })

    it('should handle dollar quotes with numbers and underscores', () => {
      const sql = 'SELECT $my_tag_123$ content; here $my_tag_123$'
      expect(splitStatements(sql, 'postgresql')).toEqual([
        'SELECT $my_tag_123$ content; here $my_tag_123$'
      ])
    })

    it('should handle function body with dollar quotes', () => {
      const sql = `CREATE FUNCTION test() RETURNS void AS $$
        BEGIN
          INSERT INTO t VALUES (1);
          INSERT INTO t VALUES (2);
        END;
      $$ LANGUAGE plpgsql`
      expect(splitStatements(sql, 'postgresql')).toHaveLength(1)
    })

    it('should handle nested dollar quotes with different tags', () => {
      const sql = 'SELECT $outer$ some $inner$ nested; $inner$ text; $outer$'
      expect(splitStatements(sql, 'postgresql')).toEqual([
        'SELECT $outer$ some $inner$ nested; $inner$ text; $outer$'
      ])
    })

    it('should handle unclosed dollar quotes', () => {
      const sql = 'SELECT $$ unclosed'
      expect(splitStatements(sql, 'postgresql')).toEqual(['SELECT $$ unclosed'])
    })

    it('should not treat single $ as dollar quote', () => {
      const sql = 'SELECT $1, $2; SELECT $3'
      expect(splitStatements(sql, 'postgresql')).toEqual(['SELECT $1, $2', 'SELECT $3'])
    })
  })

  describe('nested block comments', () => {
    it('should handle nested block comments', () => {
      const sql = 'SELECT /* outer /* inner; */ comment; */ 1'
      expect(splitStatements(sql, 'postgresql')).toEqual([
        'SELECT /* outer /* inner; */ comment; */ 1'
      ])
    })

    it('should handle deeply nested comments', () => {
      const sql = 'SELECT /* a /* b /* c; */ d */ e; */ 1'
      expect(splitStatements(sql, 'postgresql')).toEqual(['SELECT /* a /* b /* c; */ d */ e; */ 1'])
    })
  })

  it('should NOT support MySQL-specific features', () => {
    // Backticks should not be treated as identifiers
    const sql = 'SELECT `col;name` FROM t; SELECT 1'
    // Without backtick support, this splits on the semicolon inside backticks
    const result = splitStatements(sql, 'postgresql')
    expect(result.length).toBeGreaterThan(1)
  })
})

describe('MySQL-specific features', () => {
  describe('backtick-quoted identifiers', () => {
    it('should not split on semicolons inside backtick identifiers', () => {
      const sql = 'SELECT `column;name` FROM t'
      expect(splitStatements(sql, 'mysql')).toEqual(['SELECT `column;name` FROM t'])
    })

    it('should handle escaped backticks (doubled)', () => {
      const sql = 'SELECT `col``name;test` FROM t'
      expect(splitStatements(sql, 'mysql')).toEqual(['SELECT `col``name;test` FROM t'])
    })

    it('should handle table and column backticks', () => {
      const sql = 'SELECT `t`.`col;1` FROM `schema;db`.`table;name`'
      expect(splitStatements(sql, 'mysql')).toEqual([
        'SELECT `t`.`col;1` FROM `schema;db`.`table;name`'
      ])
    })
  })

  describe('backslash escapes', () => {
    it('should handle backslash-escaped single quotes', () => {
      const sql = "SELECT 'it\\'s a test; really' FROM t"
      expect(splitStatements(sql, 'mysql')).toEqual(["SELECT 'it\\'s a test; really' FROM t"])
    })

    it('should handle mixed escape styles', () => {
      const sql = "SELECT 'test\\'; more', 'another''quote' FROM t"
      expect(splitStatements(sql, 'mysql')).toEqual([
        "SELECT 'test\\'; more', 'another''quote' FROM t"
      ])
    })
  })

  describe('hash line comments', () => {
    it('should handle # as line comment', () => {
      const sql = 'SELECT 1 # comment; with semicolon\nFROM t'
      expect(splitStatements(sql, 'mysql')).toEqual(['SELECT 1 # comment; with semicolon\nFROM t'])
    })

    it('should handle # at start of line', () => {
      const sql = `# This is a comment;
SELECT 1`
      expect(splitStatements(sql, 'mysql')).toEqual(['# This is a comment;\nSELECT 1'])
    })

    it('should handle both # and -- comments', () => {
      const sql = `SELECT 1 # first comment;
      -- second comment;
      FROM t`
      const result = splitStatements(sql, 'mysql')
      expect(result).toHaveLength(1)
      expect(result[0]).toContain('# first comment;')
      expect(result[0]).toContain('-- second comment;')
    })
  })

  it('should NOT support PostgreSQL dollar quotes', () => {
    const sql = 'SELECT $$ hello; world $$'
    const result = splitStatements(sql, 'mysql')
    // Without dollar quote support, this should split on the semicolon
    expect(result.length).toBeGreaterThan(1)
  })

  it('should NOT have nested block comments', () => {
    // With nested comments: /* a /* b; */ c; */ would be one comment
    // Without nested: /* a /* b; */ closes on first */, then c; is outside and splits
    const sql = 'SELECT /* a /* b; */ c; */ 1'
    const result = splitStatements(sql, 'mysql')
    // MySQL closes on first */, so ` c; */ 1` is outside the comment
    // The semicolon after `c` should split the statement
    expect(result.length).toBe(2)
    expect(result[0]).toBe('SELECT /* a /* b; */ c')
    expect(result[1]).toBe('*/ 1')
  })
})

describe('MSSQL-specific features', () => {
  describe('bracket-quoted identifiers', () => {
    it('should not split on semicolons inside bracket identifiers', () => {
      const sql = 'SELECT [column;name] FROM t'
      expect(splitStatements(sql, 'mssql')).toEqual(['SELECT [column;name] FROM t'])
    })

    it('should handle escaped brackets (doubled)', () => {
      const sql = 'SELECT [col]]name;test] FROM t'
      expect(splitStatements(sql, 'mssql')).toEqual(['SELECT [col]]name;test] FROM t'])
    })

    it('should handle schema.table.column with brackets', () => {
      const sql = 'SELECT [dbo].[table;name].[col;1] FROM [db;name]'
      expect(splitStatements(sql, 'mssql')).toEqual([
        'SELECT [dbo].[table;name].[col;1] FROM [db;name]'
      ])
    })

    it('should handle empty brackets', () => {
      const sql = 'SELECT [] FROM t; SELECT 1'
      expect(splitStatements(sql, 'mssql')).toEqual(['SELECT [] FROM t', 'SELECT 1'])
    })
  })

  it('should NOT support MySQL backticks', () => {
    const sql = 'SELECT `col;name` FROM t; SELECT 1'
    const result = splitStatements(sql, 'mssql')
    // Without backtick support, splits incorrectly
    expect(result.length).toBeGreaterThan(1)
  })

  it('should NOT support hash comments', () => {
    const sql = 'SELECT 1 # not a comment; SELECT 2'
    const result = splitStatements(sql, 'mssql')
    // # is not a comment, so both semicolons create splits
    expect(result).toHaveLength(2)
  })

  it('should NOT have nested block comments', () => {
    // With nested comments: /* a /* b; */ c; */ would be one comment
    // Without nested: /* a /* b; */ closes on first */, then c; is outside and splits
    const sql = 'SELECT /* a /* b; */ c; */ 1'
    const result = splitStatements(sql, 'mssql')
    // MSSQL closes on first */, so ` c; */ 1` is outside the comment
    // The semicolon after `c` should split the statement
    expect(result.length).toBe(2)
    expect(result[0]).toBe('SELECT /* a /* b; */ c')
    expect(result[1]).toBe('*/ 1')
  })
})

describe('SQLite features', () => {
  it('should support both backticks and brackets', () => {
    const sql1 = 'SELECT `col;1` FROM t'
    expect(splitStatements(sql1, 'sqlite')).toEqual(['SELECT `col;1` FROM t'])

    const sql2 = 'SELECT [col;2] FROM t'
    expect(splitStatements(sql2, 'sqlite')).toEqual(['SELECT [col;2] FROM t'])
  })

  it('should NOT support dollar quotes', () => {
    const sql = 'SELECT $$ test; $$ FROM t'
    const result = splitStatements(sql, 'sqlite')
    expect(result.length).toBeGreaterThan(1)
  })
})

describe('edge cases', () => {
  it('should handle very long statements', () => {
    const columns = Array.from({ length: 100 }, (_, i) => `col${i}`).join(', ')
    const sql = `SELECT ${columns} FROM very_long_table_name; SELECT 1`
    const result = splitStatements(sql, 'postgresql')
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('col99')
  })

  it('should handle many statements', () => {
    const sql = Array.from({ length: 50 }, (_, i) => `SELECT ${i}`).join('; ')
    const result = splitStatements(sql, 'postgresql')
    expect(result).toHaveLength(50)
    expect(result[49]).toBe('SELECT 49')
  })

  it('should handle mixed quoting styles in one query', () => {
    const sql = `SELECT "id", 'value', /* comment */ 1 -- end
    FROM t`
    expect(splitStatements(sql, 'postgresql')).toHaveLength(1)
  })

  it('should handle statement starting with whitespace and newlines', () => {
    const sql = `

      SELECT 1;

      SELECT 2

    `
    expect(splitStatements(sql, 'postgresql')).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('should handle unicode in strings', () => {
    const sql = "SELECT 'héllo; wörld 日本語' FROM t"
    expect(splitStatements(sql, 'postgresql')).toEqual(["SELECT 'héllo; wörld 日本語' FROM t"])
  })

  it('should handle unicode in identifiers', () => {
    const sql = 'SELECT "tëst;col" FROM "tàble;name"'
    expect(splitStatements(sql, 'postgresql')).toEqual(['SELECT "tëst;col" FROM "tàble;name"'])
  })
})

describe('real-world SQL examples', () => {
  it('should handle INSERT with multiple values', () => {
    const sql = `
      INSERT INTO users (name, email) VALUES
        ('John; Doe', 'john@example.com'),
        ('Jane; Smith', 'jane@example.com');
      SELECT * FROM users
    `
    const result = splitStatements(sql, 'postgresql')
    expect(result).toHaveLength(2)
    expect(result[0]).toContain("'John; Doe'")
  })

  it('should handle CREATE TABLE with constraints', () => {
    const sql = `
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX idx_orders_user ON orders(user_id)
    `
    const result = splitStatements(sql, 'postgresql')
    expect(result).toHaveLength(2)
  })

  it('should handle PostgreSQL function with complex body', () => {
    const sql = `
      CREATE OR REPLACE FUNCTION calculate_total(order_id INTEGER)
      RETURNS NUMERIC AS $$
      DECLARE
        total NUMERIC := 0;
      BEGIN
        SELECT SUM(price * quantity) INTO total
        FROM order_items
        WHERE order_id = $1;

        RETURN COALESCE(total, 0);
      END;
      $$ LANGUAGE plpgsql;

      SELECT calculate_total(1)
    `
    const result = splitStatements(sql, 'postgresql')
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('LANGUAGE plpgsql')
  })

  it('should handle MySQL stored procedure', () => {
    const sql = `
      CREATE PROCEDURE get_user(IN user_id INT)
      BEGIN
        SELECT * FROM users WHERE id = user_id;
        SELECT * FROM orders WHERE user_id = user_id;
      END;
      CALL get_user(1)
    `
    // Note: This splits on semicolons - MySQL DELIMITER is not handled
    // In practice, MySQL procedures use DELIMITER which this parser doesn't support
    const result = splitStatements(sql, 'mysql')
    expect(result.length).toBeGreaterThan(1)
  })

  it('should handle MSSQL with brackets and temp tables', () => {
    const sql = `
      SELECT * INTO #temp FROM [dbo].[users;table];
      SELECT * FROM #temp WHERE [status;col] = 'active'
    `
    const result = splitStatements(sql, 'mssql')
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('[users;table]')
    expect(result[1]).toContain('[status;col]')
  })
})

describe('createStatementSplitter', () => {
  it('should create a bound function for PostgreSQL', () => {
    const splitter = createStatementSplitter('postgresql')
    const result = splitter('SELECT 1; SELECT 2')
    expect(result).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('should create a bound function for MySQL', () => {
    const splitter = createStatementSplitter('mysql')
    const result = splitter('SELECT `col;1`')
    expect(result).toEqual(['SELECT `col;1`'])
  })

  it('should create a bound function for MSSQL', () => {
    const splitter = createStatementSplitter('mssql')
    const result = splitter('SELECT [col;1]')
    expect(result).toEqual(['SELECT [col;1]'])
  })
})

describe('SQL_PARSER_CONFIGS', () => {
  it('should have config for all database types', () => {
    expect(SQL_PARSER_CONFIGS.postgresql).toBeDefined()
    expect(SQL_PARSER_CONFIGS.mysql).toBeDefined()
    expect(SQL_PARSER_CONFIGS.mssql).toBeDefined()
    expect(SQL_PARSER_CONFIGS.sqlite).toBeDefined()
  })

  it('should have correct PostgreSQL config', () => {
    const config = SQL_PARSER_CONFIGS.postgresql
    expect(config.dollarQuotes).toBe(true)
    expect(config.nestedBlockComments).toBe(true)
    expect(config.backtickIdentifiers).toBe(false)
    expect(config.backslashEscape).toBe(false)
    expect(config.hashLineComment).toBe(false)
    expect(config.bracketIdentifiers).toBe(false)
  })

  it('should have correct MySQL config', () => {
    const config = SQL_PARSER_CONFIGS.mysql
    expect(config.dollarQuotes).toBe(false)
    expect(config.nestedBlockComments).toBe(false)
    expect(config.backtickIdentifiers).toBe(true)
    expect(config.backslashEscape).toBe(true)
    expect(config.hashLineComment).toBe(true)
    expect(config.bracketIdentifiers).toBe(false)
  })

  it('should have correct MSSQL config', () => {
    const config = SQL_PARSER_CONFIGS.mssql
    expect(config.dollarQuotes).toBe(false)
    expect(config.nestedBlockComments).toBe(false)
    expect(config.backtickIdentifiers).toBe(false)
    expect(config.backslashEscape).toBe(false)
    expect(config.hashLineComment).toBe(false)
    expect(config.bracketIdentifiers).toBe(true)
  })

  it('should have correct SQLite config', () => {
    const config = SQL_PARSER_CONFIGS.sqlite
    expect(config.dollarQuotes).toBe(false)
    expect(config.nestedBlockComments).toBe(false)
    expect(config.backtickIdentifiers).toBe(true)
    expect(config.backslashEscape).toBe(false)
    expect(config.hashLineComment).toBe(false)
    expect(config.bracketIdentifiers).toBe(true)
  })
})
