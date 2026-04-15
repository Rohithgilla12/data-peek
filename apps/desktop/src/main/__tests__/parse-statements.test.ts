import { describe, it, expect } from 'vitest'
import { parseStatementsWithLines } from '../lib/parse-statements'

describe('parseStatementsWithLines', () => {
  it('parses a single-line statement', () => {
    const sql = 'SELECT 1'
    const result = parseStatementsWithLines(sql, 'postgresql')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      index: 0,
      sql: 'SELECT 1',
      startLine: 1,
      endLine: 1,
      isDDL: false
    })
  })

  it('parses multiple single-line statements', () => {
    const sql = 'SELECT 1;\nSELECT 2;\nSELECT 3;'
    const result = parseStatementsWithLines(sql, 'postgresql')
    expect(result).toHaveLength(3)
    expect(result[0].startLine).toBe(1)
    expect(result[0].endLine).toBe(1)
    expect(result[1].startLine).toBe(2)
    expect(result[1].endLine).toBe(2)
    expect(result[2].startLine).toBe(3)
    expect(result[2].endLine).toBe(3)
  })

  it('parses a statement spanning multiple lines', () => {
    const sql = 'SELECT\n  id,\n  name\nFROM users;'
    const result = parseStatementsWithLines(sql, 'postgresql')
    expect(result).toHaveLength(1)
    expect(result[0].startLine).toBe(1)
    expect(result[0].endLine).toBe(4)
  })

  it('detects DDL statements', () => {
    const sql = 'CREATE TABLE t (id int); DROP TABLE t; SELECT 1;'
    const result = parseStatementsWithLines(sql, 'postgresql')
    expect(result).toHaveLength(3)
    expect(result[0].isDDL).toBe(true)
    expect(result[1].isDDL).toBe(true)
    expect(result[2].isDDL).toBe(false)
  })

  it('handles leading whitespace and comments', () => {
    const sql = '\n-- a comment\nSELECT 1;\n\n-- another\nSELECT 2;'
    const result = parseStatementsWithLines(sql, 'postgresql')
    expect(result).toHaveLength(2)
    expect(result[0].sql.trim()).toBe('SELECT 1')
    expect(result[1].sql.trim()).toBe('SELECT 2')
  })

  it('assigns sequential indices', () => {
    const sql = 'SELECT 1; SELECT 2; SELECT 3;'
    const result = parseStatementsWithLines(sql, 'postgresql')
    expect(result[0].index).toBe(0)
    expect(result[1].index).toBe(1)
    expect(result[2].index).toBe(2)
  })

  it('returns empty array for empty SQL', () => {
    expect(parseStatementsWithLines('', 'postgresql')).toEqual([])
    expect(parseStatementsWithLines('   \n\n  ', 'postgresql')).toEqual([])
  })
})
