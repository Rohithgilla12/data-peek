import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConnectionConfig } from '@shared/index'

vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../ssh-tunnel-service', () => ({
  createTunnel: vi.fn(),
  closeTunnel: vi.fn(),
  TunnelSession: class {}
}))

// Mock the pool manager so getTableDDL runs against a fake client whose query()
// results we program per call. Resolves to the same module the adapter imports.
const { withPgClient, fakeClient } = vi.hoisted(() => {
  const fakeClient = { query: vi.fn() }
  const withPgClient = vi.fn(async (_cfg: unknown, fn: (c: typeof fakeClient) => unknown) =>
    fn(fakeClient)
  )
  return { withPgClient, fakeClient }
})
vi.mock('../adapters/pg-pool-manager', () => ({ withPgClient, withPgTransaction: vi.fn() }))

import {
  parsePostgresArray,
  isDataReturningStatement,
  PostgresAdapter
} from '../adapters/postgres-adapter'

function makeConfig(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    id: 'pg1',
    name: 'test-pg',
    host: 'localhost',
    port: 5432,
    database: 'db',
    user: 'u',
    password: 'p',
    dbType: 'postgresql',
    dstPort: 5432,
    ...overrides
  }
}

describe('parsePostgresArray', () => {
  it('parses a simple {a,b} literal', () => {
    expect(parsePostgresArray('{a,b}')).toEqual(['a', 'b'])
  })

  it('returns an empty array for {}', () => {
    expect(parsePostgresArray('{}')).toEqual([])
  })

  it('strips surrounding quotes from quoted elements', () => {
    expect(parsePostgresArray('{"x","y"}')).toEqual(['x', 'y'])
  })

  it('passes through values that are already arrays', () => {
    expect(parsePostgresArray(['already', 'array'])).toEqual(['already', 'array'])
  })

  it('returns an empty array for non-array, non-brace strings and other types', () => {
    expect(parsePostgresArray('not an array')).toEqual([])
    expect(parsePostgresArray(null)).toEqual([])
    expect(parsePostgresArray(42)).toEqual([])
  })
})

describe('isDataReturningStatement (postgres)', () => {
  it.each([
    ['SELECT * FROM t', true],
    ['  select 1', true],
    ['WITH cte AS (SELECT 1) SELECT * FROM cte', true],
    ['TABLE users', true],
    ['VALUES (1), (2)', true],
    ['INSERT INTO t VALUES (1) RETURNING id', true],
    ['SHOW search_path', true],
    ['EXPLAIN SELECT 1', true],
    ['INSERT INTO t VALUES (1)', false],
    ['UPDATE t SET a = 1', false],
    ['DELETE FROM t', false]
  ])('%s -> %s', (sql, expected) => {
    expect(isDataReturningStatement(sql)).toBe(expected)
  })
})

describe('PostgresAdapter.getTableDDL', () => {
  beforeEach(() => {
    fakeClient.query.mockReset()
    withPgClient.mockClear()
  })

  // getTableDDL issues four queries in this order: columns, constraints, indexes, comment.
  it('maps columns, skips the PK constraint, flags unique columns, and reads the comment', async () => {
    fakeClient.query
      .mockResolvedValueOnce({
        rows: [
          {
            column_name: 'id',
            udt_name: 'int4',
            is_nullable: 'NO',
            column_default: "nextval('users_id_seq')",
            ordinal_position: 1,
            numeric_precision: 32,
            numeric_scale: 0,
            character_maximum_length: null,
            is_primary_key: true,
            column_comment: null,
            collation_name: null
          },
          {
            column_name: 'email',
            udt_name: 'varchar',
            is_nullable: 'NO',
            ordinal_position: 2,
            character_maximum_length: 255,
            numeric_precision: null,
            numeric_scale: null,
            column_default: null,
            is_primary_key: false,
            column_comment: 'user email',
            collation_name: null
          }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          { constraint_name: 'users_pkey', constraint_type: 'PRIMARY KEY', column_name: 'id' },
          { constraint_name: 'users_email_key', constraint_type: 'UNIQUE', column_name: 'email' }
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          {
            index_name: 'idx_users_email',
            is_unique: true,
            index_method: 'btree',
            columns: ['email'],
            where_clause: null,
            index_definition: 'CREATE UNIQUE INDEX idx_users_email ON public.users (email)',
            is_expression_index: false
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ comment: 'application users' }] })

    const def = await new PostgresAdapter().getTableDDL(makeConfig(), 'public', 'users')

    expect(def.schema).toBe('public')
    expect(def.name).toBe('users')

    const id = def.columns.find((c) => c.name === 'id')
    expect(id).toMatchObject({ dataType: 'int4', isPrimaryKey: true, isNullable: false })

    const email = def.columns.find((c) => c.name === 'email')
    expect(email).toMatchObject({ length: 255, isUnique: true, comment: 'user email' })

    // PK is handled at the column level and excluded from constraints
    expect(def.constraints).toHaveLength(1)
    expect(def.constraints[0]).toMatchObject({
      name: 'users_email_key',
      type: 'unique',
      columns: ['email']
    })

    expect(def.indexes).toHaveLength(1)
    expect(def.indexes[0]).toMatchObject({
      name: 'idx_users_email',
      isUnique: true,
      method: 'btree',
      columns: [{ name: 'email' }]
    })

    expect(def.comment).toBe('application users')
    expect(withPgClient).toHaveBeenCalledTimes(1)
  })

  it('extracts the expression of an expression index when no columns are reported', async () => {
    fakeClient.query
      .mockResolvedValueOnce({
        rows: [
          {
            column_name: 'email',
            udt_name: 'varchar',
            is_nullable: 'NO',
            ordinal_position: 1,
            is_primary_key: false
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            index_name: 'idx_lower_email',
            is_unique: false,
            index_method: 'btree',
            columns: [null],
            where_clause: null,
            is_expression_index: true,
            index_definition:
              'CREATE INDEX idx_lower_email ON public.users USING btree (lower(email))'
          }
        ]
      })
      .mockResolvedValueOnce({ rows: [{ comment: null }] })

    const def = await new PostgresAdapter().getTableDDL(makeConfig(), 'public', 'users')

    expect(def.indexes[0].columns).toEqual([{ name: 'lower(email)' }])
    expect(def.comment).toBeUndefined()
  })
})
