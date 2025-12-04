'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Play,
  Download,
  FileJson,
  FileSpreadsheet,
  Loader2,
  AlertCircle,
  Database,
  Wand2,
  PanelTopClose,
  PanelTop,
  PanelBottomClose,
  PanelBottom,
  DatabaseZap,
  BarChart3,
  Bookmark,
  Maximize2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useTabStore, useConnectionStore, useQueryStore, useSettingsStore } from '@/stores'
import type { Tab, MultiQueryResult } from '@/stores/tab-store'
import type { StatementResult } from '@data-peek/shared'
import {
  DataTable,
  type DataTableFilter,
  type DataTableSort,
  type DataTableColumn
} from '@/components/data-table'
import {
  EditableDataTable,
  type DataTableColumn as EditableDataTableColumn
} from '@/components/editable-data-table'
import type { EditContext } from '@data-peek/shared'
import { SQLEditor } from '@/components/sql-editor'
import { formatSQL } from '@/lib/sql-formatter'
import { keys } from '@/lib/utils'
import { downloadCSV, downloadJSON, generateExportFilename } from '@/lib/export'
import { buildSelectQuery } from '@/lib/sql-helpers'
import type { QueryResult as IpcQueryResult, ForeignKeyInfo, ColumnInfo } from '@data-peek/shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { FKPanelStack, type FKPanelItem } from '@/components/fk-panel-stack'
import { ERDVisualization } from '@/components/erd-visualization'
import { ExecutionPlanViewer } from '@/components/execution-plan-viewer'
import { TableDesigner } from '@/components/table-designer'
import { SaveQueryDialog } from '@/components/save-query-dialog'

interface TabQueryEditorProps {
  tabId: string
}

export function TabQueryEditor({ tabId }: TabQueryEditorProps) {
  const tab = useTabStore((s) => s.getTab(tabId)) as Tab | undefined
  const updateTabQuery = useTabStore((s) => s.updateTabQuery)
  const updateTabResult = useTabStore((s) => s.updateTabResult)
  const updateTabMultiResult = useTabStore((s) => s.updateTabMultiResult)
  const setActiveResultIndex = useTabStore((s) => s.setActiveResultIndex)
  const updateTabExecuting = useTabStore((s) => s.updateTabExecuting)
  const markTabSaved = useTabStore((s) => s.markTabSaved)
  const getTabPaginatedRows = useTabStore((s) => s.getTabPaginatedRows)
  const getActiveResultPaginatedRows = useTabStore((s) => s.getActiveResultPaginatedRows)
  const getAllStatementResults = useTabStore((s) => s.getAllStatementResults)
  const getActiveStatementResult = useTabStore((s) => s.getActiveStatementResult)

  const connections = useConnectionStore((s) => s.connections)
  const schemas = useConnectionStore((s) => s.schemas)
  const getEnumValues = useConnectionStore((s) => s.getEnumValues)
  const addToHistory = useQueryStore((s) => s.addToHistory)
  const hideQueryEditorByDefault = useSettingsStore((s) => s.hideQueryEditorByDefault)

  // Get the connection for this tab
  const tabConnection = tab?.connectionId
    ? connections.find((c) => c.id === tab.connectionId)
    : null

  // Track if we've already attempted auto-run for this tab
  const hasAutoRun = useRef(false)

  // Collapse state for query editor and results panel
  // For table-preview tabs, use the hideQueryEditorByDefault setting
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(
    tab?.type === 'table-preview' ? hideQueryEditorByDefault : false
  )
  const [isResultsCollapsed, setIsResultsCollapsed] = useState(false)

  // Track client-side filters and sorting for "Apply to Query"
  const [tableFilters, setTableFilters] = useState<DataTableFilter[]>([])
  const [tableSorting, setTableSorting] = useState<DataTableSort[]>([])

  // FK Panel stack state
  const [fkPanels, setFkPanels] = useState<FKPanelItem[]>([])

  // Execution plan state
  const [executionPlan, setExecutionPlan] = useState<{
    plan: unknown[]
    durationMs: number
  } | null>(null)
  const [isExplaining, setIsExplaining] = useState(false)
  const [executionPlanWidth, setExecutionPlanWidth] = useState(() => {
    // Load from localStorage or default to 500
    const saved = localStorage.getItem('execution-plan-width')
    return saved ? parseInt(saved, 10) : 500
  })
  const isResizing = useRef(false)

  // Save query dialog state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)

  // Get the createForeignKeyTab action
  const createForeignKeyTab = useTabStore((s) => s.createForeignKeyTab)

  // Handle execution plan panel resize
  const handleExecutionPlanResize = useCallback((e: MouseEvent) => {
    if (!isResizing.current) return
    const newWidth = Math.max(300, Math.min(800, window.innerWidth - e.clientX))
    setExecutionPlanWidth(newWidth)
  }, [])

  const stopResizing = useCallback(() => {
    isResizing.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    // Save to localStorage
    localStorage.setItem('execution-plan-width', String(executionPlanWidth))
  }, [executionPlanWidth])

  useEffect(() => {
    document.addEventListener('mousemove', handleExecutionPlanResize)
    document.addEventListener('mouseup', stopResizing)
    return () => {
      document.removeEventListener('mousemove', handleExecutionPlanResize)
      document.removeEventListener('mouseup', stopResizing)
    }
  }, [handleExecutionPlanResize, stopResizing])

  const handleRunQuery = useCallback(async () => {
    if (
      !tab ||
      tab.type === 'erd' ||
      tab.type === 'table-designer' ||
      !tabConnection ||
      tab.isExecuting ||
      !tab.query.trim()
    ) {
      return
    }

    updateTabExecuting(tabId, true)

    try {
      const response = await window.api.db.query(tabConnection, tab.query)

      if (response.success && response.data) {
        const data = response.data as
          | { results: StatementResult[]; totalDurationMs: number; statementCount: number }
          | IpcQueryResult

        // Check if we have multi-statement results
        if ('results' in data && Array.isArray(data.results)) {
          // Multi-statement result
          const multiResult: MultiQueryResult = {
            statements: data.results as StatementResult[],
            totalDurationMs: data.totalDurationMs,
            statementCount: data.statementCount
          }

          updateTabMultiResult(tabId, multiResult, null)
          markTabSaved(tabId)

          // Add to global history with total row count
          const totalRows = multiResult.statements.reduce((sum, s) => sum + s.rowCount, 0)
          addToHistory({
            query: tab.query,
            durationMs: multiResult.totalDurationMs,
            rowCount: totalRows,
            status: 'success',
            connectionId: tabConnection.id
          })
        } else {
          // Legacy single result (fallback)
          const singleResult = data as IpcQueryResult
          const result = {
            columns: singleResult.fields.map((f: { name: string; dataType: string }) => ({
              name: f.name,
              dataType: f.dataType
            })),
            rows: singleResult.rows,
            rowCount: singleResult.rowCount ?? singleResult.rows.length,
            durationMs: singleResult.durationMs
          }

          updateTabResult(tabId, result, null)
          markTabSaved(tabId)

          addToHistory({
            query: tab.query,
            durationMs: singleResult.durationMs,
            rowCount: result.rowCount,
            status: 'success',
            connectionId: tabConnection.id
          })
        }
      } else {
        const errorMessage = response.error ?? 'Query execution failed'
        updateTabMultiResult(tabId, null, errorMessage)

        addToHistory({
          query: tab.query,
          durationMs: 0,
          rowCount: 0,
          status: 'error',
          connectionId: tabConnection.id,
          errorMessage
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      updateTabMultiResult(tabId, null, errorMessage)
    } finally {
      updateTabExecuting(tabId, false)
    }
  }, [
    tab,
    tabConnection,
    tabId,
    updateTabExecuting,
    updateTabResult,
    updateTabMultiResult,
    markTabSaved,
    addToHistory
  ])

  const handleFormatQuery = () => {
    if (!tab || tab.type === 'erd' || tab.type === 'table-designer' || !tab.query.trim()) return
    const formatted = formatSQL(tab.query)
    updateTabQuery(tabId, formatted)
  }

  const handleExplainQuery = useCallback(async () => {
    if (
      !tab ||
      tab.type === 'erd' ||
      tab.type === 'table-designer' ||
      !tabConnection ||
      isExplaining ||
      !tab.query.trim()
    ) {
      return
    }

    setIsExplaining(true)
    setExecutionPlan(null)

    try {
      const response = await window.api.db.explain(tabConnection, tab.query, true)

      if (response.success && response.data) {
        setExecutionPlan({
          plan: response.data.plan as unknown[],
          durationMs: response.data.durationMs
        })
      } else {
        // Show error in the existing error display
        updateTabResult(tabId, null, response.error ?? 'Failed to get execution plan')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      updateTabResult(tabId, null, errorMessage)
    } finally {
      setIsExplaining(false)
    }
  }, [tab, tabConnection, tabId, isExplaining, updateTabResult])

  const handleQueryChange = (value: string) => {
    updateTabQuery(tabId, value)
  }

  // Helper: Look up column info from schema (for FK details)
  const getColumnsWithFKInfo = useCallback((): DataTableColumn[] => {
    if (!tab || tab.type === 'erd' || tab.type === 'table-designer' || !tab.result?.columns)
      return []

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

  // Helper: Get columns with full info including isPrimaryKey (for editable table)
  const getColumnsForEditing = useCallback((): EditableDataTableColumn[] => {
    if (
      !tab ||
      tab.type === 'erd' ||
      tab.type === 'table-designer' ||
      !tab.result?.columns ||
      tab.type !== 'table-preview'
    )
      return []

    const schema = schemas.find((s) => s.name === tab.schemaName)
    const tableInfo = schema?.tables.find((t) => t.name === tab.tableName)

    if (!tableInfo) return []

    return tab.result.columns.map((col) => {
      const schemaCol = tableInfo.columns.find((c) => c.name === col.name)
      return {
        name: col.name,
        dataType: col.dataType,
        foreignKey: schemaCol?.foreignKey,
        isPrimaryKey: schemaCol?.isPrimaryKey ?? false,
        isNullable: schemaCol?.isNullable ?? true,
        enumValues: getEnumValues(col.dataType)
      }
    })
  }, [tab, schemas, getEnumValues])

  // Helper: Build EditContext for table-preview tabs
  const getEditContext = useCallback((): EditContext | null => {
    if (!tab || tab.type !== 'table-preview') return null

    const schema = schemas.find((s) => s.name === tab.schemaName)
    const tableInfo = schema?.tables.find((t) => t.name === tab.tableName)

    if (!tableInfo) return null

    const primaryKeyColumns = tableInfo.columns.filter((c) => c.isPrimaryKey).map((c) => c.name)

    return {
      schema: tab.schemaName,
      table: tab.tableName,
      primaryKeyColumns,
      columns: tableInfo.columns
    }
  }, [tab, schemas])

  // FK Panel: Fetch data for a referenced row
  const fetchFKData = useCallback(
    async (
      fk: ForeignKeyInfo,
      value: unknown
    ): Promise<{ data?: Record<string, unknown>; columns?: ColumnInfo[]; error?: string }> => {
      if (!tabConnection) return { error: 'No connection' }

      // Build table reference (handle MSSQL's dbo schema)
      const defaultSchema = tabConnection.dbType === 'mssql' ? 'dbo' : 'public'
      const tableRef =
        fk.referencedSchema === defaultSchema
          ? fk.referencedTable
          : `${fk.referencedSchema}.${fk.referencedTable}`

      // Format value for SQL
      let formattedValue: string
      if (value === null || value === undefined) {
        formattedValue = 'NULL'
      } else if (typeof value === 'string') {
        formattedValue = `'${value.replace(/'/g, "''")}'`
      } else {
        formattedValue = String(value)
      }

      const whereClause = `WHERE "${fk.referencedColumn}" = ${formattedValue}`
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

          return { data: row, columns }
        }
        return { error: response.error ?? 'Query failed' }
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    },
    [tabConnection, schemas]
  )

  // FK Panel: Handle click to open panel
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

  // FK Panel: Handle Cmd+Click to open in new tab
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

  // FK Panel: Handle drill-down (click FK in panel)
  const handleFKDrillDown = useCallback(
    async (fk: ForeignKeyInfo, value: unknown) => {
      await handleFKClick(fk, value)
    },
    [handleFKClick]
  )

  // FK Panel: Close a specific panel
  const handleCloseFKPanel = useCallback((panelId: string) => {
    setFkPanels((prev) => {
      const index = prev.findIndex((p) => p.id === panelId)
      if (index === -1) return prev
      // Close this panel and all panels after it
      return prev.slice(0, index)
    })
  }, [])

  // FK Panel: Close all panels
  const handleCloseAllFKPanels = useCallback(() => {
    setFkPanels([])
  }, [])

  // Generate SQL WHERE clause from filters
  const generateWhereClause = (filters: DataTableFilter[]): string => {
    if (filters.length === 0) return ''
    const conditions = filters.map((f) => {
      // Escape single quotes in value
      const escapedValue = f.value.replace(/'/g, "''")
      return `"${f.column}" ILIKE '%${escapedValue}%'`
    })
    return `WHERE ${conditions.join(' AND ')}`
  }

  // Generate SQL ORDER BY clause from sorting
  const generateOrderByClause = (sorting: DataTableSort[]): string => {
    if (sorting.length === 0) return ''
    const orders = sorting.map((s) => `"${s.column}" ${s.direction.toUpperCase()}`)
    return `ORDER BY ${orders.join(', ')}`
  }

  // Build a new query with filters/sorting applied
  const buildQueryWithFilters = (): string => {
    if (!tab || tab.type === 'erd' || tab.type === 'table-designer') return ''

    // For table preview tabs, rebuild from scratch
    if (tab.type === 'table-preview') {
      // Build table reference (handle MSSQL's dbo schema)
      const defaultSchema = tabConnection?.dbType === 'mssql' ? 'dbo' : 'public'
      const tableRef =
        tab.schemaName === defaultSchema ? tab.tableName : `${tab.schemaName}.${tab.tableName}`
      const wherePart = generateWhereClause(tableFilters)
      const orderPart = generateOrderByClause(tableSorting)
      return buildSelectQuery(tableRef, tabConnection?.dbType, {
        where: wherePart,
        orderBy: orderPart,
        limit: 100
      })
        .replace(/\s+/g, ' ')
        .trim()
    }

    // For query tabs, try to inject WHERE/ORDER BY
    // This is simplified - a full implementation would parse the SQL AST
    let baseQuery = tab.query.trim()

    // Remove trailing semicolon
    if (baseQuery.endsWith(';')) {
      baseQuery = baseQuery.slice(0, -1)
    }

    // Remove existing LIMIT for re-adding at the end
    const limitMatch = baseQuery.match(/\s+LIMIT\s+\d+\s*$/i)
    let limitClause = ''
    if (limitMatch) {
      limitClause = limitMatch[0]
      baseQuery = baseQuery.slice(0, -limitMatch[0].length)
    }

    const wherePart = generateWhereClause(tableFilters)
    const orderPart = generateOrderByClause(tableSorting)

    // Append clauses (simplified - assumes no existing WHERE/ORDER BY)
    return `${baseQuery} ${wherePart} ${orderPart}${limitClause};`.replace(/\s+/g, ' ').trim()
  }

  const handleApplyToQuery = () => {
    if (!tab || (tableFilters.length === 0 && tableSorting.length === 0)) return
    const newQuery = buildQueryWithFilters()
    updateTabQuery(tabId, formatSQL(newQuery))
    // Automatically run the new query
    setTimeout(() => handleRunQuery(), 100)
  }

  const hasActiveFiltersOrSorting = tableFilters.length > 0 || tableSorting.length > 0

  // Auto-run query for table-preview tabs when first created
  useEffect(() => {
    if (
      tab?.type === 'table-preview' &&
      !tab.result &&
      !tab.multiResult &&
      !tab.error &&
      !tab.isExecuting &&
      tabConnection &&
      tab.query.trim() &&
      !hasAutoRun.current
    ) {
      hasAutoRun.current = true
      handleRunQuery()
    }
  }, [handleRunQuery, tab, tabConnection])

  if (!tab) {
    return null
  }

  if (!tabConnection) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center space-y-4">
          <div className="size-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
            <Database className="size-8 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-medium">No Connection</h2>
            <p className="text-sm text-muted-foreground mt-1">
              This tab&apos;s connection is no longer available.
              <br />
              Select a different connection from the sidebar.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Render ERD visualization for ERD tabs
  if (tab.type === 'erd') {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/40 bg-muted/20 px-3 py-2">
          <span className="text-sm font-medium">Entity Relationship Diagram</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={`size-1.5 rounded-full ${tabConnection.isConnected ? 'bg-green-500' : 'bg-yellow-500'}`}
            />
            {tabConnection.name}
          </span>
        </div>
        <div className="flex-1">
          <ERDVisualization schemas={schemas} />
        </div>
      </div>
    )
  }

  // Render Table Designer for table-designer tabs
  if (tab.type === 'table-designer') {
    return <TableDesigner tabId={tabId} />
  }

  // Get statement results for multi-statement queries
  const statementResults = getAllStatementResults(tabId)
  const activeStatementResult = getActiveStatementResult(tabId)
  const hasMultipleResults = statementResults.length > 1
  // At this point, tab is guaranteed to be query or table-preview (not erd or table-designer)
  const activeResultIndex = tab.activeResultIndex ?? 0

  // Use multi-result pagination when available, fallback to legacy
  const paginatedRows = hasMultipleResults
    ? getActiveResultPaginatedRows(tabId)
    : getTabPaginatedRows(tabId)

  // Get columns from active statement result (for multi-statement) or legacy result
  const getActiveResultColumns = () => {
    if (activeStatementResult) {
      return activeStatementResult.fields.map((f) => ({
        name: f.name,
        dataType: f.dataType
      }))
    }
    // tab is guaranteed to be query or table-preview at this point
    if (tab.result) {
      return tab.result.columns
    }
    return []
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Query Editor Section */}
      <div
        className={`flex flex-col border-b border-border/40 transition-all duration-200 ${isResultsCollapsed ? 'flex-1 min-h-0' : 'shrink-0'}`}
      >
        {/* Monaco SQL Editor - Collapsible */}
        {!isEditorCollapsed && (
          <div className={`p-3 pb-0 ${isResultsCollapsed ? 'flex-1 min-h-0' : ''}`}>
            <SQLEditor
              value={tab.query}
              onChange={handleQueryChange}
              onRun={handleRunQuery}
              onFormat={handleFormatQuery}
              height={isResultsCollapsed ? '100%' : 160}
              placeholder="SELECT * FROM your_table LIMIT 100;"
              schemas={schemas}
            />
          </div>
        )}

        {/* Editor Toolbar */}
        <div className="flex items-center justify-between bg-muted/20 px-3 py-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setIsEditorCollapsed(!isEditorCollapsed)}
              title={isEditorCollapsed ? 'Show query editor' : 'Hide query editor'}
            >
              {isEditorCollapsed ? (
                <PanelTop className="size-3.5" />
              ) : (
                <PanelTopClose className="size-3.5" />
              )}
            </Button>
            <Button
              size="sm"
              className="gap-1.5 h-7"
              disabled={tab.isExecuting || !tab.query.trim()}
              onClick={handleRunQuery}
            >
              {tab.isExecuting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              Run
              <kbd className="ml-1.5 rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">{keys.mod}{keys.enter}</kbd>
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 h-7"
                    disabled={tab.isExecuting || isExplaining || !tab.query.trim()}
                    onClick={handleExplainQuery}
                  >
                    {isExplaining ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <BarChart3 className="size-3.5" />
                    )}
                    Explain
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">Analyze query execution plan (EXPLAIN ANALYZE)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {!isEditorCollapsed && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 h-7"
                  disabled={!tab.query.trim()}
                  onClick={handleFormatQuery}
                >
                  <Wand2 className="size-3.5" />
                  Format
                  <kbd className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{keys.mod}{keys.shift}F</kbd>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 h-7"
                  disabled={!tab.query.trim()}
                  onClick={() => setSaveDialogOpen(true)}
                >
                  <Bookmark className="size-3.5" />
                  Save
                </Button>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`gap-1.5 h-7 ${isResultsCollapsed ? 'text-primary' : ''}`}
                        onClick={() => setIsResultsCollapsed(!isResultsCollapsed)}
                      >
                        <Maximize2 className="size-3.5" />
                        {isResultsCollapsed ? 'Restore' : 'Focus'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="text-xs">
                        {isResultsCollapsed
                          ? 'Restore results panel'
                          : 'Collapse results to focus on query writing'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {isEditorCollapsed && (
              <code className="text-[10px] bg-muted/50 px-2 py-0.5 rounded max-w-[300px] truncate">
                {tab.query.replace(/\s+/g, ' ').slice(0, 60)}
                {tab.query.length > 60 ? '...' : ''}
              </code>
            )}
            <span className="flex items-center gap-1.5">
              <span
                className={`size-1.5 rounded-full ${tabConnection.isConnected ? 'bg-green-500' : 'bg-yellow-500'}`}
              />
              {tabConnection.name}
            </span>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div
        className={`flex flex-col overflow-hidden transition-all duration-200 ${isResultsCollapsed ? 'h-10 shrink-0' : 'flex-1'}`}
      >
        {/* Collapsed Results Bar */}
        {isResultsCollapsed ? (
          <div className="flex items-center justify-between h-10 border-t border-border/40 bg-muted/30 px-3">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setIsResultsCollapsed(false)}
                title="Show results panel"
              >
                <PanelBottom className="size-3.5" />
              </Button>
              {tab.error ? (
                <span className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertCircle className="size-3" />
                  Query Error
                </span>
              ) : tab.result || tab.multiResult ? (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {hasMultipleResults ? (
                    <>
                      <span className="flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-green-500" />
                        {statementResults.length} statements
                      </span>
                      <span className="text-muted-foreground/60">
                        {tab.multiResult?.totalDurationMs}ms
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-green-500" />
                        {tab.result?.rowCount ?? 0} rows
                      </span>
                      <span className="text-muted-foreground/60">{tab.result?.durationMs}ms</span>
                    </>
                  )}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">No results</span>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground/50">Results collapsed</span>
          </div>
        ) : (
          <>
            {tab.error ? (
              <div className="flex-1 flex items-center justify-center p-4">
                <div className="max-w-md text-center space-y-2">
                  <AlertCircle className="size-8 text-red-400 mx-auto" />
                  <h3 className="font-medium text-red-400">Query Error</h3>
                  <p className="text-sm text-muted-foreground">{tab.error}</p>
                </div>
              </div>
            ) : tab.result || tab.multiResult ? (
              <>
                {/* Result Set Tabs - shown when there are multiple statements */}
                {hasMultipleResults && (
                  <div className="flex items-center gap-1 border-b border-border/40 bg-muted/10 px-3 py-1.5 shrink-0 overflow-x-auto">
                    {statementResults.map((stmt, idx) => {
                      const isActive = idx === activeResultIndex
                      const label = stmt.isDataReturning
                        ? `Result ${idx + 1} (${stmt.rowCount} rows)`
                        : `Statement ${idx + 1} (${stmt.rowCount} affected)`

                      return (
                        <button
                          key={stmt.statementIndex}
                          onClick={() => setActiveResultIndex(tabId, idx)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap ${
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                          }`}
                          title={stmt.statement.slice(0, 100)}
                        >
                          <span
                            className={`size-1.5 rounded-full ${
                              stmt.isDataReturning ? 'bg-green-500' : 'bg-blue-500'
                            } ${isActive ? 'opacity-80' : ''}`}
                          />
                          {label}
                          <span className={`text-[10px] ${isActive ? 'opacity-70' : 'opacity-50'}`}>
                            {stmt.durationMs}ms
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Results Table */}
                <div className="flex-1 overflow-hidden p-3">
                  {tab.type === 'table-preview' ? (
                    <EditableDataTable
                      tabId={tabId}
                      columns={getColumnsForEditing()}
                      data={paginatedRows as Record<string, unknown>[]}
                      pageSize={tab.pageSize}
                      canEdit={true}
                      editContext={getEditContext()}
                      connection={tabConnection}
                      onFiltersChange={setTableFilters}
                      onSortingChange={setTableSorting}
                      onForeignKeyClick={handleFKClick}
                      onForeignKeyOpenTab={handleFKOpenTab}
                      onChangesCommitted={handleRunQuery}
                    />
                  ) : (
                    <DataTable
                      columns={
                        hasMultipleResults
                          ? getActiveResultColumns().map((col) => ({
                              name: col.name,
                              dataType: col.dataType
                            }))
                          : getColumnsWithFKInfo()
                      }
                      data={paginatedRows as Record<string, unknown>[]}
                      pageSize={tab.pageSize}
                      onFiltersChange={setTableFilters}
                      onSortingChange={setTableSorting}
                      onForeignKeyClick={handleFKClick}
                      onForeignKeyOpenTab={handleFKOpenTab}
                    />
                  )}
                </div>

                {/* Results Footer */}
                <div className="flex items-center justify-between border-t border-border/40 bg-muted/20 px-3 py-1.5 shrink-0">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setIsResultsCollapsed(true)}
                      title="Collapse results panel"
                    >
                      <PanelBottomClose className="size-3.5" />
                    </Button>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {hasMultipleResults ? (
                        <>
                          <span className="flex items-center gap-1.5">
                            <span className="size-1.5 rounded-full bg-green-500" />
                            {activeStatementResult?.rowCount ?? 0}{' '}
                            {activeStatementResult?.isDataReturning ? 'rows' : 'affected'}
                          </span>
                          <span className="text-muted-foreground/60">
                            {statementResults.length} statements
                          </span>
                          <span>{tab.multiResult?.totalDurationMs}ms total</span>
                        </>
                      ) : (
                        <>
                          <span className="flex items-center gap-1.5">
                            <span className="size-1.5 rounded-full bg-green-500" />
                            {tab.result?.rowCount ?? 0} rows returned
                          </span>
                          <span>{tab.result?.durationMs}ms</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasActiveFiltersOrSorting && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 h-7 text-primary border-primary/50 hover:bg-primary/10"
                              onClick={handleApplyToQuery}
                            >
                              <DatabaseZap className="size-3.5" />
                              Apply to Query
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-xs">
                              Convert your current filters and sorting to SQL WHERE/ORDER BY clauses
                              and re-run the query against the database.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5 h-7">
                          <Download className="size-3.5" />
                          Export
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            if (!tab.result) return
                            const filename = generateExportFilename(
                              tab.type === 'table-preview' ? tab.tableName : undefined
                            )
                            downloadCSV(tab.result, filename)
                          }}
                        >
                          <FileSpreadsheet className="size-4 text-muted-foreground" />
                          Export as CSV
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            if (!tab.result) return
                            const filename = generateExportFilename(
                              tab.type === 'table-preview' ? tab.tableName : undefined
                            )
                            downloadJSON(tab.result, filename)
                          }}
                        >
                          <FileJson className="size-4 text-muted-foreground" />
                          Export as JSON
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <p className="text-muted-foreground">Run a query to see results</p>
                  <p className="text-xs text-muted-foreground/70">Press {keys.mod}+Enter to execute</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* FK Panel Stack */}
      <FKPanelStack
        panels={fkPanels}
        connection={tabConnection}
        onClose={handleCloseFKPanel}
        onCloseAll={handleCloseAllFKPanels}
        onDrillDown={handleFKDrillDown}
        onOpenInTab={handleFKOpenTab}
      />

      {/* Execution Plan Panel */}
      {executionPlan && (
        <div
          className="fixed inset-y-0 right-0 z-50 shadow-xl"
          style={{ width: executionPlanWidth }}
        >
          {/* Resize handle */}
          <div
            className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-primary/50 transition-colors z-10"
            onMouseDown={(e) => {
              e.preventDefault()
              isResizing.current = true
              document.body.style.cursor = 'ew-resize'
              document.body.style.userSelect = 'none'
            }}
          />
          <ExecutionPlanViewer
            plan={executionPlan.plan as Parameters<typeof ExecutionPlanViewer>[0]['plan']}
            durationMs={executionPlan.durationMs}
            onClose={() => setExecutionPlan(null)}
          />
        </div>
      )}

      {/* Save Query Dialog */}
      <SaveQueryDialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen} query={tab.query} />
    </div>
  )
}
