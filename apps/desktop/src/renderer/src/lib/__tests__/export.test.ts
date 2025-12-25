import { describe, it, expect } from 'vitest'
import {
  escapeCSVValue,
  escapeSQLValue,
  escapeSQLIdentifier,
  isSQLKeyword,
  exportToCSV,
  exportToJSON,
  exportToSQL,
  generateExportFilename,
  type ExportData
} from '../export'

describe('escapeCSVValue', () => {
  it('should return empty string for null', () => {
    expect(escapeCSVValue(null)).toBe('')
  })

  it('should return empty string for undefined', () => {
    expect(escapeCSVValue(undefined)).toBe('')
  })

  it('should return simple string as-is', () => {
    expect(escapeCSVValue('hello')).toBe('hello')
  })

  it('should wrap string with comma in quotes', () => {
    expect(escapeCSVValue('hello, world')).toBe('"hello, world"')
  })

  it('should wrap string with newline in quotes', () => {
    expect(escapeCSVValue('hello\nworld')).toBe('"hello\nworld"')
  })

  it('should escape double quotes and wrap in quotes', () => {
    expect(escapeCSVValue('say "hello"')).toBe('"say ""hello"""')
  })

  it('should convert numbers to string', () => {
    expect(escapeCSVValue(123)).toBe('123')
    expect(escapeCSVValue(12.34)).toBe('12.34')
  })

  it('should serialize objects to JSON', () => {
    expect(escapeCSVValue({ a: 1 })).toBe('"{""a"":1}"')
  })

  it('should serialize arrays to JSON', () => {
    expect(escapeCSVValue([1, 2, 3])).toBe('"[1,2,3]"')
  })
})

describe('escapeSQLValue', () => {
  describe('NULL handling', () => {
    it('should return NULL for null value', () => {
      expect(escapeSQLValue(null, 'varchar')).toBe('NULL')
    })

    it('should return NULL for undefined value', () => {
      expect(escapeSQLValue(undefined, 'text')).toBe('NULL')
    })
  })

  describe('Boolean types', () => {
    it('should return TRUE/FALSE for PostgreSQL', () => {
      expect(escapeSQLValue(true, 'boolean', 'postgresql')).toBe('TRUE')
      expect(escapeSQLValue(false, 'boolean', 'postgresql')).toBe('FALSE')
    })

    it('should return 1/0 for MySQL', () => {
      expect(escapeSQLValue(true, 'boolean', 'mysql')).toBe('1')
      expect(escapeSQLValue(false, 'boolean', 'mysql')).toBe('0')
    })

    it('should return 1/0 for MSSQL bit type', () => {
      expect(escapeSQLValue(true, 'bit', 'mssql')).toBe('1')
      expect(escapeSQLValue(false, 'bit', 'mssql')).toBe('0')
    })
  })

  describe('Numeric types', () => {
    it('should return unquoted integers', () => {
      expect(escapeSQLValue(42, 'integer')).toBe('42')
      expect(escapeSQLValue(42, 'int4')).toBe('42')
      expect(escapeSQLValue(42, 'bigint')).toBe('42')
    })

    it('should return unquoted decimals', () => {
      expect(escapeSQLValue(3.14, 'decimal')).toBe('3.14')
      expect(escapeSQLValue(3.14, 'numeric')).toBe('3.14')
      expect(escapeSQLValue(3.14, 'float')).toBe('3.14')
      expect(escapeSQLValue(3.14, 'double precision')).toBe('3.14')
      expect(escapeSQLValue(3.14, 'real')).toBe('3.14')
    })

    it('should handle money type', () => {
      expect(escapeSQLValue(99.99, 'money')).toBe('99.99')
    })

    it('should handle serial types', () => {
      expect(escapeSQLValue(1, 'serial')).toBe('1')
      expect(escapeSQLValue(1, 'bigserial')).toBe('1')
    })

    it('should handle BigInt', () => {
      expect(escapeSQLValue(BigInt('9007199254740993'), 'bigint')).toBe('9007199254740993')
    })
  })

  describe('Special numeric values', () => {
    it('should handle NaN in PostgreSQL', () => {
      expect(escapeSQLValue(NaN, 'float', 'postgresql')).toBe("'NaN'::float")
    })

    it('should return NULL for NaN in other dialects', () => {
      expect(escapeSQLValue(NaN, 'float', 'mysql')).toBe('NULL')
      expect(escapeSQLValue(NaN, 'float', 'mssql')).toBe('NULL')
    })

    it('should handle Infinity in PostgreSQL', () => {
      expect(escapeSQLValue(Infinity, 'float', 'postgresql')).toBe("'Infinity'::float")
      expect(escapeSQLValue(-Infinity, 'float', 'postgresql')).toBe("'-Infinity'::float")
    })

    it('should return NULL for Infinity in other dialects', () => {
      expect(escapeSQLValue(Infinity, 'float', 'mysql')).toBe('NULL')
      expect(escapeSQLValue(-Infinity, 'float', 'mssql')).toBe('NULL')
    })
  })

  describe('String types', () => {
    it('should quote strings', () => {
      expect(escapeSQLValue('hello', 'varchar')).toBe("'hello'")
      expect(escapeSQLValue('hello', 'text')).toBe("'hello'")
      expect(escapeSQLValue('hello', 'char(10)')).toBe("'hello'")
    })

    it('should escape single quotes', () => {
      expect(escapeSQLValue("it's", 'varchar')).toBe("'it''s'")
      expect(escapeSQLValue("O'Brien", 'varchar')).toBe("'O''Brien'")
    })

    it('should handle empty strings', () => {
      expect(escapeSQLValue('', 'varchar')).toBe("''")
    })
  })

  describe('UUID types', () => {
    it('should quote UUIDs', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000'
      expect(escapeSQLValue(uuid, 'uuid')).toBe(`'${uuid}'`)
    })

    it('should handle MSSQL uniqueidentifier', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000'
      expect(escapeSQLValue(uuid, 'uniqueidentifier')).toBe(`'${uuid}'`)
    })
  })

  describe('Date/Time types', () => {
    it('should format Date objects for timestamp', () => {
      const date = new Date('2024-01-15T10:30:00.000Z')
      expect(escapeSQLValue(date, 'timestamp')).toBe("'2024-01-15T10:30:00.000Z'")
    })

    it('should extract date portion for date type', () => {
      const date = new Date('2024-01-15T10:30:00.000Z')
      expect(escapeSQLValue(date, 'date')).toBe("'2024-01-15'")
    })

    it('should extract time portion for time type', () => {
      const date = new Date('2024-01-15T10:30:00.000Z')
      expect(escapeSQLValue(date, 'time')).toBe("'10:30:00.000'")
    })

    it('should handle string dates', () => {
      expect(escapeSQLValue('2024-01-15', 'date')).toBe("'2024-01-15'")
      expect(escapeSQLValue('2024-01-15 10:30:00', 'timestamp')).toBe("'2024-01-15 10:30:00'")
    })
  })

  describe('Binary types', () => {
    it('should format Uint8Array for PostgreSQL bytea', () => {
      const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f])
      expect(escapeSQLValue(bytes, 'bytea', 'postgresql')).toBe("'\\x48656c6c6f'")
    })

    it('should format Uint8Array for MySQL binary', () => {
      const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f])
      expect(escapeSQLValue(bytes, 'binary', 'mysql')).toBe("X'48656c6c6f'")
    })

    it('should format Uint8Array for MSSQL varbinary', () => {
      const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f])
      expect(escapeSQLValue(bytes, 'varbinary', 'mssql')).toBe('0x48656c6c6f')
    })
  })

  describe('JSON types', () => {
    it('should serialize objects to JSON string', () => {
      expect(escapeSQLValue({ a: 1, b: 'test' }, 'json')).toBe('\'{"a":1,"b":"test"}\'')
    })

    it('should escape quotes in JSON', () => {
      expect(escapeSQLValue({ name: "O'Brien" }, 'json')).toBe('\'{"name":"O\'\'Brien"}\'')
    })

    it('should add ::jsonb cast for PostgreSQL jsonb', () => {
      expect(escapeSQLValue({ a: 1 }, 'jsonb', 'postgresql')).toBe('\'{"a":1}\'::jsonb')
    })

    it('should pass through string JSON values', () => {
      expect(escapeSQLValue('{"a":1}', 'json')).toBe('\'{"a":1}\'')
    })
  })

  describe('Array types', () => {
    it('should format arrays for PostgreSQL', () => {
      expect(escapeSQLValue([1, 2, 3], 'integer[]', 'postgresql')).toBe("'{1,2,3}'")
      expect(escapeSQLValue(['a', 'b'], 'text[]', 'postgresql')).toBe('\'{"a","b"}\'')
    })

    it('should format PostgreSQL internal array type notation', () => {
      expect(escapeSQLValue([1, 2, 3], '_int4', 'postgresql')).toBe("'{1,2,3}'")
    })

    it('should format arrays as JSON for other dialects', () => {
      expect(escapeSQLValue([1, 2, 3], 'array', 'mysql')).toBe("'[1,2,3]'")
    })
  })

  describe('Object types', () => {
    it('should serialize objects to JSON', () => {
      expect(escapeSQLValue({ key: 'value' }, 'hstore')).toBe('\'{"key":"value"}\'')
    })
  })
})

describe('escapeSQLIdentifier', () => {
  it('should return simple identifiers as-is', () => {
    expect(escapeSQLIdentifier('users')).toBe('users')
    expect(escapeSQLIdentifier('user_name')).toBe('user_name')
    expect(escapeSQLIdentifier('column1')).toBe('column1')
  })

  it('should quote identifiers with special characters', () => {
    expect(escapeSQLIdentifier('my column')).toBe('"my column"')
    expect(escapeSQLIdentifier('user-name')).toBe('"user-name"')
    expect(escapeSQLIdentifier('123column')).toBe('"123column"')
  })

  it('should quote SQL keywords', () => {
    expect(escapeSQLIdentifier('select')).toBe('"select"')
    expect(escapeSQLIdentifier('table')).toBe('"table"')
    expect(escapeSQLIdentifier('user')).toBe('"user"')
    expect(escapeSQLIdentifier('order')).toBe('"order"')
  })

  it('should escape double quotes in identifiers', () => {
    expect(escapeSQLIdentifier('my"column')).toBe('"my""column"')
  })

  describe('MySQL dialect', () => {
    it('should use backticks', () => {
      expect(escapeSQLIdentifier('select', 'mysql')).toBe('`select`')
      expect(escapeSQLIdentifier('my column', 'mysql')).toBe('`my column`')
    })

    it('should escape backticks', () => {
      expect(escapeSQLIdentifier('my`column', 'mysql')).toBe('`my``column`')
    })
  })

  describe('MSSQL dialect', () => {
    it('should use square brackets', () => {
      expect(escapeSQLIdentifier('select', 'mssql')).toBe('[select]')
      expect(escapeSQLIdentifier('my column', 'mssql')).toBe('[my column]')
    })

    it('should escape closing brackets', () => {
      expect(escapeSQLIdentifier('my]column', 'mssql')).toBe('[my]]column]')
    })
  })
})

describe('isSQLKeyword', () => {
  it('should return true for common SQL keywords', () => {
    expect(isSQLKeyword('select')).toBe(true)
    expect(isSQLKeyword('SELECT')).toBe(true)
    expect(isSQLKeyword('from')).toBe(true)
    expect(isSQLKeyword('where')).toBe(true)
    expect(isSQLKeyword('insert')).toBe(true)
    expect(isSQLKeyword('update')).toBe(true)
    expect(isSQLKeyword('delete')).toBe(true)
    expect(isSQLKeyword('table')).toBe(true)
    expect(isSQLKeyword('user')).toBe(true)
    expect(isSQLKeyword('order')).toBe(true)
  })

  it('should return false for non-keywords', () => {
    expect(isSQLKeyword('users')).toBe(false)
    expect(isSQLKeyword('name')).toBe(false)
    expect(isSQLKeyword('email')).toBe(false)
    expect(isSQLKeyword('foobar')).toBe(false)
  })
})

describe('exportToCSV', () => {
  it('should export simple data', () => {
    const data: ExportData = {
      columns: [
        { name: 'id', dataType: 'integer' },
        { name: 'name', dataType: 'varchar' }
      ],
      rows: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
      ]
    }

    const csv = exportToCSV(data)
    expect(csv).toBe('id,name\n1,Alice\n2,Bob')
  })

  it('should handle null values', () => {
    const data: ExportData = {
      columns: [
        { name: 'id', dataType: 'integer' },
        { name: 'name', dataType: 'varchar' }
      ],
      rows: [{ id: 1, name: null }]
    }

    const csv = exportToCSV(data)
    expect(csv).toBe('id,name\n1,')
  })

  it('should escape values with commas', () => {
    const data: ExportData = {
      columns: [{ name: 'address', dataType: 'varchar' }],
      rows: [{ address: '123 Main St, Suite 100' }]
    }

    const csv = exportToCSV(data)
    expect(csv).toBe('address\n"123 Main St, Suite 100"')
  })
})

describe('exportToJSON', () => {
  it('should export data as pretty JSON', () => {
    const data: ExportData = {
      columns: [
        { name: 'id', dataType: 'integer' },
        { name: 'name', dataType: 'varchar' }
      ],
      rows: [{ id: 1, name: 'Alice' }]
    }

    const json = exportToJSON(data)
    expect(JSON.parse(json)).toEqual([{ id: 1, name: 'Alice' }])
  })

  it('should export compact JSON when pretty is false', () => {
    const data: ExportData = {
      columns: [{ name: 'id', dataType: 'integer' }],
      rows: [{ id: 1 }]
    }

    const json = exportToJSON(data, false)
    expect(json).toBe('[{"id":1}]')
  })

  it('should only include columns in output', () => {
    const data: ExportData = {
      columns: [{ name: 'id', dataType: 'integer' }],
      rows: [{ id: 1, extra: 'ignored' }]
    }

    const json = exportToJSON(data)
    expect(JSON.parse(json)).toEqual([{ id: 1 }])
  })
})

describe('exportToSQL', () => {
  const sampleData: ExportData = {
    columns: [
      { name: 'id', dataType: 'integer' },
      { name: 'name', dataType: 'varchar' },
      { name: 'active', dataType: 'boolean' }
    ],
    rows: [
      { id: 1, name: 'Alice', active: true },
      { id: 2, name: 'Bob', active: false }
    ]
  }

  it('should return comment for empty data', () => {
    const data: ExportData = { columns: [], rows: [] }
    expect(exportToSQL(data, { tableName: 'test' })).toBe('-- No data to export')
  })

  it('should generate INSERT statements', () => {
    const sql = exportToSQL(sampleData, { tableName: 'users' })

    expect(sql).toContain('INSERT INTO users (id, name, active)')
    expect(sql).toContain("VALUES (1, 'Alice', TRUE);")
    expect(sql).toContain("VALUES (2, 'Bob', FALSE);")
  })

  it('should include schema name when provided', () => {
    const sql = exportToSQL(sampleData, { tableName: 'users', schemaName: 'public' })

    expect(sql).toContain('INSERT INTO public.users')
  })

  it('should quote reserved word table names', () => {
    const sql = exportToSQL(sampleData, { tableName: 'order' })

    expect(sql).toContain('INSERT INTO "order"')
  })

  it('should use dialect-specific quoting for MySQL', () => {
    const data: ExportData = {
      columns: [{ name: 'select', dataType: 'integer' }],
      rows: [{ select: 1 }]
    }

    const sql = exportToSQL(data, { tableName: 'order', dialect: 'mysql' })

    expect(sql).toContain('INSERT INTO `order` (`select`)')
  })

  it('should use dialect-specific quoting for MSSQL', () => {
    const data: ExportData = {
      columns: [{ name: 'select', dataType: 'integer' }],
      rows: [{ select: 1 }]
    }

    const sql = exportToSQL(data, { tableName: 'order', dialect: 'mssql' })

    expect(sql).toContain('INSERT INTO [order] ([select])')
  })

  describe('batch mode', () => {
    it('should create batch INSERT with multiple values', () => {
      const sql = exportToSQL(sampleData, { tableName: 'users', batchSize: 2 })

      expect(sql).toContain('INSERT INTO users (id, name, active)')
      expect(sql).toContain('VALUES')
      expect(sql).toMatch(/\(1, 'Alice', TRUE\),?\n.*\(2, 'Bob', FALSE\)/)
    })

    it('should split into multiple batches', () => {
      const data: ExportData = {
        columns: [{ name: 'id', dataType: 'integer' }],
        rows: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]
      }

      const sql = exportToSQL(data, { tableName: 'nums', batchSize: 2 })

      // Should have 3 INSERT statements: (1,2), (3,4), (5)
      const insertCount = (sql.match(/INSERT INTO/g) || []).length
      expect(insertCount).toBe(3)
    })
  })

  describe('transaction wrapper', () => {
    it('should include BEGIN/COMMIT when includeTransaction is true', () => {
      const sql = exportToSQL(sampleData, { tableName: 'users', includeTransaction: true })

      expect(sql).toMatch(/^BEGIN;/)
      expect(sql).toMatch(/COMMIT;$/)
    })

    it('should not include transaction wrapper by default', () => {
      const sql = exportToSQL(sampleData, { tableName: 'users' })

      expect(sql).not.toContain('BEGIN;')
      expect(sql).not.toContain('COMMIT;')
    })
  })

  it('should include header comments', () => {
    const sql = exportToSQL(sampleData, { tableName: 'users' })

    expect(sql).toContain('-- Exported 2 rows from users')
    expect(sql).toContain('-- Generated at')
  })
})

describe('generateExportFilename', () => {
  it('should generate filename with timestamp', () => {
    const filename = generateExportFilename()

    expect(filename).toMatch(/^query_result_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/)
  })

  it('should include table name when provided', () => {
    const filename = generateExportFilename('users')

    expect(filename).toMatch(/^users_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/)
  })
})
