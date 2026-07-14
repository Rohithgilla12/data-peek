import { useCallback, useState } from 'react'
import type { ForeignKeyInfo, ColumnInfo, QueryResult as IpcQueryResult } from '@data-peek/shared'
import type { FKPanelItem } from '@/components/fk-panel-stack'
import { buildFullyQualifiedTableRef, buildSelectQuery, quoteIdentifier } from '@/lib/sql-helpers'
import { useConnectionStore, useTabStore } from '@/stores'
import type { ConnectionWithStatus } from '@/stores/connection-store'

/**
 * Foreign-key panel stack: click a FK cell to peek at the referenced row in a
 * stacked side panel, Cmd+click to open it as a full tab.
 */
export function useFkPanels(tabConnection: ConnectionWithStatus | null | undefined): {
  fkPanels: FKPanelItem[]
  handleFKClick: (fk: ForeignKeyInfo, value: unknown) => Promise<void>
  handleFKOpenTab: (fk: ForeignKeyInfo, value: unknown) => void
  handleCloseFKPanel: (panelId: string) => void
  handleCloseAllFKPanels: () => void
} {
  const [fkPanels, setFkPanels] = useState<FKPanelItem[]>([])
  const schemas = useConnectionStore((s) => s.schemas)
  const createForeignKeyTab = useTabStore((s) => s.createForeignKeyTab)

  // Fetch data for a referenced row
  const fetchFKData = useCallback(
    async (
      fk: ForeignKeyInfo,
      value: unknown
    ): Promise<{ data?: Record<string, unknown>; columns?: ColumnInfo[]; error?: string }> => {
      if (!tabConnection) return { error: 'No connection' }

      const tableRef = buildFullyQualifiedTableRef(
        fk.referencedSchema,
        fk.referencedTable,
        tabConnection.dbType
      )

      const quotedCol = quoteIdentifier(fk.referencedColumn, tabConnection.dbType)

      // Format value for SQL — `= NULL` never matches, and non-primitive values
      // would stringify into invalid SQL.
      let whereClause: string
      if (value === null || value === undefined) {
        whereClause = `WHERE ${quotedCol} IS NULL`
      } else if (typeof value === 'string') {
        whereClause = `WHERE ${quotedCol} = '${value.replace(/'/g, "''")}'`
      } else if (
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint'
      ) {
        whereClause = `WHERE ${quotedCol} = ${String(value)}`
      } else {
        return { error: 'Unsupported FK value type' }
      }
      const query = buildSelectQuery(tableRef, tabConnection.dbType, {
        where: whereClause,
        limit: 1
      })

      try {
        const response = await window.api.db.query(tabConnection, query)
        if (response.success && response.data) {
          const data = response.data as IpcQueryResult
          const row = data.rows[0] as Record<string, unknown> | undefined

          // Get column info with FK from schema
          const schema = schemas.find((s) => s.name === fk.referencedSchema)
          const tableInfo = schema?.tables.find((t) => t.name === fk.referencedTable)
          const columns = tableInfo?.columns

          if (!row) return { columns, error: 'Referenced row not found' }

          return { data: row, columns }
        }
        return { error: response.error ?? 'Query failed' }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    },
    [tabConnection, schemas]
  )

  // Handle click to open panel
  const handleFKClick = useCallback(
    async (fk: ForeignKeyInfo, value: unknown) => {
      const panelId = crypto.randomUUID()

      // Add loading panel
      setFkPanels((prev) => [
        ...prev,
        {
          id: panelId,
          foreignKey: fk,
          value,
          isLoading: true
        }
      ])

      // Fetch data
      const result = await fetchFKData(fk, value)

      // Update panel with result
      setFkPanels((prev) =>
        prev.map((p) =>
          p.id === panelId
            ? {
                ...p,
                isLoading: false,
                data: result.data,
                columns: result.columns,
                error: result.error
              }
            : p
        )
      )
    },
    [fetchFKData]
  )

  // Handle Cmd+Click to open in new tab
  const handleFKOpenTab = useCallback(
    (fk: ForeignKeyInfo, value: unknown) => {
      if (!tabConnection) return
      createForeignKeyTab(
        tabConnection.id,
        fk.referencedSchema,
        fk.referencedTable,
        fk.referencedColumn,
        value
      )
    },
    [tabConnection, createForeignKeyTab]
  )

  // Close a specific panel (and all panels stacked after it)
  const handleCloseFKPanel = useCallback((panelId: string) => {
    setFkPanels((prev) => {
      const index = prev.findIndex((p) => p.id === panelId)
      if (index === -1) return prev
      return prev.slice(0, index)
    })
  }, [])

  const handleCloseAllFKPanels = useCallback(() => {
    setFkPanels([])
  }, [])

  return { fkPanels, handleFKClick, handleFKOpenTab, handleCloseFKPanel, handleCloseAllFKPanels }
}
