import { ipcMain } from 'electron'
import type { ConnectionConfig, TableDefinition, AlterTableBatch, DDLResult } from '@shared/index'
import { getAdapter } from '../db-adapter'
import {
  buildCreateTable,
  buildAlterTable,
  buildDropTable,
  buildPreviewDDL,
  validateTableDefinition
} from '../ddl-builder'

/**
 * Register DDL (Data Definition Language) handlers for table designer
 */
export function registerDDLHandlers(): void {
  // Create a new table
  ipcMain.handle(
    'db:create-table',
    async (
      _,
      { config, definition }: { config: ConnectionConfig; definition: TableDefinition }
    ) => {
      console.log('[ddl-handlers] Creating table:', definition.schema, definition.name)

      // Validate table definition
      const validation = validateTableDefinition(definition)
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join('; ')
        }
      }

      const adapter = getAdapter(config)
      const dbType = config.dbType || 'postgresql'
      const result: DDLResult = {
        success: true,
        executedSql: [],
        errors: []
      }

      try {
        // Build CREATE TABLE statement
        const { sql } = buildCreateTable(definition, dbType)
        result.executedSql.push(sql)

        console.log('[ddl-handlers] Executing:', sql)

        // Execute each statement separately (CREATE TABLE, COMMENT, indexes)
        const statements = sql.split(/;\s*\n\n/).filter((s) => s.trim())
        const stmtParams = statements
          .filter((s) => s.trim())
          .map((stmt) => ({
            sql: stmt.trim().endsWith(';') ? stmt : stmt + ';',
            params: []
          }))

        await adapter.executeTransaction(config, stmtParams)

        return { success: true, data: result }
      } catch (error: unknown) {
        console.error('[ddl-handlers] Error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Alter an existing table
  ipcMain.handle(
    'db:alter-table',
    async (_, { config, batch }: { config: ConnectionConfig; batch: AlterTableBatch }) => {
      console.log('[ddl-handlers] Altering table:', batch.schema, batch.table)

      const adapter = getAdapter(config)
      const dbType = config.dbType || 'postgresql'
      const result: DDLResult = {
        success: true,
        executedSql: [],
        errors: []
      }

      try {
        // Build ALTER TABLE statements
        const queries = buildAlterTable(batch, dbType)
        const statements = queries.map((q) => ({ sql: q.sql, params: [] }))
        result.executedSql = queries.map((q) => q.sql)

        console.log('[ddl-handlers] Executing:', result.executedSql)

        await adapter.executeTransaction(config, statements)

        return { success: true, data: result }
      } catch (error: unknown) {
        console.error('[ddl-handlers] Error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        result.errors!.push(errorMessage)
        result.success = false
        return { success: true, data: result }
      }
    }
  )

  // Drop a table
  ipcMain.handle(
    'db:drop-table',
    async (
      _,
      {
        config,
        schema,
        table,
        cascade
      }: { config: ConnectionConfig; schema: string; table: string; cascade?: boolean }
    ) => {
      console.log('[ddl-handlers] Dropping table:', schema, table)

      const adapter = getAdapter(config)
      const dbType = config.dbType || 'postgresql'

      try {
        const { sql } = buildDropTable(schema, table, cascade, dbType)
        console.log('[ddl-handlers] Executing:', sql)

        await adapter.executeTransaction(config, [{ sql, params: [] }])

        return {
          success: true,
          data: { success: true, executedSql: [sql] }
        }
      } catch (error: unknown) {
        console.error('[ddl-handlers] Error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Get table definition (reverse engineer from database)
  ipcMain.handle(
    'db:get-table-ddl',
    async (
      _,
      { config, schema, table }: { config: ConnectionConfig; schema: string; table: string }
    ) => {
      console.log('[ddl-handlers] Getting DDL for:', schema, table)

      try {
        const adapter = getAdapter(config)
        const definition = await adapter.getTableDDL(config, schema, table)
        return { success: true, data: definition }
      } catch (error: unknown) {
        console.error('[ddl-handlers] Error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Get available sequences
  ipcMain.handle('db:get-sequences', async (_, config: ConnectionConfig) => {
    console.log('[ddl-handlers] Fetching sequences')

    try {
      const adapter = getAdapter(config)
      const sequences = await adapter.getSequences(config)
      return { success: true, data: sequences }
    } catch (error: unknown) {
      console.error('[ddl-handlers] Error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Get custom types (enums, composites, etc.)
  ipcMain.handle('db:get-types', async (_, config: ConnectionConfig) => {
    console.log('[ddl-handlers] Fetching custom types')

    try {
      const adapter = getAdapter(config)
      const types = await adapter.getTypes(config)
      return { success: true, data: types }
    } catch (error: unknown) {
      console.error('[ddl-handlers] Error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Preview DDL without executing
  ipcMain.handle(
    'db:preview-ddl',
    (_, { definition, dbType }: { definition: TableDefinition; dbType?: string }) => {
      try {
        const targetDbType = (dbType || 'postgresql') as 'postgresql' | 'mysql' | 'sqlite' | 'mssql'
        const sql = buildPreviewDDL(definition, targetDbType)
        return { success: true, data: sql }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )
}
