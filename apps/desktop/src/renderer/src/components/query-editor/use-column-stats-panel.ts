import { useCallback } from 'react'
import type { ColumnStats } from '@data-peek/shared'
import type { DataTableColumn as DtColumn } from '@/components/data-table'
import { useConnectionStore } from '@/stores'
import type { ConnectionWithStatus } from '@/stores/connection-store'
import { useColumnStatsStore } from '@/stores/column-stats-store'
import { isExecutableTab, type Tab } from '@/stores/tab-store'

/**
 * Column statistics side panel: click a column header's stats affordance to
 * fetch and show distribution stats for that column.
 */
export function useColumnStatsPanel(
  tab: Tab | undefined,
  tabConnection: ConnectionWithStatus | null | undefined
): {
  columnStatsData: ColumnStats | null
  columnStatsLoading: boolean
  columnStatsError: string | null
  columnStatsSelected: ReturnType<typeof useColumnStatsStore.getState>['selectedColumn']
  columnStatsPanelOpen: boolean
  handleColumnStatsClick: (col: DtColumn) => void
  closeColumnStatsPanel: () => void
} {
  const schemas = useConnectionStore((s) => s.schemas)
  const {
    stats: columnStatsMap,
    isLoading: columnStatsLoading,
    error: columnStatsError,
    selectedColumn: columnStatsSelected,
    isPanelOpen: columnStatsPanelOpen,
    fetchStats: fetchColumnStats,
    selectColumn: selectStatsColumn,
    closePanel: closeColumnStatsPanel
  } = useColumnStatsStore()

  const handleColumnStatsClick = useCallback(
    (col: DtColumn) => {
      if (!tabConnection || !tab || !isExecutableTab(tab)) return

      const connectionId = tabConnection.id
      const config = tabConnection as Parameters<typeof fetchColumnStats>[1]

      let schema = 'public'
      let table = ''

      if (tab.type === 'table-preview') {
        schema = tab.schemaName
        table = tab.tableName
      } else {
        // For query tabs, try to find the column in schemas
        for (const s of schemas) {
          for (const t of s.tables) {
            if (t.columns.some((c) => c.name === col.name)) {
              schema = s.name
              table = t.name
              break
            }
          }
          if (table) break
        }
      }

      if (!table) {
        // No table context available, still open panel with just column info
        selectStatsColumn({
          connectionId,
          schema,
          table: '',
          column: col.name,
          dataType: col.dataType,
          config
        })
        return
      }

      selectStatsColumn({
        connectionId,
        schema,
        table,
        column: col.name,
        dataType: col.dataType,
        config
      })

      fetchColumnStats(connectionId, config, {
        schema,
        table,
        column: col.name,
        dataType: col.dataType
      })
    },
    [tabConnection, tab, schemas, fetchColumnStats, selectStatsColumn]
  )

  const columnStatsData =
    columnStatsSelected && columnStatsPanelOpen
      ? (columnStatsMap.get(
          `${columnStatsSelected.connectionId}:${columnStatsSelected.schema}:${columnStatsSelected.table}:${columnStatsSelected.column}`
        ) ?? null)
      : null

  return {
    columnStatsData,
    columnStatsLoading,
    columnStatsError,
    columnStatsSelected,
    columnStatsPanelOpen,
    handleColumnStatsClick,
    closeColumnStatsPanel
  }
}
