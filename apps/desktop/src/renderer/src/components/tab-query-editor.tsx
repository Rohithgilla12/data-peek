import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Database } from 'lucide-react'
import { useExecutionPlanResize } from '@/hooks/use-execution-plan-resize'
import { usePanelCollapse } from '@/hooks/use-panel-collapse'

import {
  useTabStore,
  useConnectionStore,
  useQueryStore,
  useSettingsStore,
  useTabTelemetry,
  useTabPerfIndicator,
  useSnippetStore,
  notify
} from '@/stores'
import { isExecutableTab, type Tab, type MultiQueryResult } from '@/stores/tab-store'
import type { StatementResult } from '@data-peek/shared'
import { type DataTableFilter, type DataTableSort } from '@/components/data-table'
import { sqlMatchesStoredTable } from '@/lib/editable-select'
import {
  resolveForRun,
  crossTabErrorMessage,
  buildCrossTabRefs,
  isHeavyResolve
} from '@/lib/cross-tab-integration'
import type { ResolveForRunSummary } from '@/lib/cross-tab-integration'
import { CrossTabSubmitDialog } from '@/components/cross-tab/cross-tab-submit-dialog'
import { SQLEditor } from '@/components/sql-editor'
import { formatSQL } from '@/lib/sql-formatter'
import {
  copyExportToClipboard,
  downloadExport,
  generateExportFilename,
  maskExportData
} from '@/lib/export'
import {
  buildQualifiedTableRef,
  buildFullyQualifiedTableRef,
  buildSelectQuery,
  buildCountQuery,
  quoteIdentifier
} from '@/lib/sql-helpers'
import { buildQueryWithFilters } from '@/lib/table-query-builder'
import type { QueryResult as IpcQueryResult, ForeignKeyInfo, ColumnInfo } from '@data-peek/shared'
import { FKPanelStack, type FKPanelItem } from '@/components/fk-panel-stack'
import { ERDVisualization } from '@/components/erd-visualization'
import { ExecutionPlanViewer } from '@/components/execution-plan-viewer'
import { TableDesigner } from '@/components/table-designer'
import { DataGenerator } from '@/components/data-generator'
import { PgNotificationsPanel } from '@/components/pg-notifications-panel'
import { HealthMonitor } from '@/components/health-monitor'
import { SchemaIntelPanel } from '@/components/schema-intel'
import { SaveQueryDialog } from '@/components/save-query-dialog'
import { ShareQueryDialog } from '@/components/share-query-dialog'
import { ColumnStatsPanel } from '@/components/column-stats-panel'
import { useColumnStatsStore } from '@/stores/column-stats-store'
import type { DataTableColumn as DtColumn } from '@/components/data-table'
import { useMaskingStore } from '@/stores/masking-store'
import type { ExportData, ExportDestination, ExportFormat, SQLExportOptions } from '@/lib/export'
import { StepRibbon } from './step-ribbon'
import { StepResultsTabs } from './step-results-tabs'
import { EditorToolbar } from './query-editor/editor-toolbar'
import { QueryResults } from './query-editor/query-results'
import { MaskedExportDialog } from './query-editor/masked-export-dialog'
import { ShareResultsImage } from './query-editor/share-results-image'
import { useEditableResult } from './query-editor/use-editable-result'
import { WatchButton } from '@/components/watch-button'
import type { WatchRunner } from '@/lib/watch-scheduler'
import { watchScheduler } from '@/lib/watch-scheduler'
import { useWatchStore } from '@/stores/watch-store'
import { gateForWatch } from '@/lib/watch-sql-gate'
import { TimeMachineButton } from '@/components/time-machine/time-machine-button'
import { captureRun } from '@/lib/time-machine-capture'
import { resolveSelectKeyColumns } from '@/lib/result-key-columns'
import { useTimeMachineStore } from '@/stores/time-machine-store'
import { useStepStore } from '@/stores/step-store'
import { DDL_KEYWORD_REGEX } from '@shared/index'
import type { editor as monacoEditor } from 'monaco-editor'

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
  const setTablePreviewTotalCount = useTabStore((s) => s.setTablePreviewTotalCount)
  const updateTablePreviewPagination = useTabStore((s) => s.updateTablePreviewPagination)

  const connections = useConnectionStore((s) => s.connections)
  const schemas = useConnectionStore((s) => s.schemas)
  const getEnumValues = useConnectionStore((s) => s.getEnumValues)
  const addToHistory = useQueryStore((s) => s.addToHistory)
  const hideQueryEditorByDefault = useSettingsStore((s) => s.hideQueryEditorByDefault)
  const queryTimeoutMs = useSettingsStore((s) => s.queryTimeoutMs)
  const getAllSnippets = useSnippetStore((s) => s.getAllSnippets)
  const initializeSnippets = useSnippetStore((s) => s.initializeSnippets)
  const allSnippets = getAllSnippets()

  const allTabs = useTabStore((s) => s.tabs)
  const crossTabRefs = useMemo(
    () => buildCrossTabRefs(allTabs, tab?.connectionId ?? null, tabId),
    [allTabs, tab?.connectionId, tabId]
  )

  const stepSession = useStepStore((s) => s.sessions.get(tabId))
  const startStep = useStepStore((s) => s.startStep)
  const toggleBreakpoint = useStepStore((s) => s.toggleBreakpoint)
  const [inTransactionMode, setInTransactionMode] = useState(false)
  const [autoCommit, setAutoCommit] = useState(true)
  const [hasActiveTransaction, setHasActiveTransaction] = useState(false)

  const tabQuery = tab && 'query' in tab ? tab.query : ''
  const tabType = tab?.type

  useEffect(() => {
    if (tabType !== 'query') return
    const hasDDL = DDL_KEYWORD_REGEX.test(tabQuery)
    setInTransactionMode(!hasDDL)
  }, [tabQuery, tabType])

  // Initialize snippets on mount
  useEffect(() => {
    initializeSnippets()
  }, [initializeSnippets])

  // Telemetry state
  const {
    telemetry,
    benchmark,
    isRunningBenchmark,
    showTelemetryPanel,
    showConnectionOverhead,
    selectedPercentile,
    viewMode,
    setTelemetry,
    setBenchmark,
    setShowTelemetryPanel,
    setShowConnectionOverhead,
    setSelectedPercentile,
    setViewMode,
    setRunningBenchmark
  } = useTabTelemetry(tabId)

  // Performance indicator state
  const {
    analysis: perfAnalysis,
    isAnalyzing: isPerfAnalyzing,
    showPerfPanel,
    showCritical,
    showWarning,
    showInfo,
    setAnalysis: setPerfAnalysis,
    setShowPerfPanel,
    setAnalyzing: setPerfAnalyzing,
    toggleSeverityFilter
  } = useTabPerfIndicator(tabId)

  // Get the connection for this tab
  const tabConnection = tab?.connectionId
    ? connections.find((c) => c.id === tab.connectionId)
    : null

  // Track if we've already attempted auto-run for this tab
  const hasAutoRun = useRef(false)

  // Monaco editor ref for step-through decorations
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)
  const [editorMounted, setEditorMounted] = useState(false)
  const activeLineDecoIds = useRef<string[]>([])
  const breakpointDecoIds = useRef<string[]>([])

  // Panel collapse state (extracted to hook)
  const { isEditorCollapsed, setIsEditorCollapsed, isResultsCollapsed, setIsResultsCollapsed } =
    usePanelCollapse({
      initialEditorCollapsed: tab?.type === 'table-preview' ? hideQueryEditorByDefault : false
    })

  // Track client-side filters and sorting for "Apply to Query"
  const [tableFilters, setTableFilters] = useState<DataTableFilter[]>([])
  const [tableSorting, setTableSorting] = useState<DataTableSort[]>([])

  // FK Panel stack state
  const [fkPanels, setFkPanels] = useState<FKPanelItem[]>([])

  // Column stats panel state
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

  // Execution plan state (resize logic extracted to hook)
  const [executionPlan, setExecutionPlan] = useState<{
    plan: unknown[]
    durationMs: number
  } | null>(null)
  const [isExplaining, setIsExplaining] = useState(false)
  const { executionPlanWidth, startResizing } = useExecutionPlanResize()

  // Save query dialog state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)

  // Share query dialog state
  const [shareDialogOpen, setShareDialogOpen] = useState(false)

  // Share results image dialog state
  const [shareResultsOpen, setShareResultsOpen] = useState(false)

  // Cross-tab @name reference state: pill summary + heavy-run confirm gating.
  const [refsSummary, setRefsSummary] = useState<ResolveForRunSummary | null>(null)
  const [pendingHeavyRun, setPendingHeavyRun] = useState<{
    summary: ResolveForRunSummary
    sql: string
    originalQuery: string
  } | null>(null)
  const skipHeavyConfirmRef = useRef(false)

  // Export with masked columns confirmation
  const [pendingExport, setPendingExport] = useState<null | {
    format: ExportFormat
    destination: ExportDestination
    data: ExportData
    filename: string
  }>(null)

  const getEffectiveMaskedColumns = useMaskingStore((s) => s.getEffectiveMaskedColumns)

  // Get the createForeignKeyTab action
  const createForeignKeyTab = useTabStore((s) => s.createForeignKeyTab)

  const buildMaskedExportData = (data: ExportData): ExportData => {
    const masked = getEffectiveMaskedColumns(
      tabId,
      data.columns.map((c) => c.name)
    )
    if (masked.size === 0) return data
    return maskExportData(data, masked)
  }

  // Export data for the currently visible result set. For multi-statement queries this
  // follows the active statement tab instead of always exporting the first result.
  const getCurrentExportData = (): ExportData | null => {
    if (!tab || !('result' in tab)) return null
    const idx = tab.activeResultIndex ?? 0
    const stmt = tab.multiResult?.statements?.[idx]
    if (stmt) {
      return {
        columns: stmt.fields.map((f) => ({ name: f.name, dataType: f.dataType })),
        rows: stmt.rows as Record<string, unknown>[]
      }
    }
    return tab.result ?? null
  }

  const handleExport = (
    format: ExportFormat,
    destination: ExportDestination,
    data: ExportData,
    filename: string
  ) => {
    const masked = getEffectiveMaskedColumns(
      tabId,
      data.columns.map((c) => c.name)
    )
    if (masked.size > 0) {
      setPendingExport({ format, destination, data, filename })
      return
    }
    void doExport(format, destination, data, filename)
  }

  const getSQLExportOptions = (): SQLExportOptions => ({
    tableName: tab && tab.type === 'table-preview' ? tab.tableName : 'query_result',
    schemaName: tab && tab.type === 'table-preview' ? tab.schemaName : undefined
  })

  const doExport = async (
    format: ExportFormat,
    destination: ExportDestination,
    data: ExportData,
    filename: string
  ) => {
    const options = format === 'sql' ? getSQLExportOptions() : undefined

    try {
      if (destination === 'clipboard') {
        await copyExportToClipboard(data, format, options)
        notify.success(`Copied ${format.toUpperCase()} export to clipboard`)
      } else {
        downloadExport(data, format, filename, options)
      }
    } catch (error) {
      const action = destination === 'clipboard' ? 'Copy' : 'Export'
      notify.error(
        `${action} failed`,
        error instanceof Error ? error.message : 'An unexpected error occurred'
      )
    }
  }

  // Execution body for a query run. `sqlToExecute` is the resolved SQL actually sent to
  // the database (with cross-tab @name references inlined). `originalQuery` is the user's
  // typed text, used for history and stored-table checks so they reflect intent, not the
  // expanded CTE payload. Reads fresh tab state from the store to avoid stale closures.
  const executeSql = useCallback(
    async (sqlToExecute: string, originalQuery: string) => {
      const currentTab = useTabStore.getState().getTab(tabId)
      if (!currentTab || !isExecutableTab(currentTab) || !tabConnection || currentTab.isExecuting)
        return

      // Generate unique execution ID for cancellation support
      const executionId = crypto.randomUUID()
      updateTabExecuting(tabId, true, executionId)

      // Running a query always returns the panel to the live result — leaving
      // a Time Machine snapshot on screen would silently hide the fresh rows.
      useTimeMachineStore.getState().backToLive(tabId)

      // Drop any state writes from this execution if the tab has moved on (cancelled,
      // re-run, or closed-and-reopened in the same session). Without this, a slow
      // response from execution A can clobber the result of execution B that started
      // after the user hit Stop or Run again.
      const isStillCurrent = (): boolean => {
        const t = useTabStore.getState().getTab(tabId)
        return !!t && isExecutableTab(t) && t.executionId === executionId
      }

      // Clear previous benchmark when running a new query
      setBenchmark(null)

      const targetSessionId = !autoCommit && tab?.id ? tab.id : undefined

      try {
        if (!autoCommit && !hasActiveTransaction && tab?.id) {
          const beginRes = await window.api.db.beginTransaction(tabConnection, tab.id)
          if (beginRes.success) {
            setHasActiveTransaction(true)
          } else {
            console.error('Failed to begin transaction', beginRes.error)
          }
        }

        // Use telemetry-enabled query API with timeout from settings
        const response = await window.api.db.queryWithTelemetry(
          tabConnection,
          sqlToExecute,
          executionId,
          queryTimeoutMs,
          targetSessionId
        )

        if (!isStillCurrent()) return

        if (response.success && response.data) {
          const data = response.data as {
            results: StatementResult[]
            totalDurationMs: number
            statementCount: number
            telemetry?: import('@data-peek/shared').QueryTelemetry
          } & IpcQueryResult

          // Store telemetry data if available
          if (data.telemetry) {
            setTelemetry(data.telemetry)
          } else {
            setTelemetry(null)
          }

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

            // For table preview tabs, fetch total count for server-side pagination —
            // but only if the executed SQL still queries the stored table. If the user
            // rewrote the SQL to a different table, the stored table's count would be
            // wrong and would mislead the pagination footer.
            const previewSqlMatches =
              currentTab.type === 'table-preview' &&
              sqlMatchesStoredTable(
                originalQuery,
                { schema: currentTab.schemaName, table: currentTab.tableName },
                tabConnection.dbType
              )
            if (currentTab.type === 'table-preview') {
              if (previewSqlMatches) {
                try {
                  const countTableRef = buildQualifiedTableRef(
                    currentTab.schemaName,
                    currentTab.tableName,
                    tabConnection.dbType
                  )
                  const countQuery = buildCountQuery(countTableRef)
                  const countResponse = await window.api.db.query(tabConnection, countQuery)
                  if (isStillCurrent() && countResponse.success && countResponse.data) {
                    const countData = countResponse.data as IpcQueryResult
                    if (countData.rows?.[0]) {
                      const totalCount = Number(
                        (countData.rows[0] as Record<string, unknown>).total
                      )
                      if (!isNaN(totalCount)) {
                        setTablePreviewTotalCount(tabId, totalCount)
                      }
                    }
                  } else if (isStillCurrent()) {
                    // Count query failed — drop any stale total so the footer falls back
                    // to client-side pagination over the result we did get.
                    setTablePreviewTotalCount(tabId, null)
                  }
                } catch {
                  if (isStillCurrent()) setTablePreviewTotalCount(tabId, null)
                }
              } else if (isStillCurrent()) {
                // SQL diverged from the stored table — the previous totalRowCount was for
                // a different row set; clear it so the UI exits server-side pagination
                // mode rather than showing the wrong total.
                setTablePreviewTotalCount(tabId, null)
              }
            }

            // Add to global history with total row count
            const totalRows = multiResult.statements.reduce((sum, s) => sum + s.rowCount, 0)
            addToHistory({
              query: originalQuery,
              durationMs: multiResult.totalDurationMs,
              rowCount: totalRows,
              status: 'success',
              connectionId: tabConnection.id
            })

            captureRun(tabId, {
              enabled: useSettingsStore.getState().timeMachineEnabled,
              tabType: currentTab.type,
              connectionId: tabConnection.id,
              sql: originalQuery,
              statements: multiResult.statements,
              explicitKeyColumns: resolveSelectKeyColumns(
                originalQuery,
                tabConnection.dbType,
                useConnectionStore.getState().schemas
              ),
              maskedColumns: useMaskingStore
                .getState()
                .getEffectiveMaskedColumns(
                  tabId,
                  multiResult.statements
                    .find((s) => s.isDataReturning)
                    ?.fields.map((f) => f.name) ?? []
                ),
              capturedAt: Date.now()
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
              query: originalQuery,
              durationMs: singleResult.durationMs,
              rowCount: result.rowCount,
              status: 'success',
              connectionId: tabConnection.id
            })
          }
        } else {
          const errorMessage = response.error ?? 'Query execution failed'
          updateTabMultiResult(tabId, null, errorMessage)
          setTelemetry(null)

          addToHistory({
            query: originalQuery,
            durationMs: 0,
            rowCount: 0,
            status: 'error',
            connectionId: tabConnection.id,
            errorMessage
          })
        }
      } catch (error) {
        if (!isStillCurrent()) return
        const errorMessage = error instanceof Error ? error.message : String(error)
        updateTabMultiResult(tabId, null, errorMessage)
        setTelemetry(null)
      } finally {
        // CAS by executionId so a stale finally can't unset a newer execution's flag.
        updateTabExecuting(tabId, false, undefined, executionId)
      }
    },
    [
      tabConnection,
      tabId,
      updateTabExecuting,
      updateTabResult,
      updateTabMultiResult,
      markTabSaved,
      addToHistory,
      setTelemetry,
      setBenchmark,
      queryTimeoutMs,
      setTablePreviewTotalCount,
      autoCommit,
      hasActiveTransaction,
      tab?.id
    ]
  )

  const handleRunQuery = useCallback(
    async (selectedSql?: string) => {
      // Read fresh tab state from store to avoid stale closure issues
      // (important for server-side pagination where query is updated before this runs)
      const currentTab = useTabStore.getState().getTab(tabId)

      if (!currentTab || !isExecutableTab(currentTab) || !tabConnection || currentTab.isExecuting) {
        return
      }

      const queryToRun = (selectedSql ?? currentTab.query).trim()
      if (!queryToRun) return

      // Resolve @name cross-tab references into VALUES-backed CTEs.
      const resolved = resolveForRun(queryToRun, {
        dbType: tabConnection.dbType,
        connectionId: currentTab.connectionId,
        currentTabId: tabId,
        tabs: useTabStore.getState().tabs
      })
      if (!resolved.ok) {
        setRefsSummary(null)
        updateTabMultiResult(tabId, null, crossTabErrorMessage(resolved.error))
        return
      }

      const summary = resolved.summary

      // Heavy inlined payloads get a confirm dialog so the user knows what's about to run.
      const isHeavy = isHeavyResolve(summary)
      if (isHeavy && !skipHeavyConfirmRef.current) {
        setPendingHeavyRun({ summary, sql: resolved.finalSql, originalQuery: queryToRun })
        return
      }

      setRefsSummary(summary.refCount > 0 ? summary : null)
      await executeSql(resolved.finalSql, queryToRun)
    },
    [tabId, tabConnection, executeSql, updateTabMultiResult]
  )

  const handleCancelQuery = useCallback(async () => {
    if (!tab || !isExecutableTab(tab)) return
    if (!tab.isExecuting || !tab.executionId) return

    // Snapshot the executionId we're cancelling. If the user starts a new query before
    // the cancel response comes back, we mustn't overwrite the new query's state with
    // "Query cancelled by user".
    const cancelledExecutionId = tab.executionId

    try {
      const response = await window.api.db.cancelQuery(cancelledExecutionId)
      if (response.success) {
        const current = useTabStore.getState().getTab(tabId)
        if (current && isExecutableTab(current) && current.executionId === cancelledExecutionId) {
          updateTabMultiResult(tabId, null, 'Query cancelled by user')
          updateTabExecuting(tabId, false, null, cancelledExecutionId)
        }
      }
    } catch (error) {
      console.error('Failed to cancel query:', error)
    }
  }, [tab, tabId, updateTabMultiResult, updateTabExecuting])

  // Handle server-side pagination for table preview tabs
  const handleTablePreviewPaginationChange = useCallback(
    async (page: number, pageSize: number) => {
      // Read fresh state to check if we can proceed
      const currentTab = useTabStore.getState().getTab(tabId)
      if (
        !currentTab ||
        currentTab.type !== 'table-preview' ||
        !tabConnection ||
        currentTab.isExecuting
      )
        return

      // If the user has rewritten the editor SQL to a different table, we cannot
      // safely rebuild a server-side pagination query — that would silently replace
      // their typed SQL with a SELECT against the stored table. Update pagination
      // state only; rendering falls back to client-side over the existing result set.
      const sqlStillMatches = sqlMatchesStoredTable(
        currentTab.savedQuery ?? currentTab.query,
        { schema: currentTab.schemaName, table: currentTab.tableName },
        tabConnection.dbType
      )

      if (!sqlStillMatches) {
        updateTablePreviewPagination(tabId, page, pageSize, null)
        return
      }

      const offset = (page - 1) * pageSize
      const sqlTableRef = buildQualifiedTableRef(
        currentTab.schemaName,
        currentTab.tableName,
        tabConnection.dbType
      )
      const rebuiltQuery = buildSelectQuery(sqlTableRef, tabConnection.dbType, {
        limit: pageSize,
        offset
      })

      updateTablePreviewPagination(tabId, page, pageSize, rebuiltQuery)

      // Re-run the query - handleRunQuery reads fresh state from store
      handleRunQuery()
    },
    [tabConnection, tabId, updateTablePreviewPagination, handleRunQuery]
  )

  const handleFormatQuery = () => {
    if (!tab || !isExecutableTab(tab) || !tab.query.trim()) return
    const formatted = formatSQL(tab.query)
    updateTabQuery(tabId, formatted)
  }

  // Handle benchmark execution
  const handleBenchmark = useCallback(
    async (runCount: number) => {
      if (
        !tab ||
        !isExecutableTab(tab) ||
        !tabConnection ||
        tab.isExecuting ||
        isRunningBenchmark ||
        !tab.query.trim()
      ) {
        return
      }

      setRunningBenchmark(true)
      // Clear previous telemetry and show panel
      setTelemetry(null)
      setBenchmark(null)
      setShowTelemetryPanel(true)

      try {
        const response = await window.api.db.benchmark(tabConnection, tab.query, runCount)

        if (response.success && response.data) {
          setBenchmark(response.data)
          // Also set the first run's telemetry for display
          if (response.data.telemetryRuns.length > 0) {
            setTelemetry(response.data.telemetryRuns[0])
          }
        } else {
          // Show error notification to user
          notify.error('Benchmark failed', response.error || 'An unexpected error occurred')
        }
      } catch (error) {
        notify.error(
          'Benchmark failed',
          error instanceof Error ? error.message : 'An unexpected error occurred'
        )
      } finally {
        setRunningBenchmark(false)
      }
    },
    [
      tab,
      tabConnection,
      isRunningBenchmark,
      setRunningBenchmark,
      setTelemetry,
      setBenchmark,
      setShowTelemetryPanel
    ]
  )

  const handleExplainQuery = useCallback(async () => {
    if (!tab || !isExecutableTab(tab) || !tabConnection || isExplaining || !tab.query.trim()) {
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

  // Get query history for performance analysis
  const queryHistory = useQueryStore((s) => s.history)

  const handleAnalyzePerformance = useCallback(async () => {
    if (!tab || !isExecutableTab(tab) || !tabConnection || isPerfAnalyzing || !tab.query.trim()) {
      return
    }

    // Only support PostgreSQL for now
    if (tabConnection.dbType && tabConnection.dbType !== 'postgresql') {
      notify.info(
        'Not Supported',
        'Performance analysis is currently only available for PostgreSQL databases.'
      )
      return
    }

    setPerfAnalyzing(true)

    try {
      // Convert query history to the format expected by the API
      const historyForAnalysis = queryHistory
        .filter((h) => h.connectionId === tabConnection.id)
        .slice(0, 50)
        .map((h) => ({
          query: h.query,
          timestamp: h.timestamp instanceof Date ? h.timestamp.getTime() : h.timestamp,
          connectionId: h.connectionId
        }))

      const response = await window.api.db.analyzePerformance(
        tabConnection,
        tab.query,
        historyForAnalysis
      )

      if (response.success && response.data) {
        setPerfAnalysis(response.data)
        setShowPerfPanel(true)
      } else {
        notify.error('Analysis Failed', response.error ?? 'Failed to analyze query performance')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      notify.error('Analysis Error', errorMessage)
    } finally {
      setPerfAnalyzing(false)
    }
  }, [
    tab,
    tabConnection,
    isPerfAnalyzing,
    queryHistory,
    setPerfAnalyzing,
    setPerfAnalysis,
    setShowPerfPanel
  ])

  const handleQueryChange = (value: string) => {
    updateTabQuery(tabId, value)
  }

  const handleStartStep = useCallback(async () => {
    if (!tab || tab.type !== 'query' || !tab.query.trim() || stepSession) return
    await startStep(tabId, tab.query, inTransactionMode)
  }, [tab, stepSession, startStep, tabId, inTransactionMode])

  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco || !editorMounted) return
    if (tabConnection?.dbType !== 'postgresql') return

    const disposable = editor.addAction({
      id: 'datapeek.start-step',
      label: 'Start Step-Through',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter],
      run: () => {
        handleStartStep()
      }
    })

    return () => disposable.dispose()
  }, [handleStartStep, editorMounted, tabConnection?.dbType])

  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco || !editorMounted || !stepSession) return

    const nextAction = editor.addAction({
      id: 'datapeek.step-next',
      label: 'Step: Next',
      keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.Enter],
      run: () => {
        const current = useStepStore.getState().sessions.get(tabId)
        if (current?.state === 'paused') useStepStore.getState().nextStep(tabId)
      }
    })

    const stopAction = editor.addAction({
      id: 'datapeek.step-stop',
      label: 'Step: Stop',
      keybindings: [monaco.KeyCode.Escape],
      run: () => {
        useStepStore.getState().stopStep(tabId)
      }
    })

    return () => {
      nextAction.dispose()
      stopAction.dispose()
    }
  }, [stepSession, tabId, editorMounted])

  // Active statement highlight
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    if (stepSession && stepSession.state !== 'done') {
      const current = stepSession.statements[stepSession.cursorIndex]
      if (current) {
        const updateDecorations = () => {
          activeLineDecoIds.current = editor.deltaDecorations(activeLineDecoIds.current, [
            {
              range: {
                startLineNumber: current.startLine,
                startColumn: 1,
                endLineNumber: current.endLine,
                endColumn: 1
              },
              options: {
                isWholeLine: true,
                className: 'step-active-line',
                linesDecorationsClassName: 'step-active-marker'
              }
            }
          ])
        }

        const globalDoc =
          typeof document !== 'undefined'
            ? (document as Document & { startViewTransition?: (cb: () => void) => void })
            : null
        if (globalDoc?.startViewTransition) {
          globalDoc.startViewTransition(() => {
            updateDecorations()
          })
        } else {
          updateDecorations()
        }
      }
    } else {
      activeLineDecoIds.current = editor.deltaDecorations(activeLineDecoIds.current, [])
    }
  }, [stepSession?.cursorIndex, stepSession?.state, stepSession?.statements])

  // Breakpoint decorations
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    if (!stepSession) {
      breakpointDecoIds.current = editor.deltaDecorations(breakpointDecoIds.current, [])
      return
    }

    const decorations = [...stepSession.breakpoints]
      .map((stmtIdx) => {
        const stmt = stepSession.statements[stmtIdx]
        if (!stmt) return null
        return {
          range: {
            startLineNumber: stmt.startLine,
            startColumn: 1,
            endLineNumber: stmt.startLine,
            endColumn: 1
          },
          options: { glyphMarginClassName: 'step-breakpoint' }
        }
      })
      .filter(Boolean) as Parameters<typeof editor.deltaDecorations>[1]

    breakpointDecoIds.current = editor.deltaDecorations(breakpointDecoIds.current, decorations)
  }, [stepSession?.breakpoints, stepSession?.statements, stepSession])

  // Breakpoint gutter click handler
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !stepSession) return

    const disposable = editor.onMouseDown((e) => {
      if (e.target.type !== 2) return
      const line = e.target.position?.lineNumber
      if (!line) return

      const stmt = stepSession.statements.find((s) => s.startLine === line)
      if (!stmt) return

      toggleBreakpoint(tabId, stmt.index)
    })

    return () => disposable.dispose()
  }, [stepSession, tabId, toggleBreakpoint])

  const { getColumnsWithFKInfo, getColumnsForEditing, getEditContext } = useEditableResult({
    tab,
    schemas,
    tabConnection,
    getEnumValues
  })

  // FK Panel: Fetch data for a referenced row
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

      // Format value for SQL
      let formattedValue: string
      if (value === null || value === undefined) {
        formattedValue = 'NULL'
      } else if (typeof value === 'string') {
        formattedValue = `'${value.replace(/'/g, "''")}'`
      } else {
        formattedValue = String(value)
      }

      const quotedCol = quoteIdentifier(fk.referencedColumn, tabConnection.dbType)
      const whereClause = `WHERE ${quotedCol} = ${formattedValue}`
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

  // Column Stats: Handle column header stats click
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

  // Generate SQL WHERE clause from filters
  const handleApplyToQuery = () => {
    if (!tab || (tableFilters.length === 0 && tableSorting.length === 0)) return
    const newQuery = buildQueryWithFilters({
      tab,
      dbType: tabConnection?.dbType,
      filters: tableFilters,
      sorting: tableSorting
    })
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

  // Watch Mode runner. The scheduler holds runnerRef from this object across
  // ticks. We read the latest query/connection from the store at runQuery time
  // so that an in-flight watch never sees stale closures.
  const watchRunner = useMemo<WatchRunner>(
    () => ({
      runQuery: async () => {
        const live = useTabStore.getState().getTab(tabId)
        const liveConn = live?.connectionId
          ? useConnectionStore.getState().connections.find((c) => c.id === live.connectionId)
          : null
        if (!live || !isExecutableTab(live) || !liveConn) {
          return { rows: [], fields: [], durationMs: 0, error: 'No active connection.' }
        }
        const sql = live.query.trim()
        if (!sql) return { rows: [], fields: [], durationMs: 0, error: 'Empty query.' }
        try {
          const response = await window.api.db.query(liveConn, sql)
          if (!response.success || !response.data) {
            return {
              rows: [],
              fields: [],
              durationMs: 0,
              error: response.error ?? 'Query failed.'
            }
          }
          const data = response.data as IpcQueryResult
          return {
            rows: data.rows as Record<string, unknown>[],
            fields: data.fields,
            durationMs: data.durationMs,
            error: null
          }
        } catch (err) {
          return {
            rows: [],
            fields: [],
            durationMs: 0,
            error: err instanceof Error ? err.message : String(err)
          }
        }
      },
      getKeyColumns: () => {
        const live = useTabStore.getState().getTab(tabId)
        if (!live) return undefined
        const allSchemas = useConnectionStore.getState().schemas

        // Table-preview tabs know their table directly.
        if (live.type === 'table-preview') {
          const schemaInfo = allSchemas.find((s) => s.name === live.schemaName)
          const tableInfo = schemaInfo?.tables.find((t) => t.name === live.tableName)
          const pks = tableInfo?.columns.filter((c) => c.isPrimaryKey).map((c) => c.name)
          return pks && pks.length > 0 ? pks : undefined
        }

        // Query tabs: single-table SELECTs resolve their PK from the schema
        // cache (shared with Time Machine capture so both key rows the same
        // way); pickKeyingPlan's heuristic covers everything else.
        if (live.type === 'query' && tabConnection) {
          return resolveSelectKeyColumns(live.query, tabConnection.dbType, allSchemas)
        }
        return undefined
      }
    }),
    [tabId, tabConnection]
  )

  // Cmd+Shift+W is wired via the native menu (see main/menu.ts → 'Toggle
  // Watch Mode'). Menu accelerators win over renderer keybindings on
  // Electron, so we subscribe to the menu IPC here rather than using
  // useHotkeys. Scoped to the currently-mounted query editor so multi-window
  // setups toggle the focused tab.
  const handleToggleWatch = useCallback(() => {
    const t = useTabStore.getState().getTab(tabId)
    if (!t || !isExecutableTab(t) || !tabConnection) return
    const st = useWatchStore.getState()
    if (st.isWatching(tabId)) {
      st.stop(tabId)
      watchScheduler.unregister(tabId)
      return
    }
    const sql = ('query' in t ? t.query : '').trim()
    if (!sql) return
    if (!gateForWatch(sql).ok) return
    st.start(tabId)
    watchScheduler.register(tabId, {
      runQuery: () => watchRunner.runQuery(),
      getKeyColumns: () => watchRunner.getKeyColumns?.()
    })
  }, [tabId, tabConnection, watchRunner])

  useEffect(() => window.api.menu.onToggleWatch(handleToggleWatch), [handleToggleWatch])

  // ⌘⇧H — same menu-accelerator wiring as Watch Mode (menu wins over
  // renderer keybindings on Electron).
  const handleToggleTimeMachine = useCallback(() => {
    const t = useTabStore.getState().getTab(tabId)
    if (!t || t.type !== 'query') return
    if (!useSettingsStore.getState().timeMachineEnabled) return
    const tm = useTimeMachineStore.getState()
    if (tm.getState(tabId)?.open) {
      tm.closeStrip(tabId)
    } else {
      tm.openStrip(tabId)
    }
  }, [tabId])

  useEffect(
    () => window.api.menu.onToggleTimeMachine(handleToggleTimeMachine),
    [handleToggleTimeMachine]
  )

  // Roll back any open transaction when the tab unmounts. Refs keep the
  // cleanup unmount-only without re-running on state changes.
  const transactionCleanupRef = useRef({ hasActiveTransaction, tabConnection })
  transactionCleanupRef.current = { hasActiveTransaction, tabConnection }
  useEffect(() => {
    return () => {
      const { hasActiveTransaction: active, tabConnection: conn } = transactionCleanupRef.current
      if (active && conn) {
        window.api.db.rollbackTransaction(conn, tabId).catch(() => {})
      }
    }
  }, [tabId])

  if (!tab || tab.type === 'notebook') {
    return null
  }

  // Handle explicit Commit and Rollback
  const handleCommit = async (): Promise<void> => {
    if (!tabConnection) return
    const res = await window.api.db.commitTransaction(tabConnection, tab.id)
    if (res.success) {
      setHasActiveTransaction(false)
    }
  }

  const handleRollback = async (): Promise<void> => {
    if (!tabConnection) return
    const res = await window.api.db.rollbackTransaction(tabConnection, tab.id)
    if (res.success) {
      setHasActiveTransaction(false)
    }
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

  // Render Data Generator for data-generator tabs
  if (tab.type === 'data-generator') {
    return <DataGenerator tabId={tabId} />
  }

  // Render PG Notifications panel
  if (tab.type === 'pg-notifications') {
    return <PgNotificationsPanel tabId={tabId} />
  }

  // Render Health Monitor dashboard
  if (tab.type === 'health-monitor') {
    return <HealthMonitor tabId={tabId} />
  }

  // Render Schema Intel / diagnostics panel
  if (tab.type === 'schema-intel') {
    return <SchemaIntelPanel tabId={tabId} />
  }

  // Get statement results for multi-statement queries
  const statementResults = getAllStatementResults(tabId)
  const activeStatementResult = getActiveStatementResult(tabId)
  const hasMultipleResults = statementResults.length > 1
  // At this point, tab is guaranteed to be query or table-preview (not erd or table-designer)
  const activeResultIndex = tab.activeResultIndex ?? 0

  // For query tabs, pass all rows and let DataTable handle client-side pagination
  // For table-preview tabs with server-side pagination, rows are already limited by SQL
  const getAllRows = (): Record<string, unknown>[] => {
    if (hasMultipleResults) {
      const statement = tab.multiResult?.statements?.[tab.activeResultIndex]
      return (statement?.rows ?? []) as Record<string, unknown>[]
    }
    return (tab.result?.rows ?? []) as Record<string, unknown>[]
  }

  // Only use store pagination for table-preview with server-side pagination (for backward compat display)
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
              snippets={allSnippets}
              readOnly={!!stepSession}
              glyphMargin={!!stepSession}
              crossTabRefs={crossTabRefs}
              crossTabDialect={tabConnection?.dbType}
              onMount={(editor, monaco) => {
                editorRef.current = editor
                monacoRef.current = monaco
                setEditorMounted(true)
              }}
            />
          </div>
        )}

        <EditorToolbar
          tab={tab}
          tabConnection={tabConnection}
          isEditorCollapsed={isEditorCollapsed}
          setIsEditorCollapsed={setIsEditorCollapsed}
          isResultsCollapsed={isResultsCollapsed}
          setIsResultsCollapsed={setIsResultsCollapsed}
          handleCancelQuery={handleCancelQuery}
          handleRunQuery={handleRunQuery}
          handleStartStep={handleStartStep}
          inTransactionMode={inTransactionMode}
          setInTransactionMode={setInTransactionMode}
          stepSession={stepSession}
          autoCommit={autoCommit}
          setAutoCommit={setAutoCommit}
          hasActiveTransaction={hasActiveTransaction}
          handleCommit={handleCommit}
          handleRollback={handleRollback}
          handleExplainQuery={handleExplainQuery}
          isExplaining={isExplaining}
          handleBenchmark={handleBenchmark}
          isRunningBenchmark={isRunningBenchmark}
          handleFormatQuery={handleFormatQuery}
          setSaveDialogOpen={setSaveDialogOpen}
          setShareDialogOpen={setShareDialogOpen}
          watchSlot={
            <WatchButton
              tabId={tabId}
              query={tabQuery}
              runner={watchRunner}
              disabled={!tabConnection}
            />
          }
          timeMachineSlot={
            tab.type === 'query' ? (
              <TimeMachineButton tabId={tabId} disabled={!tabConnection} />
            ) : undefined
          }
          refsSlot={
            refsSummary ? (
              <code className="text-[10px] bg-muted/50 px-2 py-0.5 rounded">
                {refsSummary.refCount} {refsSummary.refCount === 1 ? 'ref' : 'refs'} ·{' '}
                {refsSummary.rowsInlined.toLocaleString()} rows inlined
              </code>
            ) : undefined
          }
        />
      </div>

      <QueryResults
        tabId={tabId}
        tab={tab}
        tabConnection={tabConnection}
        isResultsCollapsed={isResultsCollapsed}
        setIsResultsCollapsed={setIsResultsCollapsed}
        hasMultipleResults={hasMultipleResults}
        statementResults={statementResults}
        activeStatementResult={activeStatementResult}
        activeResultIndex={activeResultIndex}
        setActiveResultIndex={setActiveResultIndex}
        getEditContext={getEditContext}
        getColumnsForEditing={getColumnsForEditing}
        paginatedRows={paginatedRows}
        setTableFilters={setTableFilters}
        setTableSorting={setTableSorting}
        hasActiveFiltersOrSorting={hasActiveFiltersOrSorting}
        handleApplyToQuery={handleApplyToQuery}
        handleFKClick={handleFKClick}
        handleFKOpenTab={handleFKOpenTab}
        handleColumnStatsClick={handleColumnStatsClick}
        handleRunQuery={handleRunQuery}
        handleTablePreviewPaginationChange={handleTablePreviewPaginationChange}
        getActiveResultColumns={getActiveResultColumns}
        getColumnsWithFKInfo={getColumnsWithFKInfo}
        getAllRows={getAllRows}
        telemetry={telemetry}
        benchmark={benchmark}
        autoCommit={autoCommit}
        hasActiveTransaction={hasActiveTransaction}
        onTransactionStart={() => setHasActiveTransaction(true)}
        showTelemetryPanel={showTelemetryPanel}
        setShowTelemetryPanel={setShowTelemetryPanel}
        showConnectionOverhead={showConnectionOverhead}
        setShowConnectionOverhead={setShowConnectionOverhead}
        selectedPercentile={selectedPercentile}
        setSelectedPercentile={setSelectedPercentile}
        viewMode={viewMode}
        setViewMode={setViewMode}
        perfAnalysis={perfAnalysis}
        showPerfPanel={showPerfPanel}
        setShowPerfPanel={setShowPerfPanel}
        handleAnalyzePerformance={handleAnalyzePerformance}
        isPerfAnalyzing={isPerfAnalyzing}
        showCritical={showCritical}
        showWarning={showWarning}
        showInfo={showInfo}
        toggleSeverityFilter={toggleSeverityFilter}
        setShareResultsOpen={setShareResultsOpen}
        getCurrentExportData={getCurrentExportData}
        handleExport={handleExport}
        generateExportFilename={generateExportFilename}
      />

      {stepSession && <StepResultsTabs tabId={tabId} />}

      {stepSession && <StepRibbon tabId={tabId} />}

      {/* FK Panel Stack */}
      <FKPanelStack
        panels={fkPanels}
        connection={tabConnection}
        onClose={handleCloseFKPanel}
        onCloseAll={handleCloseAllFKPanels}
        onDrillDown={handleFKClick}
        onOpenInTab={handleFKOpenTab}
      />

      {/* Execution Plan Panel */}
      {executionPlan && (
        <>
          {/* Backdrop overlay */}
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setExecutionPlan(null)} />
          <div
            className="fixed top-0 bottom-0 right-0 z-50 shadow-xl bg-background"
            style={{ width: executionPlanWidth }}
          >
            {/* Resize handle */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-primary/50 transition-colors z-10"
              onMouseDown={(e) => {
                e.preventDefault()
                startResizing()
              }}
            />
            <ExecutionPlanViewer
              plan={executionPlan.plan as Parameters<typeof ExecutionPlanViewer>[0]['plan']}
              durationMs={executionPlan.durationMs}
              onClose={() => setExecutionPlan(null)}
            />
          </div>
        </>
      )}

      {/* Column Stats Panel */}
      {columnStatsPanelOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeColumnStatsPanel} />
          <div className="fixed top-0 bottom-0 right-0 z-50 shadow-xl flex flex-col">
            <ColumnStatsPanel
              stats={columnStatsData}
              isLoading={columnStatsLoading}
              error={columnStatsError}
              onClose={closeColumnStatsPanel}
            />
          </div>
        </>
      )}

      {/* Cross-tab heavy-run confirm dialog */}
      <CrossTabSubmitDialog
        open={pendingHeavyRun !== null}
        onOpenChange={(o) => {
          if (!o) setPendingHeavyRun(null)
        }}
        summary={pendingHeavyRun?.summary ?? null}
        onConfirm={(dontAskAgain) => {
          const run = pendingHeavyRun
          setPendingHeavyRun(null)
          if (dontAskAgain) skipHeavyConfirmRef.current = true
          if (run) {
            setRefsSummary(run.summary.refCount > 0 ? run.summary : null)
            void executeSql(run.sql, run.originalQuery)
          }
        }}
      />

      {/* Save Query Dialog */}
      <SaveQueryDialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen} query={tab.query} />

      {/* Share Query Dialog */}
      <ShareQueryDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        query={tab.query}
        connectionType={tabConnection?.dbType}
        connectionName={tabConnection?.name}
      />

      {/* Share Results Image Dialog */}
      <ShareResultsImage
        open={shareResultsOpen}
        onOpenChange={setShareResultsOpen}
        result={tab.result}
        connection={tabConnection}
      />

      {/* Export with masked columns confirmation */}
      <MaskedExportDialog
        pendingExport={pendingExport}
        onOpenChange={(open) => !open && setPendingExport(null)}
        onConfirm={() => {
          if (!pendingExport) return
          const maskedData = buildMaskedExportData(pendingExport.data)
          void doExport(
            pendingExport.format,
            pendingExport.destination,
            maskedData,
            pendingExport.filename
          )
          setPendingExport(null)
        }}
      />
    </div>
  )
}
