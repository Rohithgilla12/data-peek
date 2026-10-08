import { describe, it, expect } from 'vitest'
import type sql from 'mssql'
import { SCHEMA_INTEL_CHECKS } from '@shared/index'
import {
  parseFkColumns,
  parseIndexColumns,
  runMssqlSchemaIntel,
  suggestIndexName,
  toDuplicateIndexFindings,
  toMissingFkIndexFindings,
  toUnusedIndexFindings
} from '../schema-intel/mssql'

type Row = Record<string, unknown>

interface Server {
  tablesWithoutPk?: Row[]
  fkIndexes?: Row[]
  nullableFks?: Row[]
  /** One row per rowstore index (see checkDuplicateIndexes in mssql.ts). */
  indexes?: Row[]
  unusedIndexes?: Row[]
  /** Throwing stands in for a login without the catalog permissions these checks need. */
  denied?: Error
}

/** A pool that answers each check's query from canned rows. */
function fakePool(server: Server): { pool: sql.ConnectionPool; asked: string[] } {
  const asked: string[] = []
  const pool = {
    request: () => ({
      query: async (query: string) => {
        asked.push(query)
        if (server.denied) throw server.denied
        if (query.includes('dm_db_index_usage_stats')) {
          return { recordset: server.unusedIndexes ?? [] }
        }
        if (query.includes('is_unique_constraint')) return { recordset: server.indexes ?? [] }
        if (query.includes('key_ordinal')) return { recordset: server.fkIndexes ?? [] }
        if (query.includes('is_nullable')) return { recordset: server.nullableFks ?? [] }
        if (query.includes('sys.partitions')) return { recordset: server.tablesWithoutPk ?? [] }
        throw new Error(`unexpected query: ${query}`)
      }
    })
  }
  return { pool: pool as unknown as sql.ConnectionPool, asked }
}

/** The `columns_json` payload the query produces (see columnList in mssql.ts). */
function cols(...names: string[]): string {
  return JSON.stringify(names.map((name) => ({ name })))
}

function fk(table: string, constraint: string, columns: string): Row {
  return {
    schema_name: 'dbo',
    table_name: table,
    constraint_name: constraint,
    columns_json: columns
  }
}

describe('SQL Server missing_fk_indexes', () => {
  it('is offered on SQL Server connections and runs by default', async () => {
    const check = SCHEMA_INTEL_CHECKS.find((c) => c.id === 'missing_fk_indexes')
    expect(check?.supportedDbTypes).toContain('mssql')

    const { pool } = fakePool({ fkIndexes: [fk('orders', 'fk_orders_user', cols('user_id'))] })
    const report = await runMssqlSchemaIntel(pool)

    expect(report.findings.map((f) => f.checkId)).toContain('missing_fk_indexes')
  })

  it('reports a foreign key with no index leading with its columns', async () => {
    const { pool, asked } = fakePool({
      fkIndexes: [fk('orders', 'fk_orders_user', cols('user_id'))]
    })

    const report = await runMssqlSchemaIntel(pool, ['missing_fk_indexes'])

    expect(report.skipped).toEqual([])
    expect(report.findings).toEqual([
      expect.objectContaining({
        checkId: 'missing_fk_indexes',
        severity: 'warning',
        title: 'dbo.orders(user_id) is a FK without a supporting index',
        entity: { schema: 'dbo', name: 'orders', kind: 'foreign_key' },
        metadata: { constraint: 'fk_orders_user', columns: ['user_id'] },
        suggestedSql: 'CREATE INDEX [idx_orders_user_id] ON [dbo].[orders] ([user_id]);'
      })
    ])
    // The index has to hold the FK columns as leading key columns, in order.
    expect(asked[0]).toContain('ic.key_ordinal = fkc.constraint_column_id')
  })

  it('keeps every column of a composite foreign key', async () => {
    const { pool } = fakePool({
      fkIndexes: [fk('orders', 'fk_orders_tenant_user', cols('tenant_id', 'user_id'))]
    })

    const report = await runMssqlSchemaIntel(pool, ['missing_fk_indexes'])

    expect(report.findings[0].title).toBe(
      'dbo.orders(tenant_id, user_id) is a FK without a supporting index'
    )
    expect(report.findings[0].suggestedSql).toBe(
      'CREATE INDEX [idx_orders_tenant_id_user_id] ON [dbo].[orders] ([tenant_id], [user_id]);'
    )
  })

  it('quotes a bracket in a name', async () => {
    const { pool } = fakePool({ fkIndexes: [fk('order]items', 'fk', cols('user_id'))] })

    const report = await runMssqlSchemaIntel(pool, ['missing_fk_indexes'])

    expect(report.findings[0].suggestedSql).toBe(
      'CREATE INDEX [idx_order]]items_user_id] ON [dbo].[order]]items] ([user_id]);'
    )
  })
})

describe('SQL Server nullable_fks', () => {
  it('is offered on SQL Server connections and runs by default', async () => {
    const check = SCHEMA_INTEL_CHECKS.find((c) => c.id === 'nullable_fks')
    expect(check?.supportedDbTypes).toContain('mssql')

    const { pool } = fakePool({ nullableFks: [fk('orders', 'fk_orders_user', cols('user_id'))] })
    const report = await runMssqlSchemaIntel(pool)

    expect(report.findings.map((f) => f.checkId)).toContain('nullable_fks')
  })

  it('reports a foreign key column that allows NULL', async () => {
    const { pool } = fakePool({ nullableFks: [fk('orders', 'fk_orders_user', cols('user_id'))] })

    const report = await runMssqlSchemaIntel(pool, ['nullable_fks'])

    expect(report.skipped).toEqual([])
    expect(report.findings).toEqual([
      expect.objectContaining({
        checkId: 'nullable_fks',
        severity: 'info',
        title: 'dbo.orders(user_id) is a nullable foreign key',
        entity: { schema: 'dbo', name: 'orders', kind: 'foreign_key' },
        metadata: { constraint: 'fk_orders_user', columns: ['user_id'] }
      })
    ])
  })
})

describe('SQL Server skipped checks', () => {
  it('skips a check the catalog permissions refuse', async () => {
    const denied = new Error('The SELECT permission was denied on the object sys.foreign_keys')
    const { pool } = fakePool({ denied })

    const report = await runMssqlSchemaIntel(pool, ['missing_fk_indexes'])

    expect(report.findings).toEqual([])
    expect(report.skipped).toEqual([{ checkId: 'missing_fk_indexes', reason: denied.message }])
  })
})

describe('SQL Server FK column parsing', () => {
  it('parses the JSON payload the query produces', () => {
    expect(parseFkColumns(cols('a', 'b'))).toEqual(['a', 'b'])
  })

  it('keeps a comma inside a column name intact', () => {
    // The old comma-joined payload turned this single column into two.
    expect(parseFkColumns(cols('a,b'))).toEqual(['a,b'])
    expect(toMissingFkIndexFindings([fk('t', 'fk_t', cols('a,b'))])[0].suggestedSql).toBe(
      'CREATE INDEX [idx_t_a,b] ON [dbo].[t] ([a,b]);'
    )
  })

  it('is tolerant of NULL, empty and junk payloads', () => {
    expect(parseFkColumns(null)).toEqual([])
    expect(parseFkColumns(undefined)).toEqual([])
    expect(parseFkColumns('')).toEqual([])
    expect(parseFkColumns('not json')).toEqual([])
    expect(parseFkColumns('{"name":"a"}')).toEqual([])
    expect(parseFkColumns('[{"other":1},{"name":"a"}]')).toEqual(['a'])
  })

  it('drops a foreign key whose column list came back empty', () => {
    // An unreadable payload must not yield a `CREATE INDEX ()` suggestion.
    const [finding] = toMissingFkIndexFindings([fk('orders', 'fk_orders_x', '')])
    expect(finding.suggestedSql).toBeUndefined()
  })
})

describe('SQL Server suggested index names', () => {
  it('keeps a short name readable', () => {
    expect(suggestIndexName('orders', ['tenant_id', 'user_id'])).toBe(
      'idx_orders_tenant_id_user_id'
    )
  })

  it('does not collide when a long name has to be truncated', () => {
    const long = (suffix: string) => 'c'.repeat(60) + suffix
    const a = suggestIndexName('t', [long('1'), long('2')])
    const b = suggestIndexName('t', [long('1'), long('3')])

    expect(a).not.toBe(b)
    expect(a.length).toBeLessThanOrEqual(60)
    expect(b.length).toBeLessThanOrEqual(60)
  })
})

describe('SQL Server tables_without_pk', () => {
  it('orders by row count and suggests a primary key', async () => {
    const { pool, asked } = fakePool({
      tablesWithoutPk: [{ schema_name: 'dbo', table_name: 'audit', estimated_rows: 1200 }]
    })

    const report = await runMssqlSchemaIntel(pool, ['tables_without_pk'])

    expect(asked[0]).toContain('ORDER BY SUM(p.rows) DESC')
    expect(report.findings[0].suggestedSql).toBe(
      '-- Review and pick a unique column before running:\n-- ALTER TABLE [dbo].[audit] ADD id BIGINT IDENTITY(1,1) PRIMARY KEY;'
    )
  })

  it('keeps a line break in a table name from ending the comment', async () => {
    const { pool } = fakePool({
      tablesWithoutPk: [
        { schema_name: 'dbo', table_name: 'audit\nDROP TABLE users;--', estimated_rows: 1 }
      ]
    })

    const report = await runMssqlSchemaIntel(pool, ['tables_without_pk'])

    // The injected statement must not become executable SQL in the suggestion.
    const suggested = report.findings[0].suggestedSql ?? ''
    expect(suggested.split('\n').every((line) => line.startsWith('-- '))).toBe(true)
  })
})

/** The `key_columns_json` payload the query produces (see indexColumnList in mssql.ts). */
function keys(...names: string[]): string {
  return JSON.stringify(names.map((name) => ({ name, desc: false })))
}

function index(
  table: string,
  name: string,
  keyColumns: string,
  extra: Partial<{
    type: number
    unique: boolean
    primaryKey: boolean
    uniqueConstraint: boolean
    filter: string
    includes: string
  }> = {}
): Row {
  return {
    schema_name: 'dbo',
    table_name: table,
    index_name: name,
    index_type: extra.type ?? 2,
    is_unique: extra.unique ?? (extra.primaryKey || extra.uniqueConstraint || false),
    is_primary_key: extra.primaryKey ?? false,
    is_unique_constraint: extra.uniqueConstraint ?? false,
    filter_definition: extra.filter ?? null,
    key_columns_json: keyColumns,
    included_columns_json: extra.includes ?? null
  }
}

describe('SQL Server duplicate_indexes', () => {
  it('is offered on SQL Server connections and runs by default', async () => {
    const check = SCHEMA_INTEL_CHECKS.find((c) => c.id === 'duplicate_indexes')
    expect(check?.supportedDbTypes).toContain('mssql')

    const { pool } = fakePool({
      indexes: [index('orders', 'ix_a', keys('user_id')), index('orders', 'ix_b', keys('user_id'))]
    })
    const report = await runMssqlSchemaIntel(pool)

    expect(report.findings.map((f) => f.checkId)).toContain('duplicate_indexes')
  })

  it('reports indexes with the same key columns and keeps the first by name', async () => {
    const { pool, asked } = fakePool({
      indexes: [
        index('orders', 'ix_orders_user_2', keys('user_id')),
        index('orders', 'ix_orders_user', keys('user_id'))
      ]
    })

    const report = await runMssqlSchemaIntel(pool, ['duplicate_indexes'])

    expect(report.skipped).toEqual([])
    expect(report.findings).toEqual([
      expect.objectContaining({
        checkId: 'duplicate_indexes',
        severity: 'warning',
        title: 'dbo.orders has duplicate index: ix_orders_user_2',
        entity: { schema: 'dbo', name: 'orders', kind: 'table' },
        metadata: {
          keptIndex: 'ix_orders_user',
          duplicates: ['ix_orders_user_2'],
          columns: ['user_id'],
          includedColumns: []
        },
        suggestedSql: 'DROP INDEX [ix_orders_user_2] ON [dbo].[orders];'
      })
    ])
    // The heap, hypothetical and disabled indexes are not indexes to drop, and
    // XML, spatial and columnstore indexes have no key list to compare.
    expect(asked[0]).toContain('i.index_id > 0')
    expect(asked[0]).toContain('i.type IN (1, 2)')
    expect(asked[0]).toContain('i.is_hypothetical = 0')
    expect(asked[0]).toContain('i.is_disabled = 0')
  })

  it('names every duplicate and drops all but the kept one', async () => {
    const { pool } = fakePool({
      indexes: [
        index('orders', 'ix_c', keys('user_id')),
        index('orders', 'ix_a', keys('user_id')),
        index('orders', 'ix_b', keys('user_id'))
      ]
    })

    const report = await runMssqlSchemaIntel(pool, ['duplicate_indexes'])

    expect(report.findings).toHaveLength(1)
    expect(report.findings[0].title).toBe('dbo.orders has duplicate indexes: ix_b, ix_c')
    expect(report.findings[0].suggestedSql).toBe(
      'DROP INDEX [ix_b] ON [dbo].[orders];\nDROP INDEX [ix_c] ON [dbo].[orders];'
    )
  })

  it('keeps the clustered primary key over a plain index whatever their names', async () => {
    const { pool } = fakePool({
      indexes: [
        index('orders', 'ix_a', keys('id'), { unique: true }),
        index('orders', 'pk_orders', keys('id'), { type: 1, primaryKey: true })
      ]
    })

    const report = await runMssqlSchemaIntel(pool, ['duplicate_indexes'])

    expect(report.findings[0].metadata?.keptIndex).toBe('pk_orders')
    expect(report.findings[0].suggestedSql).toBe('DROP INDEX [ix_a] ON [dbo].[orders];')
  })

  it('drops a redundant unique constraint through the constraint', async () => {
    const { pool } = fakePool({
      indexes: [
        index('users', 'uq_users_email', keys('email'), { uniqueConstraint: true }),
        index('users', 'pk_users', keys('email'), { primaryKey: true })
      ]
    })

    const report = await runMssqlSchemaIntel(pool, ['duplicate_indexes'])

    expect(report.findings[0].metadata?.keptIndex).toBe('pk_users')
    expect(report.findings[0].suggestedSql).toBe(
      'ALTER TABLE [dbo].[users] DROP CONSTRAINT [uq_users_email];'
    )
  })

  it('does not pair indexes that differ in anything but their name', async () => {
    const cases: Record<string, Row[]> = {
      'sort direction': [
        index('t', 'a', keys('x')),
        index('t', 'b', JSON.stringify([{ name: 'x', desc: true }]))
      ],
      'column order': [index('t', 'a', keys('x', 'y')), index('t', 'b', keys('y', 'x'))],
      'a leading prefix': [index('t', 'a', keys('x')), index('t', 'b', keys('x', 'y'))],
      'included columns': [
        index('t', 'a', keys('x')),
        index('t', 'b', keys('x'), { includes: keys('y') })
      ],
      uniqueness: [index('t', 'a', keys('x')), index('t', 'b', keys('x'), { unique: true })],
      filter: [
        index('t', 'a', keys('x')),
        index('t', 'b', keys('x'), { filter: '([x] IS NOT NULL)' })
      ],
      table: [index('t1', 'a', keys('x')), index('t2', 'a', keys('x'))]
    }
    for (const [what, indexes] of Object.entries(cases)) {
      const { pool } = fakePool({ indexes })
      const report = await runMssqlSchemaIntel(pool, ['duplicate_indexes'])
      expect(report.findings, what).toEqual([])
    }
  })

  it('pairs indexes whose included columns match in any order', () => {
    const findings = toDuplicateIndexFindings([
      index('t', 'a', keys('x'), { includes: keys('p', 'q') }),
      index('t', 'b', keys('x'), { includes: keys('p', 'q') })
    ])

    expect(findings[0].metadata?.includedColumns).toEqual(['p', 'q'])
    expect(findings[0].suggestedSql).toBe('DROP INDEX [b] ON [dbo].[t];')
  })

  it('quotes a bracket in a name and keeps a comma inside a column name', () => {
    const findings = toDuplicateIndexFindings([
      index('order]items', 'ix]1', keys('a,b')),
      index('order]items', 'ix]2', keys('a,b'))
    ])

    expect(findings[0].metadata?.columns).toEqual(['a,b'])
    expect(findings[0].suggestedSql).toBe('DROP INDEX [ix]]2] ON [dbo].[order]]items];')
  })

  it('leaves out an index whose column payload is unreadable', () => {
    // Two unreadable payloads must not pair up with each other.
    const findings = toDuplicateIndexFindings([
      index('t', 'a', ''),
      index('t', 'b', 'not json'),
      index('t', 'c', keys('x'))
    ])

    expect(findings).toEqual([])
  })
})

describe('SQL Server index column parsing', () => {
  it('keeps each column with its sort direction, in order', () => {
    expect(parseIndexColumns('[{"name":"a","desc":true},{"name":"b","desc":false}]')).toEqual([
      { name: 'a', desc: true },
      { name: 'b', desc: false }
    ])
  })

  it('is tolerant of NULL, empty and junk payloads', () => {
    expect(parseIndexColumns(null)).toEqual([])
    expect(parseIndexColumns('')).toEqual([])
    expect(parseIndexColumns('not json')).toEqual([])
    expect(parseIndexColumns('[{"other":1},{"name":"a"}]')).toEqual([{ name: 'a', desc: false }])
  })
})

function unused(table: string, name: string, keyColumns: string, userUpdates: number): Row {
  return {
    schema_name: 'dbo',
    table_name: table,
    index_name: name,
    user_updates: userUpdates,
    last_user_update: new Date('2026-10-07T08:00:00Z'),
    key_columns_json: keyColumns
  }
}

describe('SQL Server unused_indexes', () => {
  it('is offered on SQL Server connections and runs by default', async () => {
    const check = SCHEMA_INTEL_CHECKS.find((c) => c.id === 'unused_indexes')
    expect(check?.supportedDbTypes).toContain('mssql')

    const { pool } = fakePool({ unusedIndexes: [unused('orders', 'ix_status', keys('status'), 5)] })
    const report = await runMssqlSchemaIntel(pool)

    expect(report.findings.map((f) => f.checkId)).toContain('unused_indexes')
  })

  it('reports an index that is written but never read, with the statement that drops it', async () => {
    const { pool } = fakePool({
      unusedIndexes: [unused('orders', 'ix_orders_status', keys('status'), 1204)]
    })

    const report = await runMssqlSchemaIntel(pool, ['unused_indexes'])

    expect(report.skipped).toEqual([])
    expect(report.findings).toEqual([
      expect.objectContaining({
        checkId: 'unused_indexes',
        severity: 'info',
        title: 'dbo.orders.ix_orders_status has no recorded reads',
        entity: { schema: 'dbo', name: 'ix_orders_status', kind: 'index' },
        metadata: {
          table: 'orders',
          columns: ['status'],
          userUpdates: 1204,
          lastUserUpdate: '2026-10-07T08:00:00.000Z'
        },
        suggestedSql: 'DROP INDEX [ix_orders_status] ON [dbo].[orders];'
      })
    ])
    expect(report.findings[0].detail).toContain('Written 1204 times')
  })

  it('asks only for nonclustered, non-unique indexes with writes and no reads here', async () => {
    const { pool, asked } = fakePool({})

    await runMssqlSchemaIntel(pool, ['unused_indexes'])

    const [query] = asked
    expect(query).toContain('sys.dm_db_index_usage_stats')
    expect(query).toContain('u.database_id = DB_ID()')
    expect(query).toContain('i.type = 2')
    expect(query).toContain('i.is_primary_key = 0')
    expect(query).toContain('i.is_unique = 0')
    expect(query).toContain('u.user_seeks + u.user_scans + u.user_lookups = 0')
    expect(query).toContain('u.user_updates > 0')
  })

  it('is skipped, with the reason, when the login lacks VIEW SERVER STATE', async () => {
    const denied = new Error('The user does not have permission to perform this action.')
    const { pool } = fakePool({ denied })

    const report = await runMssqlSchemaIntel(pool, ['unused_indexes'])

    expect(report.findings).toEqual([])
    expect(report.skipped).toEqual([{ checkId: 'unused_indexes', reason: denied.message }])
  })

  it('quotes a bracket in a name', () => {
    const [finding] = toUnusedIndexFindings([unused('order]items', 'ix]old', keys('x'), 3)])

    expect(finding.suggestedSql).toBe('DROP INDEX [ix]]old] ON [dbo].[order]]items];')
  })

  it('tolerates a usage row without a timestamp or column payload', () => {
    const [finding] = toUnusedIndexFindings([
      {
        schema_name: 'dbo',
        table_name: 't',
        index_name: 'ix',
        user_updates: '7',
        last_user_update: null,
        key_columns_json: null
      }
    ])

    expect(finding.metadata).toEqual({ table: 't', columns: [], userUpdates: 7 })
    expect(finding.detail).toContain('Written 7 times')
  })
})
