import { describe, it, expect } from 'vitest'
import type sql from 'mssql'
import { SCHEMA_INTEL_CHECKS } from '@shared/index'
import {
  parseFkColumns,
  runMssqlSchemaIntel,
  suggestIndexName,
  toMissingFkIndexFindings
} from '../schema-intel/mssql'

type Row = Record<string, unknown>

interface Server {
  tablesWithoutPk?: Row[]
  fkIndexes?: Row[]
  nullableFks?: Row[]
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
