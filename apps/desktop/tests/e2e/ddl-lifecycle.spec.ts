import { test, expect } from './fixtures/electron-app'
import { startSeededPostgres, type SeededPostgres } from './fixtures/postgres'

/**
 * DDL integration tests — drive the real desktop IPC surface against Postgres.
 * This covers the Table Designer backend path end-to-end: DDL preview, CREATE,
 * reverse-engineered table metadata, ALTER, schema-cache invalidation, and DROP.
 */

let pg: SeededPostgres

test.beforeAll(async () => {
  pg = await startSeededPostgres()
})

test.afterAll(async () => {
  await pg?.stop()
})

test.beforeEach(async ({ window }) => {
  await window.evaluate((cfg) => window.api.connections.add(cfg), pg.config)
})

test('ddl create/get/alter/drop lifecycle against seeded Postgres', async ({ window }) => {
  const tableName = `e2e_ddl_${Date.now().toString(36)}`
  const amountIndexName = `${tableName}_amount_idx`
  const statusIndexName = `${tableName}_status_idx`

  const definition = {
    schema: 'public',
    name: tableName,
    columns: [
      {
        id: 'col-id',
        name: 'id',
        dataType: 'integer',
        isNullable: false,
        isPrimaryKey: true,
        isUnique: false
      },
      {
        id: 'col-code',
        name: 'code',
        dataType: 'varchar',
        length: 32,
        isNullable: false,
        isPrimaryKey: false,
        isUnique: true,
        comment: 'External stable identifier'
      },
      {
        id: 'col-amount',
        name: 'amount',
        dataType: 'numeric',
        precision: 10,
        scale: 2,
        isNullable: false,
        isPrimaryKey: false,
        isUnique: false,
        defaultValue: '0'
      },
      {
        id: 'col-meta',
        name: 'meta',
        dataType: 'jsonb',
        isNullable: true,
        isPrimaryKey: false,
        isUnique: false
      }
    ],
    constraints: [
      {
        id: 'constraint-amount-nonnegative',
        name: `${tableName}_amount_nonnegative`,
        type: 'check' as const,
        columns: ['amount'],
        checkExpression: 'amount >= 0'
      }
    ],
    indexes: [
      {
        id: 'idx-amount',
        name: amountIndexName,
        columns: [{ name: 'amount' }],
        isUnique: false,
        method: 'btree' as const
      }
    ],
    comment: 'Created by desktop e2e DDL lifecycle'
  }

  try {
    const preview = await window.evaluate(
      (tableDef) => window.api.ddl.previewDDL(tableDef),
      definition
    )
    expect(preview.success).toBe(true)
    expect(preview.data).toContain(`CREATE TABLE "${tableName}"`)
    expect(preview.data).toContain(`CONSTRAINT "${tableName}_amount_nonnegative"`)
    expect(preview.data).toContain(`CREATE INDEX "${amountIndexName}"`)

    const createResult = await window.evaluate(
      (tableDef) => window.api.ddl.createTable(tableDef.connection, tableDef.definition),
      { connection: pg.config, definition }
    )
    expect(createResult).toMatchObject({
      success: true,
      data: { success: true }
    })
    expect(createResult.data?.executedSql.join('\n')).toContain(`CREATE TABLE "${tableName}"`)

    const createdSchema = await window.evaluate(
      (cfg) => window.api.db.schemas(cfg, true),
      pg.config
    )
    expect(createdSchema.success).toBe(true)
    const createdTable = createdSchema.data?.schemas
      .find((schema) => schema.name === 'public')
      ?.tables.find((table) => table.name === tableName)
    expect(createdTable?.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['id', 'code', 'amount', 'meta'])
    )

    const tableDdl = await window.evaluate(
      ({ cfg, table }) => window.api.ddl.getTableDDL(cfg, 'public', table),
      { cfg: pg.config, table: tableName }
    )
    expect(tableDdl.success).toBe(true)
    expect(tableDdl.data?.comment).toBe('Created by desktop e2e DDL lifecycle')
    expect(tableDdl.data?.columns.find((column) => column.name === 'id')?.isPrimaryKey).toBe(true)
    expect(tableDdl.data?.columns.find((column) => column.name === 'code')?.isUnique).toBe(true)
    expect(tableDdl.data?.constraints.map((constraint) => constraint.name)).toContain(
      `${tableName}_amount_nonnegative`
    )
    expect(tableDdl.data?.indexes.map((index) => index.name)).toContain(amountIndexName)

    const cachedBeforeAlter = await window.evaluate(
      (cfg) => window.api.db.schemas(cfg, false),
      pg.config
    )
    expect(cachedBeforeAlter.success).toBe(true)
    expect(cachedBeforeAlter.data?.fromCache).toBe(true)

    const alterResult = await window.evaluate(
      ({ cfg, table, index }) =>
        window.api.ddl.alterTable(cfg, {
          schema: 'public',
          table,
          columnOperations: [
            {
              type: 'add',
              column: {
                id: 'col-status',
                name: 'status',
                dataType: 'varchar',
                length: 16,
                isNullable: false,
                isPrimaryKey: false,
                isUnique: false,
                defaultValue: "'draft'"
              }
            },
            {
              type: 'set_comment',
              columnName: 'status',
              comment: 'Workflow state'
            }
          ],
          constraintOperations: [],
          indexOperations: [
            {
              type: 'create_index',
              index: {
                id: 'idx-status',
                name: index,
                columns: [{ name: 'status' }],
                isUnique: false,
                method: 'btree' as const
              }
            }
          ],
          comment: 'Altered by desktop e2e DDL lifecycle'
        }),
      { cfg: pg.config, table: tableName, index: statusIndexName }
    )
    expect(alterResult).toMatchObject({
      success: true,
      data: { success: true }
    })
    expect(alterResult.data?.executedSql.join('\n')).toContain('ADD COLUMN "status"')

    const schemaAfterAlter = await window.evaluate(
      (cfg) => window.api.db.schemas(cfg, false),
      pg.config
    )
    expect(schemaAfterAlter.success).toBe(true)
    expect(schemaAfterAlter.data?.fromCache).toBe(false)
    const alteredTable = schemaAfterAlter.data?.schemas
      .find((schema) => schema.name === 'public')
      ?.tables.find((table) => table.name === tableName)
    expect(alteredTable?.columns.map((column) => column.name)).toContain('status')

    const insertResult = await window.evaluate(
      ({ cfg, table }) =>
        window.api.db.query(
          cfg,
          `INSERT INTO "${table}" (id, code, amount, meta) VALUES (1, 'alpha', 12.50, '{"source":"e2e"}') RETURNING status`
        ),
      { cfg: pg.config, table: tableName }
    )
    expect(insertResult.success).toBe(true)
    expect((insertResult.data as { rows: Array<{ status: string }> }).rows[0].status).toBe('draft')

    const dropResult = await window.evaluate(
      ({ cfg, table }) => window.api.ddl.dropTable(cfg, 'public', table),
      { cfg: pg.config, table: tableName }
    )
    expect(dropResult).toMatchObject({
      success: true,
      data: { success: true }
    })

    const schemaAfterDrop = await window.evaluate(
      (cfg) => window.api.db.schemas(cfg, false),
      pg.config
    )
    expect(schemaAfterDrop.success).toBe(true)
    expect(schemaAfterDrop.data?.fromCache).toBe(false)
    const droppedTable = schemaAfterDrop.data?.schemas
      .find((schema) => schema.name === 'public')
      ?.tables.find((table) => table.name === tableName)
    expect(droppedTable).toBeUndefined()
  } finally {
    await window.evaluate(
      ({ cfg, table }) => window.api.db.query(cfg, `DROP TABLE IF EXISTS "${table}" CASCADE`),
      { cfg: pg.config, table: tableName }
    )
  }
})
