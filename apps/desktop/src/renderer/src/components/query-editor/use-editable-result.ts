import { useCallback } from 'react'
import type { ConnectionConfig, EditContext, TableInfo } from '@data-peek/shared'
import { isExecutableTab, type Tab } from '@/stores/tab-store'
import type { Schema } from '@/stores/connection-store'
import type { DataTableColumn } from '@/components/data-table'
import type { DataTableColumn as EditableDataTableColumn } from '@/components/editable-data-table'
import { analyzeEditableSelect } from '@/lib/editable-select'

/** Safely coerce a value to string[] or undefined. Handles pg driver returning array_agg as a raw string. */
function ensureArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
    const inner = value.slice(1, -1)
    if (inner === '') return []
    return inner.split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
  }
  return undefined
}

interface UseEditableResultParams {
  tab: Tab | undefined
  schemas: Schema[]
  tabConnection: ConnectionConfig | null | undefined
  getEnumValues: (dataType: string) => string[] | undefined
}

/**
 * Derives the editable-table metadata for the active result: FK column info, the
 * resolved source table (parsed from the executed SQL), the editable column set, and
 * the EditContext used to build INSERT/UPDATE/DELETE statements. Pure derivation over
 * tab + schema state — no side effects.
 */
export function useEditableResult({
  tab,
  schemas,
  tabConnection,
  getEnumValues
}: UseEditableResultParams) {
  // Helper: Look up column info from schema (for FK details)
  const getColumnsWithFKInfo = useCallback((): DataTableColumn[] => {
    if (!tab || !isExecutableTab(tab) || !tab.result?.columns) return []

    // For table-preview tabs, we can directly look up the columns from schema
    if (tab.type === 'table-preview') {
      const schema = schemas.find((s) => s.name === tab.schemaName)
      const tableInfo = schema?.tables.find((t) => t.name === tab.tableName)

      if (tableInfo) {
        return tab.result.columns.map((col) => {
          const schemaCol = tableInfo.columns.find((c) => c.name === col.name)
          return {
            name: col.name,
            dataType: col.dataType,
            foreignKey: schemaCol?.foreignKey
          }
        })
      }
    }

    // For query tabs, try to match columns across all tables
    // This is a simplified approach - won't work for aliased columns
    return tab.result.columns.map((col) => {
      // Search all schemas/tables for this column
      for (const schema of schemas) {
        for (const table of schema.tables) {
          const schemaCol = table.columns.find((c) => c.name === col.name)
          if (schemaCol?.foreignKey) {
            return {
              name: col.name,
              dataType: col.dataType,
              foreignKey: schemaCol.foreignKey
            }
          }
        }
      }
      return { name: col.name, dataType: col.dataType }
    })
  }, [tab, schemas])

  // Resolve the source table for editing by parsing the actually-executed SQL.
  // Applies to both query and table-preview tabs: the tab's stored schemaName/tableName is
  // only an initial hint — once the user changes the SQL, the executed query is the source of
  // truth. This prevents UPDATEs from targeting the wrong table when a table-preview tab's
  // query has been rewritten to query a different table.
  const resolveEditSourceTable = useCallback((): {
    schemaName: string
    tableName: string
    tableInfo: TableInfo
  } | null => {
    if (!tab || !isExecutableTab(tab) || !tabConnection) return null

    const idx = tab.activeResultIndex ?? 0
    const stmts = tab.multiResult?.statements
    const sql = stmts?.[idx]?.statement ?? tab.savedQuery ?? tab.query
    if (!sql) return null

    const info = analyzeEditableSelect(sql, tabConnection.dbType)
    if (!info) return null

    const lower = (s: string) => s.toLowerCase()
    const schemaCandidates = info.schema
      ? schemas.filter((s) => lower(s.name) === lower(info.schema as string))
      : schemas

    let match: { schemaName: string; tableInfo: TableInfo } | null = null
    for (const s of schemaCandidates) {
      const t = s.tables.find((t) => lower(t.name) === lower(info.table) && t.type === 'table')
      if (!t) continue
      if (match) return null // ambiguous — bail rather than guess wrong
      match = { schemaName: s.name, tableInfo: t }
    }
    if (!match) return null

    const pkCols = match.tableInfo.columns.filter((c) => c.isPrimaryKey)
    if (pkCols.length === 0) return null

    if (info.projection.type === 'columns') {
      const projLower = new Set(info.projection.names.map(lower))
      for (const pk of pkCols) {
        if (!projLower.has(lower(pk.name))) return null
      }
    }

    return {
      schemaName: match.schemaName,
      tableName: match.tableInfo.name,
      tableInfo: match.tableInfo
    }
  }, [tab, schemas, tabConnection])

  // Helper: Get columns with full info including isPrimaryKey (for editable table)
  const getColumnsForEditing = useCallback((): EditableDataTableColumn[] => {
    const source = resolveEditSourceTable()
    if (!source || !tab || !('result' in tab)) return []

    const idx = tab.activeResultIndex ?? 0
    const stmtFields = tab.multiResult?.statements?.[idx]?.fields
    const resultCols = stmtFields
      ? stmtFields.map((f) => ({ name: f.name, dataType: f.dataType }))
      : (tab.result?.columns ?? [])

    return resultCols.map((col) => {
      const schemaCol = source.tableInfo.columns.find((c) => c.name === col.name)
      return {
        name: col.name,
        dataType: col.dataType,
        foreignKey: schemaCol?.foreignKey,
        isPrimaryKey: schemaCol?.isPrimaryKey ?? false,
        isNullable: schemaCol?.isNullable ?? true,
        enumValues: ensureArray(schemaCol?.enumValues) ?? ensureArray(getEnumValues(col.dataType))
      }
    })
  }, [resolveEditSourceTable, tab, getEnumValues])

  // Helper: Build EditContext for the currently active result
  const getEditContext = useCallback((): EditContext | null => {
    const source = resolveEditSourceTable()
    if (!source) return null

    const primaryKeyColumns = source.tableInfo.columns
      .filter((c) => c.isPrimaryKey)
      .map((c) => c.name)

    return {
      schema: source.schemaName,
      table: source.tableName,
      primaryKeyColumns,
      columns: source.tableInfo.columns
    }
  }, [resolveEditSourceTable])

  return { getColumnsWithFKInfo, getColumnsForEditing, getEditContext }
}
