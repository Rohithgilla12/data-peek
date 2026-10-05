import { describe, it, expect } from 'vitest'
import mysql from 'mysql2/promise'
import { SCHEMA_INTEL_CHECKS } from '@shared/index'
import { runMysqlSchemaIntel } from '../schema-intel/mysql'

type Row = Record<string, unknown>

interface Server {
  performanceSchema?: number
  instrumented?: string | null
  /** Throwing stands in for a server with no sys schema, or no right to read it. */
  sysView?: Row[] | Error
  indexUsage?: Row[]
  foreignKeys?: Row[]
}

/** A connection that answers the check's queries from canned rows. */
function connection(server: Server): { conn: mysql.Connection; asked: string[] } {
  const asked: string[] = []
  const conn = {
    query: async (sql: string) => {
      asked.push(sql)
      if (sql.includes('@@performance_schema')) {
        return [
          [
            {
              enabled: server.performanceSchema ?? 1,
              instrumented: server.instrumented === undefined ? 'YES' : server.instrumented
            }
          ]
        ]
      }
      if (sql.includes('sys.schema_unused_indexes')) {
        if (server.sysView instanceof Error) throw server.sysView
        return [server.sysView ?? []]
      }
      if (sql.includes('table_io_waits_summary_by_index_usage')) return [server.indexUsage ?? []]
      if (sql.includes('KEY_COLUMN_USAGE')) return [server.foreignKeys ?? []]
      throw new Error(`unexpected query: ${sql}`)
    }
  }
  return { conn: conn as unknown as mysql.Connection, asked }
}

/** `fkColumns` is what a foreign key can match: '' for a prefix or expression part. */
function unused(table: string, index: string, columns: string, fkColumns = columns): Row {
  return {
    schema_name: 'shop',
    table_name: table,
    index_name: index,
    columns,
    fk_columns: fkColumns
  }
}

function foreignKey(table: string, columns: string, parent: string, parentColumns: string): Row {
  return {
    schema_name: 'shop',
    table_name: table,
    columns,
    referenced_schema_name: 'shop',
    referenced_table_name: parent,
    referenced_columns: parentColumns
  }
}

describe('MySQL unused_indexes', () => {
  it('is offered on MySQL connections and runs by default', async () => {
    const check = SCHEMA_INTEL_CHECKS.find((c) => c.id === 'unused_indexes')
    expect(check?.supportedDbTypes).toContain('mysql')

    const { conn } = connection({ sysView: [unused('customers', 'idx_nick', 'nick')] })
    const report = await runMysqlSchemaIntel(conn, 'shop')

    expect(report.findings.map((f) => f.checkId)).toContain('unused_indexes')
  })

  it('reports an index nothing has read, with the statement that drops it', async () => {
    const { conn } = connection({ sysView: [unused('customers', 'idx_nick', 'nick')] })

    const report = await runMysqlSchemaIntel(conn, 'shop', ['unused_indexes'])

    expect(report.skipped).toEqual([])
    expect(report.findings).toEqual([
      expect.objectContaining({
        checkId: 'unused_indexes',
        severity: 'info',
        title: 'shop.customers.idx_nick has no recorded reads',
        entity: { schema: 'shop', name: 'idx_nick', kind: 'index' },
        metadata: { table: 'customers', columns: ['nick'] },
        suggestedSql: 'ALTER TABLE `shop`.`customers` DROP INDEX `idx_nick`;'
      })
    ])
  })

  it('quotes a backtick in a name', async () => {
    const { conn } = connection({ sysView: [unused('odd`table', 'odd`index', 'a')] })

    const report = await runMysqlSchemaIntel(conn, 'shop', ['unused_indexes'])

    expect(report.findings[0].suggestedSql).toBe(
      'ALTER TABLE `shop`.`odd``table` DROP INDEX `odd``index`;'
    )
  })

  it('leaves out an index a foreign key needs', async () => {
    // MySQL refuses to drop it (error 1553), and InnoDB's own lookups through
    // it are not counted as reads, so "never read" says nothing about it.
    const { conn } = connection({
      sysView: [
        unused('orders', 'fk_orders_customer', 'customer_id'),
        unused('orders', 'idx_customer_note', 'customer_id,note'),
        unused('orders', 'idx_note_customer', 'note,customer_id'),
        unused('orders', 'idx_note', 'note')
      ],
      foreignKeys: [foreignKey('orders', 'customer_id', 'customers', 'id')]
    })

    const report = await runMysqlSchemaIntel(conn, 'shop', ['unused_indexes'])

    // An index serves a foreign key only when the key's columns lead it.
    expect(report.findings.map((f) => f.entity?.name)).toEqual(['idx_note_customer', 'idx_note'])
  })

  it('leaves out an index a foreign key points at', async () => {
    // InnoDB lets a foreign key reference a non-unique index on the parent.
    const { conn } = connection({
      sysView: [unused('regions', 'idx_code', 'code'), unused('regions', 'idx_name', 'name')],
      foreignKeys: [foreignKey('stores', 'region_code', 'regions', 'code')]
    })

    const report = await runMysqlSchemaIntel(conn, 'shop', ['unused_indexes'])

    expect(report.findings.map((f) => f.entity?.name)).toEqual(['idx_name'])
  })

  it('needs every column of a composite foreign key, in order', async () => {
    const { conn } = connection({
      sysView: [
        unused('lines', 'idx_order_sku', 'order_id,sku'),
        unused('lines', 'idx_sku_order', 'sku,order_id'),
        unused('lines', 'idx_order', 'order_id')
      ],
      foreignKeys: [foreignKey('lines', 'order_id,sku', 'order_skus', 'order_id,sku')]
    })

    const report = await runMysqlSchemaIntel(conn, 'shop', ['unused_indexes'])

    expect(report.findings.map((f) => f.entity?.name)).toEqual(['idx_sku_order', 'idx_order'])
  })

  it('leaves out an index that starts the columns a foreign key points at', async () => {
    // InnoDB ends every secondary index with the clustered key, so (code)
    // serves a key that references (code, id), and MySQL refuses to drop it.
    const { conn } = connection({
      sysView: [unused('codes', 'idx_code', 'code'), unused('codes', 'idx_other', 'other')],
      foreignKeys: [foreignKey('code_uses', 'code,code_id', 'codes', 'code,id')]
    })

    const report = await runMysqlSchemaIntel(conn, 'shop', ['unused_indexes'])

    expect(report.findings.map((f) => f.entity?.name)).toEqual(['idx_other'])
  })

  it('does not extend that to the table the foreign key is declared on', async () => {
    // There MySQL builds its own index over every column of the key.
    const { conn } = connection({
      sysView: [unused('code_uses', 'idx_code', 'code')],
      foreignKeys: [foreignKey('code_uses', 'code,code_id', 'codes', 'code,id')]
    })

    const report = await runMysqlSchemaIntel(conn, 'shop', ['unused_indexes'])

    expect(report.findings.map((f) => f.entity?.name)).toEqual(['idx_code'])
  })

  it('reports a prefix index on a foreign key column', async () => {
    // A prefix part cannot serve a foreign key, so MySQL keeps another index
    // for it and this one can go.
    const { conn } = connection({
      sysView: [unused('taggings', 'idx_label_prefix', 'label', '')],
      foreignKeys: [foreignKey('taggings', 'label', 'tags', 'label')]
    })

    const report = await runMysqlSchemaIntel(conn, 'shop', ['unused_indexes'])

    expect(report.findings.map((f) => [f.entity?.name, f.metadata?.columns])).toEqual([
      ['idx_label_prefix', ['label']]
    ])
  })

  it('is not put off by a foreign key on another table', async () => {
    const { conn } = connection({
      sysView: [unused('orders', 'idx_customer', 'customer_id')],
      foreignKeys: [foreignKey('invoices', 'customer_id', 'customers', 'id')]
    })

    const report = await runMysqlSchemaIntel(conn, 'shop', ['unused_indexes'])

    expect(report.findings.map((f) => f.entity?.name)).toEqual(['idx_customer'])
  })

  it('is not put off by a foreign key on a table of the same name elsewhere', async () => {
    const { conn } = connection({
      sysView: [unused('orders', 'idx_customer', 'customer_id')],
      foreignKeys: [
        {
          ...foreignKey('orders', 'customer_id', 'customers', 'id'),
          schema_name: 'archive',
          referenced_schema_name: 'archive'
        }
      ]
    })

    const report = await runMysqlSchemaIntel(conn, 'shop', ['unused_indexes'])

    expect(report.findings.map((f) => f.entity?.name)).toEqual(['idx_customer'])
  })

  it('does not take an expression key part for a column', async () => {
    // MySQL lists an expression part with no column name, and such an index
    // cannot serve a foreign key on the column after it.
    const { conn } = connection({
      sysView: [unused('orders', 'idx_expr', ',customer_id', ',customer_id')],
      foreignKeys: [foreignKey('orders', 'customer_id', 'customers', 'id')]
    })

    const report = await runMysqlSchemaIntel(conn, 'shop', ['unused_indexes'])

    expect(report.findings.map((f) => f.metadata)).toEqual([
      { table: 'orders', columns: ['customer_id'] }
    ])
  })

  it('reads performance_schema itself when the sys view cannot be read', async () => {
    const { conn, asked } = connection({
      sysView: new Error(
        "SELECT command denied to user 'app'@'%' for table 'schema_unused_indexes'"
      ),
      indexUsage: [unused('customers', 'idx_nick', 'nick')]
    })

    const report = await runMysqlSchemaIntel(conn, 'shop', ['unused_indexes'])

    expect(report.skipped).toEqual([])
    expect(report.findings.map((f) => f.entity?.name)).toEqual(['idx_nick'])
    expect(asked.some((sql) => sql.includes('table_io_waits_summary_by_index_usage'))).toBe(true)
  })

  it('skips the check when performance_schema is off, and says why', async () => {
    // Off, both sources answer with no rows and no error, which would read as
    // "every index is used".
    const { conn } = connection({ performanceSchema: 0, instrumented: null })

    const report = await runMysqlSchemaIntel(conn, 'shop', ['unused_indexes'])

    expect(report.findings).toEqual([])
    expect(report.skipped).toEqual([
      { checkId: 'unused_indexes', reason: expect.stringContaining('performance_schema is off') }
    ])
  })

  it('skips the check when table reads are not instrumented', async () => {
    const { conn } = connection({ performanceSchema: 1, instrumented: 'NO' })

    const report = await runMysqlSchemaIntel(conn, 'shop', ['unused_indexes'])

    expect(report.findings).toEqual([])
    expect(report.skipped).toEqual([
      { checkId: 'unused_indexes', reason: expect.stringContaining('wait/io/table/sql/handler') }
    ])
  })
})

// Against real servers, since a canned connection cannot say whether the SQL
// is right. Opt in with, for example:
//   docker run -d -e MYSQL_ROOT_PASSWORD=pw -p 3317:3306 mysql:8.4
//   MYSQL_SCHEMA_INTEL_URL=mysql://root:pw@127.0.0.1:3317 pnpm test mysql-schema-intel
const url = process.env.MYSQL_SCHEMA_INTEL_URL
const offUrl = process.env.MYSQL_SCHEMA_INTEL_NO_PS_URL

describe.skipIf(!url)('MySQL unused_indexes on a real server', () => {
  const database = 'schema_intel_unused'
  const elsewhere = 'schema_intel_elsewhere'
  const dropBoth = `DROP DATABASE IF EXISTS ${database}; DROP DATABASE IF EXISTS ${elsewhere};`

  async function seeded(): Promise<mysql.Connection> {
    const conn = await mysql.createConnection({ uri: url as string, multipleStatements: true })
    await conn.query(`
      ${dropBoth}
      CREATE DATABASE ${elsewhere};
      CREATE TABLE ${elsewhere}.warehouses (id INT PRIMARY KEY);
      CREATE DATABASE ${database};
      USE ${database};
      CREATE TABLE customers (
        id INT PRIMARY KEY,
        email VARCHAR(100) NOT NULL,
        city VARCHAR(50),
        nick VARCHAR(50),
        UNIQUE KEY uq_email (email),
        KEY idx_city (city),
        KEY idx_nick (nick)
      );
      CREATE TABLE orders (
        id INT PRIMARY KEY,
        customer_id INT NOT NULL,
        note VARCHAR(20),
        CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
      );
      CREATE TABLE shipments (
        id INT PRIMARY KEY,
        warehouse_id INT NOT NULL,
        CONSTRAINT fk_shipments_warehouse FOREIGN KEY (warehouse_id)
          REFERENCES ${elsewhere}.warehouses (id)
      );
      INSERT INTO customers VALUES (1, 'a@x', 'Austin', 'aa'), (2, 'b@x', 'Boston', 'bb');
      INSERT INTO orders VALUES (1, 1, 'x'), (2, 2, 'y');
      SELECT COUNT(*) FROM customers FORCE INDEX (idx_city) WHERE city = 'Austin';
    `)
    return conn
  }

  it('reports only the plain index nothing has read', async () => {
    const conn = await seeded()
    try {
      const report = await runMysqlSchemaIntel(conn, database, ['unused_indexes'])

      expect(report.skipped).toEqual([])
      // Not PRIMARY, not the unique index, not the one a query read, and not
      // the two a foreign key needs, one of them to a table in another schema.
      expect(report.findings.map((f) => `${f.metadata?.table}.${f.entity?.name}`)).toEqual([
        'customers.idx_nick'
      ])

      // The suggested statement runs. ALTER TABLE restarts the table's counts,
      // so the index a query had read is listed until something reads it again.
      await conn.query(report.findings[0].suggestedSql as string)
      const after = await runMysqlSchemaIntel(conn, database, ['unused_indexes'])
      expect(after.findings.map((f) => f.entity?.name)).toEqual(['idx_city'])
      await conn.query(
        "SELECT COUNT(*) FROM customers FORCE INDEX (idx_city) WHERE city = 'Austin'"
      )
      const settled = await runMysqlSchemaIntel(conn, database, ['unused_indexes'])
      expect(settled.findings).toEqual([])
    } finally {
      await conn.query(dropBoth)
      await conn.end()
    }
  })

  it('reports an expression index beside the one its foreign key needs', async (ctx) => {
    const conn = await seeded()
    try {
      try {
        await conn.query(`
          CREATE TABLE notes (
            id INT PRIMARY KEY,
            customer_id INT NOT NULL,
            body VARCHAR(20),
            KEY idx_expr ((LOWER(body)), customer_id),
            CONSTRAINT fk_notes_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
          )
        `)
      } catch {
        // MariaDB has no expression key parts.
        ctx.skip()
      }

      const report = await runMysqlSchemaIntel(conn, database, ['unused_indexes'])

      const notes = report.findings.filter((f) => f.metadata?.table === 'notes')
      expect(notes.map((f) => [f.entity?.name, f.metadata?.columns])).toEqual([
        ['idx_expr', ['customer_id']]
      ])
      await conn.query(notes[0].suggestedSql as string)
    } finally {
      await conn.query(dropBoth)
      await conn.end()
    }
  })

  it('keeps what a foreign key leans on and what the counters cannot see', async () => {
    const conn = await seeded()
    try {
      // MySQL 8.4 refuses a foreign key to a non-unique index unless told
      // otherwise; MariaDB has no such switch.
      await conn.query('SET SESSION restrict_fk_on_non_standard_key = OFF').catch(() => {})
      await conn.query(`
        CREATE TABLE codes (
          id INT NOT NULL,
          code VARCHAR(20) NOT NULL,
          PRIMARY KEY (id),
          KEY idx_code (code)
        );
        CREATE TABLE code_uses (
          id INT PRIMARY KEY,
          code VARCHAR(20),
          code_id INT,
          CONSTRAINT fk_code_uses FOREIGN KEY (code, code_id) REFERENCES codes (code, id)
        );
        CREATE TABLE tags (id INT PRIMARY KEY, label VARCHAR(100), KEY idx_label (label));
        CREATE TABLE taggings (
          id INT PRIMARY KEY,
          label VARCHAR(100),
          KEY idx_label_prefix (label(10)),
          CONSTRAINT fk_taggings FOREIGN KEY (label) REFERENCES tags (label)
        );
        CREATE TABLE docs (id INT PRIMARY KEY, body TEXT, FULLTEXT KEY ft_body (body));
        INSERT INTO docs VALUES (1, 'hello world'), (2, 'unused index check'), (3, 'a third row');
        SELECT COUNT(*) FROM docs WHERE MATCH (body) AGAINST ('hello');
      `)
      // (code) serves the key to (code, id) through the primary key InnoDB
      // appends, so the server will not let it go.
      await expect(conn.query('ALTER TABLE codes DROP INDEX idx_code')).rejects.toThrow(
        /needed in a foreign key constraint/
      )

      const report = await runMysqlSchemaIntel(conn, database, ['unused_indexes'])

      // Of these tables' six plain indexes only the prefix one is reported:
      // not the two a key points at, not the two MySQL built for the keys, and
      // not the full-text index, whose reads performance_schema never counts.
      const mine = ['codes', 'code_uses', 'tags', 'taggings', 'docs']
      const reported = report.findings.filter((f) => mine.includes(String(f.metadata?.table)))
      expect(reported.map((f) => `${f.metadata?.table}.${f.entity?.name}`)).toEqual([
        'taggings.idx_label_prefix'
      ])
      await conn.query(reported[0].suggestedSql as string)
    } finally {
      await conn.query(dropBoth)
      await conn.end()
    }
  })

  it('reads performance_schema itself for a user who cannot read sys', async () => {
    const root = await seeded()
    await root.query(`
      DROP USER IF EXISTS 'intel_nosys'@'%';
      CREATE USER 'intel_nosys'@'%' IDENTIFIED BY 'intel_nosys_pw';
      GRANT SELECT ON ${database}.* TO 'intel_nosys'@'%';
      GRANT SELECT ON performance_schema.* TO 'intel_nosys'@'%';
    `)
    const parsed = new URL(url as string)
    const conn = await mysql.createConnection({
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: 'intel_nosys',
      password: 'intel_nosys_pw',
      database
    })
    try {
      await expect(conn.query('SELECT * FROM sys.schema_unused_indexes')).rejects.toThrow()

      const report = await runMysqlSchemaIntel(conn, database, ['unused_indexes'])

      expect(report.skipped).toEqual([])
      expect(report.findings.map((f) => f.entity?.name)).toEqual(['idx_nick'])
    } finally {
      await conn.end()
      await root.query(`DROP USER IF EXISTS 'intel_nosys'@'%'; ${dropBoth}`)
      await root.end()
    }
  })
})

describe.skipIf(!offUrl)('MySQL unused_indexes with performance_schema off', () => {
  it('is skipped instead of calling every index used', async () => {
    const conn = await mysql.createConnection({ uri: offUrl as string, multipleStatements: true })
    const database = 'schema_intel_unused'
    try {
      await conn.query(`
        DROP DATABASE IF EXISTS ${database};
        CREATE DATABASE ${database};
        CREATE TABLE ${database}.t (id INT PRIMARY KEY, a INT, KEY idx_a (a));
      `)

      const report = await runMysqlSchemaIntel(conn, database, ['unused_indexes'])

      expect(report.findings).toEqual([])
      expect(report.skipped.map((s) => s.checkId)).toEqual(['unused_indexes'])
    } finally {
      await conn.query(`DROP DATABASE IF EXISTS ${database}`)
      await conn.end()
    }
  })
})
