import { describe, it, expect } from 'vitest'
import { buildQuery, buildBatchQueries, buildPreviewSql, validateOperation } from '../sql-builder'
import type { RowUpdate, RowInsert, RowDelete, EditContext, DatabaseType } from '@data-peek/shared'

// Test fixtures
const createContext = (overrides: Partial<EditContext> = {}): EditContext => ({
  schema: 'public',
  table: 'users',
  primaryKeyColumns: ['id'],
  columns: [
    { name: 'id', dataType: 'integer', isNullable: false, isPrimaryKey: true, ordinalPosition: 1 },
    {
      name: 'name',
      dataType: 'varchar',
      isNullable: true,
      isPrimaryKey: false,
      ordinalPosition: 2
    },
    {
      name: 'email',
      dataType: 'varchar',
      isNullable: false,
      isPrimaryKey: false,
      ordinalPosition: 3
    },
    { name: 'age', dataType: 'integer', isNullable: true, isPrimaryKey: false, ordinalPosition: 4 },
    {
      name: 'active',
      dataType: 'boolean',
      isNullable: false,
      isPrimaryKey: false,
      ordinalPosition: 5
    },
    {
      name: 'metadata',
      dataType: 'jsonb',
      isNullable: true,
      isPrimaryKey: false,
      ordinalPosition: 6
    }
  ],
  ...overrides
})

describe('buildQuery', () => {
  describe('UPDATE operations', () => {
    const updateOp: RowUpdate = {
      type: 'update',
      id: 'op-1',
      primaryKeys: [{ column: 'id', value: 1, dataType: 'integer' }],
      changes: [
        { column: 'name', oldValue: 'John', newValue: 'Jane', dataType: 'varchar' },
        { column: 'age', oldValue: 30, newValue: 31, dataType: 'integer' }
      ],
      originalRow: { id: 1, name: 'John', age: 30 }
    }

    it('should build UPDATE for PostgreSQL with parameterized query', () => {
      const result = buildQuery(updateOp, createContext(), 'postgresql')
      expect(result.sql).toBe(
        'UPDATE "users" SET "name" = $1, "age" = $2 WHERE "id" = $3 RETURNING *'
      )
      expect(result.params).toEqual(['Jane', 31, 1])
    })

    it('should build UPDATE for MySQL with parameterized query', () => {
      const result = buildQuery(updateOp, createContext(), 'mysql')
      expect(result.sql).toBe('UPDATE `users` SET `name` = ?, `age` = ? WHERE `id` = ?')
      expect(result.params).toEqual(['Jane', 31, 1])
    })

    it('should build UPDATE for SQLite with parameterized query', () => {
      const result = buildQuery(updateOp, createContext(), 'sqlite')
      expect(result.sql).toBe('UPDATE "users" SET "name" = ?, "age" = ? WHERE "id" = ? RETURNING *')
      expect(result.params).toEqual(['Jane', 31, 1])
    })

    it('should build UPDATE for MSSQL with parameterized query', () => {
      const result = buildQuery(updateOp, createContext(), 'mssql')
      expect(result.sql).toBe('UPDATE [users] SET [name] = @p1, [age] = @p2 WHERE [id] = @p3')
      expect(result.params).toEqual(['Jane', 31, 1])
    })

    it('should handle composite primary keys', () => {
      const compositeUpdate: RowUpdate = {
        type: 'update',
        id: 'op-2',
        primaryKeys: [
          { column: 'user_id', value: 1, dataType: 'integer' },
          { column: 'org_id', value: 100, dataType: 'integer' }
        ],
        changes: [{ column: 'role', oldValue: 'user', newValue: 'admin', dataType: 'varchar' }],
        originalRow: { user_id: 1, org_id: 100, role: 'user' }
      }
      const result = buildQuery(compositeUpdate, createContext(), 'postgresql')
      expect(result.sql).toBe(
        'UPDATE "users" SET "role" = $1 WHERE "user_id" = $2 AND "org_id" = $3 RETURNING *'
      )
      expect(result.params).toEqual(['admin', 1, 100])
    })

    it('should handle JSON/JSONB data types', () => {
      const jsonUpdate: RowUpdate = {
        type: 'update',
        id: 'op-3',
        primaryKeys: [{ column: 'id', value: 1, dataType: 'integer' }],
        changes: [
          {
            column: 'metadata',
            oldValue: { foo: 'bar' },
            newValue: { foo: 'baz', extra: true },
            dataType: 'jsonb'
          }
        ],
        originalRow: { id: 1, metadata: { foo: 'bar' } }
      }
      const result = buildQuery(jsonUpdate, createContext(), 'postgresql')
      expect(result.sql).toBe('UPDATE "users" SET "metadata" = $1 WHERE "id" = $2 RETURNING *')
      expect(result.params).toEqual(['{"foo":"baz","extra":true}', 1])
    })

    it('should handle boolean data types', () => {
      const boolUpdate: RowUpdate = {
        type: 'update',
        id: 'op-4',
        primaryKeys: [{ column: 'id', value: 1, dataType: 'integer' }],
        changes: [{ column: 'active', oldValue: true, newValue: false, dataType: 'boolean' }],
        originalRow: { id: 1, active: true }
      }
      const result = buildQuery(boolUpdate, createContext(), 'postgresql')
      expect(result.params).toEqual([false, 1])
    })

    it('should handle NULL values', () => {
      const nullUpdate: RowUpdate = {
        type: 'update',
        id: 'op-5',
        primaryKeys: [{ column: 'id', value: 1, dataType: 'integer' }],
        changes: [{ column: 'name', oldValue: 'John', newValue: null, dataType: 'varchar' }],
        originalRow: { id: 1, name: 'John' }
      }
      const result = buildQuery(nullUpdate, createContext(), 'postgresql')
      expect(result.params).toEqual([null, 1])
    })

    it('should include schema when not public/main/dbo', () => {
      const context = createContext({ schema: 'custom_schema' })
      const result = buildQuery(updateOp, context, 'postgresql')
      expect(result.sql).toContain('"custom_schema"."users"')
    })

    it('should not include schema for public', () => {
      const context = createContext({ schema: 'public' })
      const result = buildQuery(updateOp, context, 'postgresql')
      expect(result.sql).not.toContain('"public"')
      expect(result.sql).toContain('"users"')
    })

    it('should not include schema for dbo (MSSQL default)', () => {
      const context = createContext({ schema: 'dbo' })
      const result = buildQuery(updateOp, context, 'mssql')
      expect(result.sql).not.toContain('[dbo]')
      expect(result.sql).toContain('[users]')
    })
  })

  describe('INSERT operations', () => {
    const insertOp: RowInsert = {
      type: 'insert',
      id: 'op-1',
      values: { name: 'Alice', email: 'alice@example.com', age: 25, active: true },
      columns: [
        { name: 'name', dataType: 'varchar' },
        { name: 'email', dataType: 'varchar' },
        { name: 'age', dataType: 'integer' },
        { name: 'active', dataType: 'boolean' }
      ]
    }

    it('should build INSERT for PostgreSQL with parameterized query', () => {
      const result = buildQuery(insertOp, createContext(), 'postgresql')
      expect(result.sql).toBe(
        'INSERT INTO "users" ("name", "email", "age", "active") VALUES ($1, $2, $3, $4) RETURNING *'
      )
      expect(result.params).toEqual(['Alice', 'alice@example.com', 25, true])
    })

    it('should build INSERT for MySQL with parameterized query', () => {
      const result = buildQuery(insertOp, createContext(), 'mysql')
      expect(result.sql).toBe(
        'INSERT INTO `users` (`name`, `email`, `age`, `active`) VALUES (?, ?, ?, ?)'
      )
      expect(result.params).toEqual(['Alice', 'alice@example.com', 25, true])
    })

    it('should build INSERT for SQLite with parameterized query', () => {
      const result = buildQuery(insertOp, createContext(), 'sqlite')
      expect(result.sql).toContain('INSERT INTO "users"')
      expect(result.sql).toContain('RETURNING *')
    })

    it('should build INSERT for MSSQL with parameterized query', () => {
      const result = buildQuery(insertOp, createContext(), 'mssql')
      expect(result.sql).toBe(
        'INSERT INTO [users] ([name], [email], [age], [active]) VALUES (@p1, @p2, @p3, @p4)'
      )
      expect(result.params).toEqual(['Alice', 'alice@example.com', 25, true])
    })

    it('should skip undefined values', () => {
      const partialInsert: RowInsert = {
        type: 'insert',
        id: 'op-2',
        values: { name: 'Bob', email: undefined, age: 30 },
        columns: [
          { name: 'name', dataType: 'varchar' },
          { name: 'email', dataType: 'varchar' },
          { name: 'age', dataType: 'integer' }
        ]
      }
      const result = buildQuery(partialInsert, createContext(), 'postgresql')
      expect(result.sql).toBe('INSERT INTO "users" ("name", "age") VALUES ($1, $2) RETURNING *')
      expect(result.params).toEqual(['Bob', 30])
    })

    it('should handle JSON/JSONB data types', () => {
      const jsonInsert: RowInsert = {
        type: 'insert',
        id: 'op-3',
        values: { name: 'Charlie', metadata: { role: 'admin', permissions: ['read', 'write'] } },
        columns: [
          { name: 'name', dataType: 'varchar' },
          { name: 'metadata', dataType: 'jsonb' }
        ]
      }
      const result = buildQuery(jsonInsert, createContext(), 'postgresql')
      expect(result.params[1]).toBe('{"role":"admin","permissions":["read","write"]}')
    })

    it('should include schema when not default', () => {
      const context = createContext({ schema: 'analytics' })
      const result = buildQuery(insertOp, context, 'postgresql')
      expect(result.sql).toContain('"analytics"."users"')
    })
  })

  describe('DELETE operations', () => {
    const deleteOp: RowDelete = {
      type: 'delete',
      id: 'op-1',
      primaryKeys: [{ column: 'id', value: 42, dataType: 'integer' }],
      originalRow: { id: 42, name: 'ToDelete' }
    }

    it('should build DELETE for PostgreSQL with parameterized query', () => {
      const result = buildQuery(deleteOp, createContext(), 'postgresql')
      expect(result.sql).toBe('DELETE FROM "users" WHERE "id" = $1 RETURNING *')
      expect(result.params).toEqual([42])
    })

    it('should build DELETE for MySQL with parameterized query', () => {
      const result = buildQuery(deleteOp, createContext(), 'mysql')
      expect(result.sql).toBe('DELETE FROM `users` WHERE `id` = ?')
      expect(result.params).toEqual([42])
    })

    it('should build DELETE for SQLite with parameterized query', () => {
      const result = buildQuery(deleteOp, createContext(), 'sqlite')
      expect(result.sql).toBe('DELETE FROM "users" WHERE "id" = ? RETURNING *')
      expect(result.params).toEqual([42])
    })

    it('should build DELETE for MSSQL with parameterized query', () => {
      const result = buildQuery(deleteOp, createContext(), 'mssql')
      expect(result.sql).toBe('DELETE FROM [users] WHERE [id] = @p1')
      expect(result.params).toEqual([42])
    })

    it('should handle composite primary keys', () => {
      const compositeDelete: RowDelete = {
        type: 'delete',
        id: 'op-2',
        primaryKeys: [
          { column: 'user_id', value: 1, dataType: 'integer' },
          { column: 'org_id', value: 100, dataType: 'integer' }
        ],
        originalRow: { user_id: 1, org_id: 100 }
      }
      const result = buildQuery(compositeDelete, createContext(), 'postgresql')
      expect(result.sql).toBe(
        'DELETE FROM "users" WHERE "user_id" = $1 AND "org_id" = $2 RETURNING *'
      )
      expect(result.params).toEqual([1, 100])
    })

    it('should include schema when not default', () => {
      const context = createContext({ schema: 'archive' })
      const result = buildQuery(deleteOp, context, 'postgresql')
      expect(result.sql).toContain('"archive"."users"')
    })
  })

  describe('default database type', () => {
    it('should default to PostgreSQL when dbType not specified', () => {
      const updateOp: RowUpdate = {
        type: 'update',
        id: 'op-1',
        primaryKeys: [{ column: 'id', value: 1, dataType: 'integer' }],
        changes: [{ column: 'name', oldValue: 'A', newValue: 'B', dataType: 'varchar' }],
        originalRow: { id: 1, name: 'A' }
      }
      const result = buildQuery(updateOp, createContext())
      expect(result.sql).toContain('"') // PostgreSQL uses double quotes
      expect(result.sql).toContain('$1') // PostgreSQL uses $1, $2 parameters
    })
  })
})

describe('buildBatchQueries', () => {
  it('should build queries for multiple operations', () => {
    const operations = [
      {
        type: 'update' as const,
        id: 'op-1',
        primaryKeys: [{ column: 'id', value: 1, dataType: 'integer' }],
        changes: [{ column: 'name', oldValue: 'A', newValue: 'B', dataType: 'varchar' }],
        originalRow: { id: 1, name: 'A' }
      },
      {
        type: 'insert' as const,
        id: 'op-2',
        values: { name: 'New User' },
        columns: [{ name: 'name', dataType: 'varchar' }]
      },
      {
        type: 'delete' as const,
        id: 'op-3',
        primaryKeys: [{ column: 'id', value: 99, dataType: 'integer' }],
        originalRow: { id: 99 }
      }
    ]

    const results = buildBatchQueries(operations, createContext(), 'postgresql')
    expect(results).toHaveLength(3)
    expect(results[0].sql).toContain('UPDATE')
    expect(results[1].sql).toContain('INSERT')
    expect(results[2].sql).toContain('DELETE')
  })

  it('should handle empty operations array', () => {
    const results = buildBatchQueries([], createContext(), 'postgresql')
    expect(results).toEqual([])
  })
})

describe('buildPreviewSql', () => {
  it('should replace PostgreSQL placeholders with values', () => {
    const updateOp: RowUpdate = {
      type: 'update',
      id: 'op-1',
      primaryKeys: [{ column: 'id', value: 1, dataType: 'integer' }],
      changes: [{ column: 'name', oldValue: 'Old', newValue: "O'Brien", dataType: 'varchar' }],
      originalRow: { id: 1, name: 'Old' }
    }
    const preview = buildPreviewSql(updateOp, createContext(), 'postgresql')
    expect(preview).toContain("'O''Brien'") // Escaped single quote
    expect(preview).toContain('1')
    expect(preview).not.toContain('$1')
    expect(preview).not.toContain('$2')
  })

  it('should replace MySQL placeholders with values', () => {
    const updateOp: RowUpdate = {
      type: 'update',
      id: 'op-1',
      primaryKeys: [{ column: 'id', value: 5, dataType: 'integer' }],
      changes: [
        { column: 'status', oldValue: 'active', newValue: 'inactive', dataType: 'varchar' }
      ],
      originalRow: { id: 5, status: 'active' }
    }
    const preview = buildPreviewSql(updateOp, createContext(), 'mysql')
    expect(preview).toContain("'inactive'")
    expect(preview).toContain('5')
    expect(preview).not.toContain('?')
  })

  it('should replace MSSQL placeholders with values', () => {
    const updateOp: RowUpdate = {
      type: 'update',
      id: 'op-1',
      primaryKeys: [{ column: 'id', value: 10, dataType: 'integer' }],
      changes: [{ column: 'name', oldValue: 'Test', newValue: 'Updated', dataType: 'varchar' }],
      originalRow: { id: 10, name: 'Test' }
    }
    const preview = buildPreviewSql(updateOp, createContext(), 'mssql')
    expect(preview).toContain("'Updated'")
    expect(preview).toContain('10')
    expect(preview).not.toContain('@p1')
    expect(preview).not.toContain('@p2')
  })

  it('should handle NULL values', () => {
    const updateOp: RowUpdate = {
      type: 'update',
      id: 'op-1',
      primaryKeys: [{ column: 'id', value: 1, dataType: 'integer' }],
      changes: [{ column: 'name', oldValue: 'John', newValue: null, dataType: 'varchar' }],
      originalRow: { id: 1, name: 'John' }
    }
    const preview = buildPreviewSql(updateOp, createContext(), 'postgresql')
    expect(preview).toContain('NULL')
  })

  it('should handle boolean values', () => {
    const updateOp: RowUpdate = {
      type: 'update',
      id: 'op-1',
      primaryKeys: [{ column: 'id', value: 1, dataType: 'integer' }],
      changes: [{ column: 'active', oldValue: false, newValue: true, dataType: 'boolean' }],
      originalRow: { id: 1, active: false }
    }
    const preview = buildPreviewSql(updateOp, createContext(), 'postgresql')
    expect(preview).toContain('TRUE')
  })

  it('should handle object values (JSON)', () => {
    const updateOp: RowUpdate = {
      type: 'update',
      id: 'op-1',
      primaryKeys: [{ column: 'id', value: 1, dataType: 'integer' }],
      changes: [{ column: 'data', oldValue: {}, newValue: { key: 'value' }, dataType: 'jsonb' }],
      originalRow: { id: 1, data: {} }
    }
    const preview = buildPreviewSql(updateOp, createContext(), 'postgresql')
    expect(preview).toContain('{"key":"value"}')
  })
})

describe('validateOperation', () => {
  describe('UPDATE validation', () => {
    it('should return valid for proper UPDATE with primary key', () => {
      const updateOp: RowUpdate = {
        type: 'update',
        id: 'op-1',
        primaryKeys: [{ column: 'id', value: 1, dataType: 'integer' }],
        changes: [{ column: 'name', oldValue: 'A', newValue: 'B', dataType: 'varchar' }],
        originalRow: { id: 1, name: 'A' }
      }
      const result = validateOperation(updateOp)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject UPDATE without primary key', () => {
      const updateOp: RowUpdate = {
        type: 'update',
        id: 'op-1',
        primaryKeys: [],
        changes: [{ column: 'name', oldValue: 'A', newValue: 'B', dataType: 'varchar' }],
        originalRow: { name: 'A' }
      }
      const result = validateOperation(updateOp)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('primary key')
    })

    it('should reject UPDATE with no changes', () => {
      const updateOp: RowUpdate = {
        type: 'update',
        id: 'op-1',
        primaryKeys: [{ column: 'id', value: 1, dataType: 'integer' }],
        changes: [],
        originalRow: { id: 1 }
      }
      const result = validateOperation(updateOp)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('No changes')
    })
  })

  describe('INSERT validation', () => {
    it('should return valid for proper INSERT with values', () => {
      const insertOp: RowInsert = {
        type: 'insert',
        id: 'op-1',
        values: { name: 'Test' },
        columns: [{ name: 'name', dataType: 'varchar' }]
      }
      const result = validateOperation(insertOp)
      expect(result.valid).toBe(true)
    })

    it('should reject INSERT with all null values', () => {
      const insertOp: RowInsert = {
        type: 'insert',
        id: 'op-1',
        values: { name: null, email: null },
        columns: [
          { name: 'name', dataType: 'varchar' },
          { name: 'email', dataType: 'varchar' }
        ]
      }
      const result = validateOperation(insertOp)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('empty row')
    })

    it('should reject INSERT with all undefined values', () => {
      const insertOp: RowInsert = {
        type: 'insert',
        id: 'op-1',
        values: { name: undefined, email: undefined },
        columns: [
          { name: 'name', dataType: 'varchar' },
          { name: 'email', dataType: 'varchar' }
        ]
      }
      const result = validateOperation(insertOp)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('empty row')
    })
  })

  describe('DELETE validation', () => {
    it('should return valid for proper DELETE with primary key', () => {
      const deleteOp: RowDelete = {
        type: 'delete',
        id: 'op-1',
        primaryKeys: [{ column: 'id', value: 1, dataType: 'integer' }],
        originalRow: { id: 1 }
      }
      const result = validateOperation(deleteOp)
      expect(result.valid).toBe(true)
    })

    it('should reject DELETE without primary key', () => {
      const deleteOp: RowDelete = {
        type: 'delete',
        id: 'op-1',
        primaryKeys: [],
        originalRow: {}
      }
      const result = validateOperation(deleteOp)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('primary key')
    })
  })
})

describe('dialect consistency', () => {
  const dbTypes: DatabaseType[] = ['postgresql', 'mysql', 'sqlite', 'mssql']

  it('should generate valid SQL for all supported database types', () => {
    const updateOp: RowUpdate = {
      type: 'update',
      id: 'op-1',
      primaryKeys: [{ column: 'id', value: 1, dataType: 'integer' }],
      changes: [{ column: 'name', oldValue: 'A', newValue: 'B', dataType: 'varchar' }],
      originalRow: { id: 1, name: 'A' }
    }

    for (const dbType of dbTypes) {
      const result = buildQuery(updateOp, createContext(), dbType)
      expect(result.sql).toContain('UPDATE')
      expect(result.sql).toContain('SET')
      expect(result.sql).toContain('WHERE')
      expect(result.params).toHaveLength(2)
    }
  })

  it('should use correct identifier quoting for each dialect', () => {
    const insertOp: RowInsert = {
      type: 'insert',
      id: 'op-1',
      values: { name: 'Test' },
      columns: [{ name: 'name', dataType: 'varchar' }]
    }

    const pgResult = buildQuery(insertOp, createContext(), 'postgresql')
    expect(pgResult.sql).toContain('"users"')
    expect(pgResult.sql).toContain('"name"')

    const mysqlResult = buildQuery(insertOp, createContext(), 'mysql')
    expect(mysqlResult.sql).toContain('`users`')
    expect(mysqlResult.sql).toContain('`name`')

    const mssqlResult = buildQuery(insertOp, createContext(), 'mssql')
    expect(mssqlResult.sql).toContain('[users]')
    expect(mssqlResult.sql).toContain('[name]')
  })

  it('should use correct parameter placeholders for each dialect', () => {
    const deleteOp: RowDelete = {
      type: 'delete',
      id: 'op-1',
      primaryKeys: [
        { column: 'a', value: 1, dataType: 'integer' },
        { column: 'b', value: 2, dataType: 'integer' }
      ],
      originalRow: { a: 1, b: 2 }
    }

    const pgResult = buildQuery(deleteOp, createContext(), 'postgresql')
    expect(pgResult.sql).toContain('$1')
    expect(pgResult.sql).toContain('$2')

    const mysqlResult = buildQuery(deleteOp, createContext(), 'mysql')
    expect(mysqlResult.sql.match(/\?/g)).toHaveLength(2)

    const mssqlResult = buildQuery(deleteOp, createContext(), 'mssql')
    expect(mssqlResult.sql).toContain('@p1')
    expect(mssqlResult.sql).toContain('@p2')
  })
})
