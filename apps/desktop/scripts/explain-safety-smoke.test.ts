// Live smoke test: Explain must never change data, even for writes and multi-statement buffers.
// Not part of `pnpm test`. Run with: pnpm --filter @data-peek/desktop smoke:explain
//
// Start the databases first. The env defaults below match these containers:
//   docker run -d --rm -e POSTGRES_PASSWORD=smoketest -e POSTGRES_DB=acme -p 55432:5432 postgres:16-alpine
//   docker run -d --rm -e MYSQL_ROOT_PASSWORD=smoketest -e MYSQL_DATABASE=acme -p 53306:3306 mysql:8.4
//   docker run -d --rm --platform linux/amd64 -e ACCEPT_EULA=Y -e 'MSSQL_SA_PASSWORD=Smoke_test1!' \
//     -p 51433:1433 mcr.microsoft.com/mssql/server:2022-latest   (then CREATE DATABASE acme)
//
//   PGHOST=localhost PGPORT=55432 PGUSER=postgres PGPASSWORD=smoketest PGDATABASE=acme
//   MYSQL_HOST=localhost MYSQL_PORT=53306 MYSQL_USER=root MYSQL_PASSWORD=smoketest MYSQL_DATABASE=acme
//   MSSQL_HOST=localhost MSSQL_PORT=51433 MSSQL_USER=sa MSSQL_PASSWORD='Smoke_test1!' MSSQL_DATABASE=acme
import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest'
import type { ConnectionConfig } from '@shared/index'

vi.mock('../src/main/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

const { PostgresAdapter } = await import('../src/main/adapters/postgres-adapter')
const { MySQLAdapter } = await import('../src/main/adapters/mysql-adapter')
const { closeAllPgPools, withPgClient } = await import('../src/main/adapters/pg-pool-manager')
const { closeAllMySQLPools, withMySQLConnection } =
  await import('../src/main/adapters/mysql-pool-manager')
const { MSSQLAdapter } = await import('../src/main/adapters/mssql-adapter')
const { closeAllMSSQLPools, withMSSQLPool } =
  await import('../src/main/adapters/mssql-pool-manager')

const pg: ConnectionConfig = {
  id: 'smoke-explain-pg',
  name: 'smoke-explain-pg',
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 55432),
  database: process.env.PGDATABASE ?? 'acme',
  user: process.env.PGUSER ?? 'postgres',
  password: process.env.PGPASSWORD ?? 'smoketest',
  dbType: 'postgresql',
  dstPort: Number(process.env.PGPORT ?? 55432)
}

const my: ConnectionConfig = {
  id: 'smoke-explain-mysql',
  name: 'smoke-explain-mysql',
  host: process.env.MYSQL_HOST ?? 'localhost',
  port: Number(process.env.MYSQL_PORT ?? 53306),
  database: process.env.MYSQL_DATABASE ?? 'acme',
  user: process.env.MYSQL_USER ?? 'root',
  password: process.env.MYSQL_PASSWORD ?? 'smoketest',
  dbType: 'mysql',
  dstPort: Number(process.env.MYSQL_PORT ?? 53306)
}

const ms: ConnectionConfig = {
  id: 'smoke-explain-mssql',
  name: 'smoke-explain-mssql',
  host: process.env.MSSQL_HOST ?? 'localhost',
  port: Number(process.env.MSSQL_PORT ?? 51433),
  database: process.env.MSSQL_DATABASE ?? 'acme',
  user: process.env.MSSQL_USER ?? 'sa',
  password: process.env.MSSQL_PASSWORD ?? 'Smoke_test1!',
  dbType: 'mssql',
  dstPort: Number(process.env.MSSQL_PORT ?? 51433)
}

afterAll(async () => {
  await closeAllPgPools()
  await closeAllMySQLPools()
  await closeAllMSSQLPools()
})

type Run = (sql: string) => Promise<Array<Record<string, unknown>>>

const pgRun: Run = (sql) => withPgClient(pg, async (c) => (await c.query(sql)).rows)
const myRun: Run = (sql) =>
  withMySQLConnection(my, async (c) => (await c.query(sql))[0] as Array<Record<string, unknown>>)

const msRun: Run = (sql) =>
  withMSSQLPool(ms, async (p) => (await p.request().query(sql)).recordset ?? [])

const engines = [
  {
    name: 'postgresql',
    config: pg,
    adapter: new PostgresAdapter(),
    run: pgRun,
    plan: /"Plan"/,
    joinDelete: 'DELETE FROM explain_smoke e USING explain_smoke f WHERE e.id = f.id'
  },
  {
    name: 'mysql',
    config: my,
    adapter: new MySQLAdapter(),
    run: myRun,
    plan: /->|query_block/,
    joinDelete: 'DELETE e FROM explain_smoke e JOIN explain_smoke f ON e.id = f.id'
  },
  {
    name: 'mssql',
    config: ms,
    adapter: new MSSQLAdapter(),
    run: msRun,
    plan: /ShowPlanXML/,
    joinDelete: 'DELETE e FROM explain_smoke e JOIN explain_smoke f ON e.id = f.id'
  }
] as const

describe.each(engines)('explain on $name', ({ config, adapter, run, plan, joinDelete }) => {
  const count = async (): Promise<number> =>
    Number((await run('SELECT COUNT(*) AS n FROM explain_smoke'))[0].n)

  beforeEach(async () => {
    await run('DROP TABLE IF EXISTS explain_smoke')
    await run('CREATE TABLE explain_smoke (id INT PRIMARY KEY)')
    await run('INSERT INTO explain_smoke (id) VALUES (1), (2), (3)')
  })

  it('returns a plan for a DELETE without deleting rows', async () => {
    const result = await adapter.explain(config, 'DELETE FROM explain_smoke', true)
    expect(JSON.stringify(result.plan)).toMatch(plan)
    expect(await count()).toBe(3)
  })

  it('returns a plan for a multi-table DELETE without deleting rows', async () => {
    const result = await adapter.explain(config, joinDelete, true)
    expect(JSON.stringify(result.plan)).toMatch(plan)
    expect(await count()).toBe(3)
  })

  it('returns the plan, not the rows, when a column name contains "xml"', async () => {
    const result = await adapter.explain(config, 'SELECT id AS xml_id FROM explain_smoke', true)
    expect(JSON.stringify(result.plan)).toMatch(plan)
  })

  it('leaves rows intact for a semicolon-free batch that commits mid-way', async () => {
    const batch = 'SELECT 1\nCOMMIT\nDELETE FROM explain_smoke'
    await adapter.explain(config, batch, true).catch(() => undefined)
    expect(await count()).toBe(3)
  })

  it('refuses a multi-statement buffer and leaves rows intact', async () => {
    await expect(
      adapter.explain(config, 'SELECT 1; DELETE FROM explain_smoke', true)
    ).rejects.toThrow(/single statement/i)
    expect(await count()).toBe(3)
  })

  it.each([true, false])('returns a real plan for a SELECT (analyze=%s)', async (analyze) => {
    const result = await adapter.explain(
      config,
      'SELECT * FROM explain_smoke WHERE id = 1',
      analyze
    )
    expect(JSON.stringify(result.plan)).toMatch(plan)
  })
})
