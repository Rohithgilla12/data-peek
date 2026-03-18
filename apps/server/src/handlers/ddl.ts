import type { ConnectionConfig, TableDefinition, AlterTableBatch, DDLResult } from '@shared/index'
import { getAdapter } from '../desktop-imports.js'
import {
  buildCreateTable,
  buildAlterTable,
  buildDropTable,
  buildPreviewDDL,
  validateTableDefinition
} from '../desktop-imports.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('ddl-handlers')

type RegisterFn = (channel: string, handler: (args: any) => Promise<any>) => void

export function registerDDLHandlers(register: RegisterFn): void {
  register('db:create-table', async ({
    config,
    definition
  }: {
    config: ConnectionConfig
    definition: TableDefinition
  }) => {
    log.info('Creating table:', definition.schema, definition.name)

    const validation = validateTableDefinition(definition)
    if (!validation.valid) {
      return { success: false, error: validation.errors.join('; ') }
    }

    const adapter = getAdapter(config)
    const dbType = config.dbType || 'postgresql'
    const result: DDLResult = { success: true, executedSql: [], errors: [] }

    try {
      const { sql } = buildCreateTable(definition, dbType)
      result.executedSql.push(sql)

      const statements = sql.split(/;\s*\n\n/).filter((s: string) => s.trim())
      const stmtParams = statements
        .filter((s: string) => s.trim())
        .map((stmt: string) => ({
          sql: stmt.trim().endsWith(';') ? stmt : stmt + ';',
          params: []
        }))

      await adapter.executeTransaction(config, stmtParams)
      return { success: true, data: result }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  register('db:alter-table', async ({
    config,
    batch
  }: {
    config: ConnectionConfig
    batch: AlterTableBatch
  }) => {
    const adapter = getAdapter(config)
    const dbType = config.dbType || 'postgresql'
    const result: DDLResult = { success: true, executedSql: [], errors: [] }

    try {
      const queries = buildAlterTable(batch, dbType)
      const statements = queries.map((q: { sql: string }) => ({ sql: q.sql, params: [] }))
      result.executedSql = queries.map((q: { sql: string }) => q.sql)
      await adapter.executeTransaction(config, statements)
      return { success: true, data: result }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      result.errors!.push(errorMessage)
      result.success = false
      return { success: true, data: result }
    }
  })

  register('db:drop-table', async ({
    config,
    schema,
    table,
    cascade
  }: {
    config: ConnectionConfig
    schema: string
    table: string
    cascade?: boolean
  }) => {
    const adapter = getAdapter(config)
    const dbType = config.dbType || 'postgresql'

    try {
      const { sql } = buildDropTable(schema, table, cascade, dbType)
      await adapter.executeTransaction(config, [{ sql, params: [] }])
      return { success: true, data: { success: true, executedSql: [sql] } }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  register('db:get-table-ddl', async ({
    config,
    schema,
    table
  }: {
    config: ConnectionConfig
    schema: string
    table: string
  }) => {
    try {
      const adapter = getAdapter(config)
      const definition = await adapter.getTableDDL(config, schema, table)
      return { success: true, data: definition }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  register('db:get-sequences', async (config: ConnectionConfig) => {
    try {
      const adapter = getAdapter(config)
      const sequences = await adapter.getSequences(config)
      return { success: true, data: sequences }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  register('db:get-types', async (config: ConnectionConfig) => {
    try {
      const adapter = getAdapter(config)
      const types = await adapter.getTypes(config)
      return { success: true, data: types }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  register('db:preview-ddl', async ({
    definition,
    dbType
  }: {
    definition: TableDefinition
    dbType?: string
  }) => {
    try {
      const targetDbType = (dbType || 'postgresql') as 'postgresql' | 'mysql' | 'sqlite' | 'mssql'
      const sql = buildPreviewDDL(definition, targetDbType)
      return { success: true, data: sql }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })
}
