import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Database } from 'lucide-react'
import { usePanelCollapse } from '@/hooks/use-panel-collapse'

import {
  useTabStore,
  useConnectionStore,
  useQueryStore,
  useSettingsStore,
  useSnippetStore
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
import { generateExportFilename } from '@/lib/export'
import { buildQualifiedTableRef, buildSelectQuery, buildCountQuery } from '@/lib/sql-helpers'
import { buildQueryWithFilters } from '@/lib/table-query-builder'
import type { QueryResult as IpcQueryResult } from '@data-peek/shared'
import { FKPanelStack } from '@/components/fk-panel-stack'
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
import { StepRibbon } from './step-ribbon'
import { StepResultsTabs } from './step-results-tabs'
import { EditorToolbar } from './query-editor/editor-toolbar'
import { QueryResults } from './query-editor/query-results'
import { MaskedExportDialog } from './query-editor/masked-export-dialog'
import { ShareResultsImage } from './query-editor/share-results-image'
import { useEditableResult } from './query-editor/use-editable-result'
import { useFkPanels } from './query-editor/use-fk-panels'
import { useColumnStatsPanel } from './query-editor/use-column-stats-panel'
import { useQueryAnalysis } from './query-editor/use-query-analysis'
import { useManualTransaction } from './query-editor/use-manual-transaction'
import { useResultExport } from './query-editor/use-result-export'
import { useWatchRunner } from './query-editor/use-watch-runner'
import { WatchButton } from '@/components/watch-button'
import { TimeMachineButton } from '@/components/time-machine/time-machine-button'
import { captureRun } from '@/lib/time-machine-capture'
import { resolveSelectKeyColumns } from '@/lib/result-key-columns'
import { useMaskingStore } from '@/stores/masking-store'
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

  // Get the connection for this tab
  const tabConnection = tab?.connectionId
    ? connections.find((c) => c.id === tab.connectionId)
    : null

  // Telemetry, benchmark, EXPLAIN, and performance-analysis state (extracted to hook)
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
    perf,
    executionPlan,
    setExecutionPlan,
    isExplaining,
    executionPlanWidth,
    startResizing,
    handleBenchmark,
    handleExplainQuery,
    handleAnalyzePerformance
  } = useQueryAnalysis(tabId, tab, tabConnection, updateTabResult)
  const {
    analysis: perfAnalysis,
    isAnalyzing: isPerfAnalyzing,
    showPerfPanel,
    showCritical,
    showWarning,
    showInfo,
    setShowPerfPanel,
    toggleSeverityFilter
  } = perf

  // Manual transaction mode (auto-commit off) — extracted to hook
  const {
    autoCommit,
    setAutoCommit,
    hasActiveTransaction,
    setHasActiveTransaction,
    handleCommit,
    handleRollback
  } = useManualTransaction(tabId, tabConnection)

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

  // FK panel stack (extracted to hook)
  const { fkPanels, handleFKClick, handleFKOpenTab, handleCloseFKPanel, handleCloseAllFKPanels } =
    useFkPanels(tabConnection)

  // Column stats panel (extracted to hook)
  const {
    columnStatsData,
    columnStatsLoading,
    columnStatsError,
    columnStatsPanelOpen,
    handleColumnStatsClick,
    closeColumnStatsPanel
  } = useColumnStatsPanel(tab, tabConnection)

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

  // Result-set export with masked-column confirmation (extracted to hook)
  const {
    pendingExport,
    setPendingExport,
    buildMaskedExportData,
    getCurrentExportData,
    doExport,
    handleExport
  } = useResultExport(tabId, tab)

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
            // Abort the run — proceeding would hit the session map with no open
            // transaction and surface a misleading "no active transaction" error.
            throw new Error(`Failed to begin transaction: ${beginRes.error}`)
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
      tab?.id,
      setHasActiveTransaction
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

  // Watch Mode runner + toggle (extracted to hook; the hook also subscribes
  // the native-menu accelerator)
  const { watchRunner } = useWatchRunner(tabId, tabConnection)

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

  if (!tab || tab.type === 'notebook') {
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
          <div
            role="presentation"
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setExecutionPlan(null)}
          />
          <div
            className="fixed top-0 bottom-0 right-0 z-50 shadow-xl bg-background"
            style={{ width: executionPlanWidth }}
          >
            {/* Resize handle */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize execution plan panel"
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
          <div role="presentation" className="fixed inset-0 z-40" onClick={closeColumnStatsPanel} />
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
