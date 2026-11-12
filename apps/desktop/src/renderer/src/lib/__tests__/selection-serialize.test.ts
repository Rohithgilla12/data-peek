import { describe, it, expect } from 'vitest'
import {
  serializeSelection,
  escapeTSVValue,
  escapeCSVValue,
  escapeMarkdownValue
} from '../selection-serialize'
import type {
  CellSelection,
  CellPosition,
  CellSnapshot
} from '../../components/cell-grid/cell-grid-types'

describe('escapeTSVValue', () => {
  it('returns empty string for null and undefined', () => {
    expect(escapeTSVValue(null)).toBe('')
    expect(escapeTSVValue(undefined)).toBe('')
  })

  it('returns plain string and numbers unchanged', () => {
    expect(escapeTSVValue('hello')).toBe('hello')
    expect(escapeTSVValue(123)).toBe('123')
    expect(escapeTSVValue(true)).toBe('true')
  })

  it('escapes strings containing tabs with quotes', () => {
    expect(escapeTSVValue('a\tb')).toBe('"a\tb"')
  })

  it('escapes strings containing newlines and quotes', () => {
    expect(escapeTSVValue('line1\nline2')).toBe('"line1\nline2"')
    expect(escapeTSVValue('say "hi"\nsecond line')).toBe('"say ""hi""\nsecond line"')
  })

  it('serializes objects to JSON', () => {
    expect(escapeTSVValue({ a: 1 })).toBe('{"a":1}')
  })
})

describe('escapeCSVValue', () => {
  it('returns empty string for null and undefined', () => {
    expect(escapeCSVValue(null)).toBe('')
    expect(escapeCSVValue(undefined)).toBe('')
  })

  it('returns plain string and numbers unchanged', () => {
    expect(escapeCSVValue('hello')).toBe('hello')
    expect(escapeCSVValue(456)).toBe('456')
  })

  it('escapes strings containing commas, quotes, or newlines with RFC 4180 quotes', () => {
    expect(escapeCSVValue('hello, world')).toBe('"hello, world"')
    expect(escapeCSVValue('say "hello"')).toBe('"say ""hello"""')
    expect(escapeCSVValue('row1\nrow2')).toBe('"row1\nrow2"')
  })
})

describe('escapeMarkdownValue', () => {
  it('returns empty string for null and undefined', () => {
    expect(escapeMarkdownValue(null)).toBe('')
    expect(escapeMarkdownValue(undefined)).toBe('')
  })

  it('escapes pipes and replaces newlines with spaces', () => {
    expect(escapeMarkdownValue('foo | bar')).toBe('foo \\| bar')
    expect(escapeMarkdownValue('line 1\nline 2')).toBe('line 1 line 2')
    expect(escapeMarkdownValue('line 1\r\nline 2')).toBe('line 1 line 2')
  })
})

describe('serializeSelection', () => {
  // Test data grid: 3 rows x 3 columns
  // cols: id, name, details
  const tableData: Array<Record<string, unknown>> = [
    { id: 1, name: 'Alice', details: 'Engineer' },
    { id: 2, name: 'Bob\tBuilder', details: 'Contractor, "Lead"' },
    { id: 3, name: null, details: 'Line 1\nLine 2' }
  ]

  const colNames = ['id', 'name', 'details']

  const getCell = (pos: CellPosition): CellSnapshot => {
    const colName = colNames[pos.col] ?? `col_${pos.col}`
    const row = tableData[pos.row]
    return {
      columnName: colName,
      dataType: typeof row?.[colName],
      value: row?.[colName]
    }
  }

  const selection2x2: CellSelection = {
    primary: {
      anchor: { row: 0, col: 0 },
      active: { row: 1, col: 1 }
    },
    additional: []
  }

  describe('TSV formatting', () => {
    it('serializes data as tab-separated values without headers by default', () => {
      const result = serializeSelection(selection2x2, 'tsv', getCell)
      expect(result).toBe('1\tAlice\n2\t"Bob\tBuilder"')
    })

    it('includes headers when includeHeaders: true', () => {
      const result = serializeSelection(selection2x2, 'tsv', getCell, { includeHeaders: true })
      expect(result).toBe('id\tname\n1\tAlice\n2\t"Bob\tBuilder"')
    })

    it('handles null/undefined and multiline escaping in TSV', () => {
      const sel: CellSelection = {
        primary: { anchor: { row: 1, col: 1 }, active: { row: 2, col: 2 } },
        additional: []
      }
      const result = serializeSelection(sel, 'tsv', getCell)
      expect(result).toBe('"Bob\tBuilder"\tContractor, "Lead"\n\t"Line 1\nLine 2"')
    })
  })

  describe('CSV formatting', () => {
    it('serializes data as comma-separated values without headers by default', () => {
      const result = serializeSelection(selection2x2, 'csv', getCell)
      expect(result).toBe('1,Alice\n2,Bob\tBuilder')
    })

    it('includes headers when includeHeaders: true', () => {
      const result = serializeSelection(selection2x2, 'csv', getCell, { includeHeaders: true })
      expect(result).toBe('id,name\n1,Alice\n2,Bob\tBuilder')
    })

    it('escapes commas, quotes, and newlines RFC 4180 style', () => {
      const sel: CellSelection = {
        primary: { anchor: { row: 1, col: 1 }, active: { row: 2, col: 2 } },
        additional: []
      }
      const result = serializeSelection(sel, 'csv', getCell)
      expect(result).toBe('Bob\tBuilder,"Contractor, ""Lead"""\n,"Line 1\nLine 2"')
    })
  })

  describe('JSON formatting', () => {
    it('serializes as array of arrays when includeHeaders is omitted or false', () => {
      const result = serializeSelection(selection2x2, 'json', getCell)
      expect(JSON.parse(result)).toEqual([
        [1, 'Alice'],
        [2, 'Bob\tBuilder']
      ])
    })

    it('serializes as array of objects keyed by columnName when includeHeaders: true', () => {
      const result = serializeSelection(selection2x2, 'json', getCell, { includeHeaders: true })
      expect(JSON.parse(result)).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob\tBuilder' }
      ])
    })

    it('converts null and undefined properly in JSON', () => {
      const sel: CellSelection = {
        primary: { anchor: { row: 2, col: 0 }, active: { row: 2, col: 2 } },
        additional: []
      }
      const result = serializeSelection(sel, 'json', getCell, { includeHeaders: true })
      expect(JSON.parse(result)).toEqual([{ id: 3, name: null, details: 'Line 1\nLine 2' }])
    })
  })

  describe('Markdown formatting', () => {
    it('renders a Markdown table with headers and separators', () => {
      const result = serializeSelection(selection2x2, 'markdown', getCell)
      expect(result).toBe('| id | name |\n| --- | --- |\n| 1 | Alice |\n| 2 | Bob\tBuilder |')
    })

    it('escapes pipes and replaces newlines in markdown table cells', () => {
      const sel: CellSelection = {
        primary: { anchor: { row: 2, col: 1 }, active: { row: 2, col: 2 } },
        additional: []
      }
      const result = serializeSelection(sel, 'markdown', getCell)
      expect(result).toBe('| name | details |\n| --- | --- |\n|  | Line 1 Line 2 |')
    })
  })

  describe('Sparse selection behavior', () => {
    it('serializes only the primary range when additional sparse ranges are present', () => {
      const sparseSelection: CellSelection = {
        primary: { anchor: { row: 0, col: 0 }, active: { row: 0, col: 1 } },
        additional: [
          { anchor: { row: 2, col: 2 }, active: { row: 2, col: 2 } },
          { anchor: { row: 1, col: 0 }, active: { row: 1, col: 2 } }
        ]
      }

      const tsv = serializeSelection(sparseSelection, 'tsv', getCell)
      expect(tsv).toBe('1\tAlice')

      const csv = serializeSelection(sparseSelection, 'csv', getCell)
      expect(csv).toBe('1,Alice')

      const json = serializeSelection(sparseSelection, 'json', getCell)
      expect(JSON.parse(json)).toEqual([[1, 'Alice']])

      const md = serializeSelection(sparseSelection, 'markdown', getCell)
      expect(md).toBe('| id | name |\n| --- | --- |\n| 1 | Alice |')
    })

    it('normalizes inverted primary ranges (active < anchor)', () => {
      const invertedSelection: CellSelection = {
        primary: { anchor: { row: 1, col: 1 }, active: { row: 0, col: 0 } },
        additional: []
      }
      const result = serializeSelection(invertedSelection, 'tsv', getCell)
      expect(result).toBe('1\tAlice\n2\t"Bob\tBuilder"')
    })
  })
})
