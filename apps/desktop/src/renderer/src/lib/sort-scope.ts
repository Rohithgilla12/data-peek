import type { DatabaseType } from '@data-peek/shared'
import { isExecutableTab, type Tab } from '@/stores/tab-store'
import { sqlMatchesStoredTable } from '@/lib/editable-select'
import { isServerExpressibleSort, type NullsPosition, type SortMode } from '@/lib/sort-model'

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
  | {
      kind: 'partial'
      loaded: number
      total: number | null
      /**
       * Whether re-running the query would actually widen this sort. False when a chip
       * uses a mode SQL cannot express, in which case offering "sort all rows" would
       * promise an ordering the database is not going to produce.
       */
      serverSortable: boolean
    }

/**
 * The row ceiling a query declares for itself, or null when it declares none.
 *
 * Reporting null where a cap exists is the costly direction: the scope then reads as
 * `complete` and the bar claims every row was sorted. So the paginated forms all have
 * to be recognised — `LIMIT n OFFSET m`, MySQL's `LIMIT offset, n`, and a
 * parenthesised MSSQL `TOP (n)`.
 */
function declaredRowCap(sql: string): number | null {
  const limitOffset = sql.match(/\sLIMIT\s+(\d+)(?:\s+OFFSET\s+\d+)?\s*;?\s*$/i)
  if (limitOffset) return Number(limitOffset[1])

  // MySQL's two-argument form puts the offset first and the row count second.
  const limitPair = sql.match(/\sLIMIT\s+\d+\s*,\s*(\d+)\s*;?\s*$/i)
  if (limitPair) return Number(limitPair[1])

  const fetchFirst = sql.match(/\sFETCH\s+(?:FIRST|NEXT)\s+(\d+)\s+ROWS?\s+ONLY\s*;?\s*$/i)
  if (fetchFirst) return Number(fetchFirst[1])

  const top = sql.match(/^\s*SELECT\s+TOP\s*\(?\s*(\d+)\s*\)?\s+/i)
  if (top) return Number(top[1])

  return null
}

export function getSortScope(params: {
  tab: Tab
  dbType: DatabaseType | undefined
  loadedRows: number
  /** Active sorts. Omitted or empty means there is nothing that could be inexpressible. */
  sorting?: { mode?: SortMode; nullsPosition?: NullsPosition }[]
}): SortScope {
  const { tab, dbType, loadedRows, sorting = [] } = params

  if (!isExecutableTab(tab)) return { kind: 'complete', rows: loadedRows }

  const serverSortable = sorting.every(isServerExpressibleSort)

  if (
    tab.type === 'table-preview' &&
    dbType &&
    sqlMatchesStoredTable(
      tab.savedQuery ?? tab.query,
      { schema: tab.schemaName, table: tab.tableName },
      dbType
    )
  ) {
    // The database only sorts the preview when the whole sort survives translation.
    // Otherwise the renderer keeps the sort and it covers just the loaded page.
    if (serverSortable) return { kind: 'server' }
    return {
      kind: 'partial',
      loaded: loadedRows,
      total: tab.totalRowCount ?? null,
      serverSortable: false
    }
  }

  const cap = declaredRowCap(tab.query)
  if (cap !== null && loadedRows >= cap) {
    return { kind: 'partial', loaded: loadedRows, total: null, serverSortable }
  }

  return { kind: 'complete', rows: loadedRows }
}
