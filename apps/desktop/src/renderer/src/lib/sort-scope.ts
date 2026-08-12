import type { DatabaseType } from '@data-peek/shared'
import { isExecutableTab, type Tab } from '@/stores/tab-store'
import { sqlMatchesStoredTable } from '@/lib/editable-select'

/**
 * Whether the rows held in the renderer are everything a sort would apply to.
 *
 * `server` means the database performs the sort, so the question does not arise.
 * `partial` carries a null total when the true row count is unknown — a query that
 * exactly fills its LIMIT may or may not have more rows behind it.
 */
export type SortScope =
  | { kind: 'server' }
  | { kind: 'complete'; rows: number }
  | { kind: 'partial'; loaded: number; total: number | null }

function declaredRowCap(sql: string): number | null {
  const limit = sql.match(/\sLIMIT\s+(\d+)\s*;?\s*$/i)
  if (limit) return Number(limit[1])
  const top = sql.match(/^\s*SELECT\s+TOP\s+(\d+)\s+/i)
  if (top) return Number(top[1])
  return null
}

export function getSortScope(params: {
  tab: Tab
  dbType: DatabaseType | undefined
  loadedRows: number
}): SortScope {
  const { tab, dbType, loadedRows } = params

  if (!isExecutableTab(tab)) return { kind: 'complete', rows: loadedRows }

  if (
    tab.type === 'table-preview' &&
    dbType &&
    sqlMatchesStoredTable(
      tab.savedQuery ?? tab.query,
      { schema: tab.schemaName, table: tab.tableName },
      dbType
    )
  ) {
    return { kind: 'server' }
  }

  const cap = declaredRowCap(tab.query)
  if (cap !== null && loadedRows >= cap) {
    return { kind: 'partial', loaded: loadedRows, total: null }
  }

  return { kind: 'complete', rows: loadedRows }
}
