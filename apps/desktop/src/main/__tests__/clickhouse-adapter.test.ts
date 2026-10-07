import https from 'https'
import tls from 'tls'
import { describe, it, expect, vi } from 'vitest'
import type { ConnectionConfig } from '@shared/index'

vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('../ssh-tunnel-service', () => ({
  createTunnel: vi.fn(),
  closeTunnel: vi.fn(),
  TunnelSession: class {}
}))
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, readFileSync: vi.fn(() => Buffer.from('CA_CERT_CONTENT')) }
})

import {
  classifyStatement,
  columnDefault,
  hasTrailingFormatClause,
  isNullableType,
  mapPartsRows,
  mapSystemRows,
  parseEnumValues,
  rowCountFromSummary,
  stripLeading,
  tableTypeFromEngine,
  timeoutSettings,
  toQueryFields,
  toStatementResult,
  toTextPlan,
  type SystemColumnRow,
  type SystemTableRow
} from '../adapters/clickhouse-mapping'
import {
  assertHttpPort,
  clickhouseUrl,
  toClickHouseClientConfig
} from '../adapters/clickhouse-client-config'
import { ClickHouseAdapter } from '../adapters/clickhouse-adapter'

function makeConfig(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    id: 'ch1',
    name: 'test-ch',
    host: 'ch.example.com',
    port: 8123,
    database: 'acme',
    user: 'u',
    password: 'p',
    dbType: 'clickhouse',
    dstPort: 8123,
    ...overrides
  }
}

describe('classifyStatement', () => {
  it.each([
    ['SELECT 1', 'query'],
    ['  with x as (select 1) select * from x', 'query'],
    ['SHOW TABLES', 'query'],
    ['DESCRIBE t', 'query'],
    ['DESC t', 'query'],
    ['EXPLAIN SELECT 1', 'query'],
    ['EXISTS TABLE t', 'query'],
    ['(SELECT 1)', 'query'],
    ['-- leading comment\nSELECT 1', 'query'],
    ['# hash comment\n/* block */ SELECT 1', 'query'],
    ['INSERT INTO t SELECT * FROM u', 'command'],
    ['CREATE TABLE t (x UInt8) ENGINE = MergeTree ORDER BY x', 'command'],
    ['SET max_threads = 1', 'command'],
    ['USE other', 'command'],
    ['OPTIMIZE TABLE t FINAL', 'command'],
    ['KILL QUERY WHERE 1', 'command'],
    ['ALTER TABLE t UPDATE x = 1 WHERE 1', 'command'],
    ['', 'command']
  ])('%s -> %s', (sql, kind) => {
    expect(classifyStatement(sql)).toBe(kind)
  })

  it('stripLeading removes comments and parens but keeps the statement', () => {
    expect(stripLeading(' /* a */ -- b\n # c\n (SELECT 1')).toBe('SELECT 1')
  })
})

describe('hasTrailingFormatClause', () => {
  it('detects a user-written FORMAT at the end', () => {
    expect(hasTrailingFormatClause('SELECT 1 FORMAT JSONEachRow')).toBe(true)
    expect(hasTrailingFormatClause('SELECT 1 format TSV ;')).toBe(true)
  })
  it('ignores format functions and columns named format', () => {
    expect(hasTrailingFormatClause('SELECT formatDateTime(now(), %Y) AS format')).toBe(false)
    expect(hasTrailingFormatClause('SELECT 1')).toBe(false)
  })
})

describe('result mapping', () => {
  it('maps meta to fields with the raw ClickHouse type', () => {
    expect(toQueryFields([{ name: 'n', type: 'Nullable(UInt64)' }])).toEqual([
      { name: 'n', dataType: 'Nullable(UInt64)' }
    ])
    expect(toQueryFields(undefined)).toEqual([])
  })

  it('keeps 64-bit integers as the strings the server sent', () => {
    const result = toStatementResult(
      'SELECT big',
      2,
      { meta: [{ name: 'big', type: 'UInt64' }], data: [{ big: '18446744073709551615' }], rows: 1 },
      7
    )
    expect(result).toEqual({
      statement: 'SELECT big',
      statementIndex: 2,
      rows: [{ big: '18446744073709551615' }],
      fields: [{ name: 'big', dataType: 'UInt64' }],
      rowCount: 1,
      durationMs: 7,
      isDataReturning: true
    })
  })

  it('throws when the server embedded an exception in a 200 body', () => {
    expect(() =>
      toStatementResult('SELECT 1', 0, { data: [], exception: 'Code: 159. Timeout exceeded' }, 1)
    ).toThrow('Timeout exceeded')
  })

  it('reads written_rows from the summary and falls back to 0', () => {
    expect(rowCountFromSummary({ written_rows: '42' })).toBe(42)
    expect(rowCountFromSummary(undefined)).toBe(0)
    expect(rowCountFromSummary({})).toBe(0)
  })

  it('converts a millisecond timeout to whole seconds and throw mode', () => {
    expect(timeoutSettings(1500)).toEqual({ max_execution_time: 2, timeout_overflow_mode: 'throw' })
    expect(timeoutSettings(0)).toEqual({})
    expect(timeoutSettings(undefined)).toEqual({})
  })

  it('builds a text plan from explain rows', () => {
    expect(toTextPlan([{ explain: 'Expression' }, { explain: '  ReadFromMergeTree' }])).toEqual({
      kind: 'text',
      lines: ['Expression', '  ReadFromMergeTree']
    })
  })
})

describe('type parsing', () => {
  it('detects Nullable, also under LowCardinality', () => {
    expect(isNullableType('Nullable(String)')).toBe(true)
    expect(isNullableType('LowCardinality(Nullable(String))')).toBe(true)
    expect(isNullableType('Array(Nullable(String))')).toBe(false)
    expect(isNullableType('String')).toBe(false)
  })

  it('parses enum labels, including escaped quotes and Nullable wrappers', () => {
    expect(parseEnumValues("Enum8('free' = 1, 'pro' = 2)")).toEqual(['free', 'pro'])
    expect(parseEnumValues("Nullable(Enum16('a' = -1, 'it\\'s' = 2))")).toEqual(['a', "it's"])
    expect(parseEnumValues('String')).toBeUndefined()
  })

  it('maps engines to table types', () => {
    expect(tableTypeFromEngine('MaterializedView')).toBe('materialized_view')
    expect(tableTypeFromEngine('View')).toBe('view')
    expect(tableTypeFromEngine('LiveView')).toBe('view')
    expect(tableTypeFromEngine('ReplacingMergeTree')).toBe('table')
  })

  it('keeps the default kind for non-DEFAULT expressions', () => {
    expect(columnDefault('DEFAULT', 'now()')).toBe('now()')
    expect(columnDefault('MATERIALIZED', 'toDate(ts)')).toBe('MATERIALIZED toDate(ts)')
    expect(columnDefault('', '')).toBeUndefined()
  })
})

describe('mapSystemRows', () => {
  const tables: SystemTableRow[] = [
    { database: 'other', name: 'z', engine: 'MergeTree', total_rows: '5' },
    { database: 'acme', name: 'events', engine: 'MergeTree', total_rows: '50000' },
    { database: 'acme', name: '.inner.hidden_mv', engine: 'MergeTree', total_rows: '1' },
    { database: 'acme', name: 'active', engine: 'View', total_rows: null },
    { database: 'acme', name: 'daily_mv', engine: 'MaterializedView', total_rows: null }
  ]
  const columns: SystemColumnRow[] = [
    {
      database: 'acme',
      table: 'events',
      name: 'ts',
      type: 'DateTime64(3)',
      position: '2',
      default_kind: '',
      default_expression: '',
      is_in_primary_key: 1,
      comment: ''
    },
    {
      database: 'acme',
      table: 'events',
      name: 'id',
      type: 'UUID',
      position: '1',
      default_kind: 'DEFAULT',
      default_expression: 'generateUUIDv4()',
      is_in_primary_key: 0,
      comment: ''
    },
    {
      database: 'acme',
      table: 'events',
      name: 'plan',
      type: "LowCardinality(Nullable(Enum8('a' = 1)))",
      position: '3',
      default_kind: '',
      default_expression: '',
      is_in_primary_key: 0,
      comment: ''
    }
  ]

  it('puts the connection database first, hides inner tables, and types columns', () => {
    const schemas = mapSystemRows(tables, columns, 'acme')
    expect(schemas.map((s) => s.name)).toEqual(['acme', 'other'])
    const acme = schemas[0]
    expect(acme.tables.map((t) => [t.name, t.type])).toEqual([
      ['active', 'view'],
      ['daily_mv', 'materialized_view'],
      ['events', 'table']
    ])
    const events = acme.tables[2]
    expect(events.estimatedRowCount).toBe(50000)
    expect(events.columns.map((c) => c.name)).toEqual(['id', 'ts', 'plan'])
    expect(events.columns[1].isPrimaryKey).toBe(true)
    expect(events.columns[0].defaultValue).toBe('generateUUIDv4()')
    expect(events.columns[2].isNullable).toBe(true)
    expect(events.columns[2].enumValues).toEqual(['a'])
    expect(acme.tables[0].estimatedRowCount).toBeUndefined()
  })
})

describe('mapPartsRows', () => {
  it('takes bytes_on_disk as the total and carves the index bytes out of it', () => {
    const [row] = mapPartsRows([
      {
        database: 'acme',
        table: 'events',
        rows: '50000',
        bytes_on_disk: '1348962',
        index_bytes: '517'
      }
    ])
    expect(row).toMatchObject({
      schema: 'acme',
      rowCountEstimate: 50000,
      totalSizeBytes: 1348962,
      indexSizeBytes: 517,
      dataSizeBytes: 1348445,
      dataSize: '1.3 MB',
      indexSize: '517 bytes'
    })
  })
})

describe('toClickHouseClientConfig', () => {
  it('builds an http url with the HTTP port and quotes 64-bit numbers', () => {
    const cfg = toClickHouseClientConfig(makeConfig())
    expect(cfg.url).toBe('http://ch.example.com:8123')
    expect(cfg.username).toBe('u')
    expect(cfg.database).toBe('acme')
    expect(cfg.clickhouse_settings?.output_format_json_quote_64bit_integers).toBe(1)
    expect(cfg.tls).toBeUndefined()
  })

  it('uses https and the CA when ssl is on', () => {
    const cfg = toClickHouseClientConfig(
      makeConfig({ ssl: true, sslOptions: { ca: '/path/ca.pem' } })
    )
    expect(cfg.url).toBe('https://ch.example.com:8123')
    expect(cfg.tls?.ca_cert.toString()).toBe('CA_CERT_CONTENT')
  })

  it('switches to a permissive agent when verification is turned off', () => {
    const cfg = toClickHouseClientConfig(
      makeConfig({ ssl: true, sslOptions: { rejectUnauthorized: false } })
    )
    expect(cfg.http_agent).toBeDefined()
    expect(cfg.tls).toBeUndefined()
  })

  it('points at the SSH tunnel endpoint when overrides are given', () => {
    const cfg = toClickHouseClientConfig(makeConfig(), { host: '127.0.0.1', port: 54321 })
    expect(cfg.url).toBe('http://127.0.0.1:54321')
  })

  it('verifies TLS against the real host through a tunnel, with or without a CA', () => {
    const tunnel = { host: '127.0.0.1', port: 54321 }
    const withCa = toClickHouseClientConfig(
      makeConfig({ ssl: true, sslOptions: { ca: '/path/ca.pem' } }),
      tunnel
    )
    const withoutCa = toClickHouseClientConfig(makeConfig({ ssl: true }), tunnel)

    const withCaOptions = (withCa.http_agent as https.Agent | undefined)?.options
    expect(withCa.url).toBe('https://127.0.0.1:54321')
    expect(withCaOptions).toMatchObject({ servername: 'ch.example.com', rejectUnauthorized: true })
    expect(withCaOptions?.ca?.toString()).toBe('CA_CERT_CONTENT')
    expect((withoutCa.http_agent as https.Agent | undefined)?.options).toMatchObject({
      servername: 'ch.example.com',
      rejectUnauthorized: true
    })
  })

  it('keeps verification off through a tunnel when the user turned it off', () => {
    const cfg = toClickHouseClientConfig(
      makeConfig({ ssl: true, sslOptions: { rejectUnauthorized: false } }),
      { host: '127.0.0.1', port: 54321 }
    )
    expect((cfg.http_agent as https.Agent | undefined)?.options).toMatchObject({
      servername: 'ch.example.com',
      rejectUnauthorized: false
    })
  })

  it('sets no servername without a tunnel or when the real host is an IP', () => {
    const direct = toClickHouseClientConfig(
      makeConfig({ ssl: true, sslOptions: { ca: '/path/ca.pem' } })
    )
    const tunnelledIp = toClickHouseClientConfig(makeConfig({ host: '10.0.0.5', ssl: true }), {
      host: '127.0.0.1',
      port: 54321
    })
    expect(direct.http_agent).toBeUndefined()
    expect((tunnelledIp.http_agent as https.Agent | undefined)?.options.servername).toBeUndefined()
  })

  it('checks the certificate against the real host through a tunnel, IP or hostname', () => {
    const tunnel = { host: '127.0.0.1', port: 54321 }
    const identityCheck = (
      host: string
    ): NonNullable<tls.ConnectionOptions['checkServerIdentity']> => {
      const cfg = toClickHouseClientConfig(makeConfig({ host, ssl: true }), tunnel)
      const check = (cfg.http_agent as https.Agent | undefined)?.options.checkServerIdentity
      expect(check).toBeTypeOf('function')
      return check!
    }
    const cert = (subjectaltname: string): tls.PeerCertificate =>
      ({ subject: { CN: '' }, subjectaltname }) as unknown as tls.PeerCertificate

    const ipCheck = identityCheck('10.0.0.5')
    expect(ipCheck('127.0.0.1', cert('IP Address:10.0.0.5'))).toBeUndefined()
    expect(ipCheck('127.0.0.1', cert('IP Address:10.0.0.6'))).toBeInstanceOf(Error)

    const hostCheck = identityCheck('ch.example.com')
    expect(hostCheck('127.0.0.1', cert('DNS:ch.example.com'))).toBeUndefined()
    expect(hostCheck('127.0.0.1', cert('DNS:other.example.com'))).toBeInstanceOf(Error)
  })

  it('defaults user and database', () => {
    const cfg = toClickHouseClientConfig(makeConfig({ user: '', database: '' }))
    expect(cfg.username).toBe('default')
    expect(cfg.database).toBe('default')
  })

  it('refuses the native ports with a hint about the HTTP interface', () => {
    expect(() => toClickHouseClientConfig(makeConfig({ port: 9000 }))).toThrow(
      /native port.*HTTP interface, usually 8123 or 8443/
    )
    expect(() => assertHttpPort(9440)).toThrow(/9440/)
    expect(() => assertHttpPort(8443)).not.toThrow()
    expect(clickhouseUrl('h', 8443, true)).toBe('https://h:8443')
  })
})

describe('ClickHouseAdapter backstops', () => {
  const adapter = new ClickHouseAdapter()
  const config = makeConfig()

  it('throws the capability message for gated operations', async () => {
    await expect(adapter.executeTransaction()).rejects.toThrow(
      'Transaction support is not available for ClickHouse connections.'
    )
    await expect(adapter.execute(config, 'INSERT INTO t VALUES (?)', [1])).rejects.toThrow(
      'Inline editing is not available for ClickHouse connections.'
    )
    await expect(adapter.getCacheStats()).rejects.toThrow('Cache monitoring')
    await expect(adapter.getLocks()).rejects.toThrow('Lock monitoring')
    await expect(adapter.killQuery()).rejects.toThrow('Kill query')
    await expect(adapter.getColumnStats()).rejects.toThrow('Column profiling')
    await expect(adapter.getActiveQueries()).rejects.toThrow('Active query monitoring')
    await expect(adapter.queryMultiple(config, 'SELECT 1', { sessionId: 's' })).rejects.toThrow(
      'Transaction support'
    )
  })

  it('reports every requested Schema Intel check as skipped', async () => {
    const report = await adapter.runSchemaIntel(config, ['tables_without_pk', 'unused_indexes'])
    expect(report.findings).toEqual([])
    expect(report.skipped.map((s) => s.checkId)).toEqual(['tables_without_pk', 'unused_indexes'])
    expect(report.skipped[0].reason).toMatch(/not available for ClickHouse/)
    const all = await adapter.runSchemaIntel(config)
    expect(all.skipped.length).toBeGreaterThan(2)
  })

  it('returns empty sequences and types', async () => {
    await expect(adapter.getSequences()).resolves.toEqual([])
    await expect(adapter.getTypes()).resolves.toEqual([])
  })
})
