import {
  Download,
  FileJson,
  FileSpreadsheet,
  FileCode2,
  Loader2,
  AlertCircle,
  PanelBottomClose,
  PanelBottom,
  Timer,
  ActivitySquare,
  Share2,
  Play,
  type LucideIcon
} from 'lucide-react'
import {
  Button,
  keys,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@data-peek/ui'

import { DataTable, type DataTableFilter, type DataTableSort } from '@/components/data-table'
import { EditableDataTable } from '@/components/editable-data-table'
import { TelemetryPanel } from '@/components/telemetry-panel'
import { PerfIndicatorPanel } from '@/components/perf-indicator-panel'
import { MaskingToolbar } from '@/components/masking-toolbar'

import { isExecutableTab, type Tab } from '@/stores/tab-store'
import type { TelemetryViewMode } from '@/stores/telemetry-store'
import type { ConnectionWithStatus } from '@/stores/connection-store'
import type { DataTableColumn as EditableColumn } from '@/components/editable-data-table'
import type { DataTableColumn as ResultColumn } from '@/components/data-table'
import type {
  StatementResult,
  EditContext,
  ForeignKeyInfo,
  QueryTelemetry,
  BenchmarkResult,
  PerformanceAnalysisResult
} from '@data-peek/shared'
import type { ExportData } from '@/lib/export'

type Percentile = 'avg' | 'p90' | 'p95' | 'p99'
type ExportType = 'csv' | 'json' | 'sql'

interface QueryResultsProps {
  tabId: string
  tab: Tab
  tabConnection: ConnectionWithStatus | null | undefined
  isResultsCollapsed: boolean
  setIsResultsCollapsed: (v: boolean) => void
  hasMultipleResults: boolean
  statementResults: StatementResult[]
  activeStatementResult: StatementResult | undefined
  activeResultIndex: number
  setActiveResultIndex: (tabId: string, idx: number) => void
  getEditContext: () => EditContext | null
  getColumnsForEditing: () => EditableColumn[]
  paginatedRows: Record<string, unknown>[]
  setTableFilters: (f: DataTableFilter[]) => void
  setTableSorting: (s: DataTableSort[]) => void
  hasActiveFiltersOrSorting: boolean
  handleApplyToQuery: () => void
  handleFKClick: (fk: ForeignKeyInfo, value: unknown) => void
  handleFKOpenTab: (fk: ForeignKeyInfo, value: unknown) => void
  handleColumnStatsClick: (col: ResultColumn) => void
  handleRunQuery: () => void
  handleTablePreviewPaginationChange: (page: number, pageSize: number) => Promise<void>
  getActiveResultColumns: () => { name: string; dataType: string }[]
  getColumnsWithFKInfo: () => ResultColumn[]
  getAllRows: () => Record<string, unknown>[]
  telemetry: QueryTelemetry | null | undefined
  benchmark: BenchmarkResult | null | undefined
  showTelemetryPanel: boolean
  setShowTelemetryPanel: (v: boolean) => void
  showConnectionOverhead: boolean
  setShowConnectionOverhead: (v: boolean) => void
  selectedPercentile: Percentile
  setSelectedPercentile: (v: Percentile) => void
  viewMode: TelemetryViewMode
  setViewMode: (v: TelemetryViewMode) => void
  perfAnalysis: PerformanceAnalysisResult | null | undefined
  showPerfPanel: boolean
  setShowPerfPanel: (v: boolean) => void
  handleAnalyzePerformance: () => void
  isPerfAnalyzing: boolean
  showCritical: boolean
  showWarning: boolean
  showInfo: boolean
  toggleSeverityFilter: (severity: 'info' | 'warning' | 'critical') => void
  setShareResultsOpen: (v: boolean) => void
  getCurrentExportData: () => ExportData | null
  handleExport: (type: ExportType, data: ExportData, filename: string) => void
  generateExportFilename: (tableName?: string) => string
}

export function QueryResults({
  tabId,
  tab,
  tabConnection,
  isResultsCollapsed,
  setIsResultsCollapsed,
  hasMultipleResults,
  statementResults,
  activeStatementResult,
  activeResultIndex,
  setActiveResultIndex,
  getEditContext,
  getColumnsForEditing,
  paginatedRows,
  setTableFilters,
  setTableSorting,
  hasActiveFiltersOrSorting,
  handleApplyToQuery,
  handleFKClick,
  handleFKOpenTab,
  handleColumnStatsClick,
  handleRunQuery,
  handleTablePreviewPaginationChange,
  getActiveResultColumns,
  getColumnsWithFKInfo,
  getAllRows,
  telemetry,
  benchmark,
  showTelemetryPanel,
  setShowTelemetryPanel,
  showConnectionOverhead,
  setShowConnectionOverhead,
  selectedPercentile,
  setSelectedPercentile,
  viewMode,
  setViewMode,
  perfAnalysis,
  showPerfPanel,
  setShowPerfPanel,
  handleAnalyzePerformance,
  isPerfAnalyzing,
  showCritical,
  showWarning,
  showInfo,
  toggleSeverityFilter,
  setShareResultsOpen,
  getCurrentExportData,
  handleExport,
  generateExportFilename
}: QueryResultsProps) {
  const executable = isExecutableTab(tab) ? tab : null
  const tabResult = executable?.result
  const tabMultiResult = executable?.multiResult
  const tabError = executable?.error
  const tabQuery = executable?.query ?? ''
  const pageSize = executable?.pageSize ?? 50
  const tableName = tab.type === 'table-preview' ? tab.tableName : undefined
  const hasResults = !!tabResult || !!tabMultiResult

  const runExport = (type: ExportType) => {
    const data = getCurrentExportData()
    if (!data) return
    handleExport(type, data, generateExportFilename(tableName))
  }

  const ExportItem = ({
    type,
    Icon,
    label
  }: {
    type: ExportType
    Icon: LucideIcon
    label: string
  }) => (
    <DropdownMenuItem onClick={() => runExport(type)}>
      <Icon className="size-4 text-muted-foreground" />
      {label}
    </DropdownMenuItem>
  )

  return (
    <div
      className={`flex flex-col overflow-hidden transition-all duration-200 ${
        isResultsCollapsed ? 'h-10 shrink-0' : 'flex-1'
      }`}
    >
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
            {tabError ? (
              <span className="flex items-center gap-1.5 text-xs text-red-400">
                <AlertCircle className="size-3" />
                Query Error
              </span>
            ) : hasResults ? (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {hasMultipleResults ? (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-green-500" />
                      {statementResults.length} statements
                    </span>
                    <span className="text-muted-foreground/60">
                      {tabMultiResult?.totalDurationMs}ms
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-green-500" />
                      {tabResult?.rowCount ?? 0} rows
                    </span>
                    <span className="text-muted-foreground/60">{tabResult?.durationMs}ms</span>
                  </>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No results</span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground/50">Results collapsed</span>
        </div>
      ) : tabError ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md text-center space-y-2">
            <AlertCircle className="size-8 text-red-400 mx-auto" />
            <h3 className="font-medium text-red-400">Query Error</h3>
            <p className="text-sm text-muted-foreground">{tabError}</p>
          </div>
        </div>
      ) : hasResults ? (
        <>
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

          <div className="flex-1 overflow-hidden p-3">
            {(() => {
              const editContext = getEditContext()
              const isTablePreview = tab.type === 'table-preview'
              if (editContext && (isTablePreview ? !hasMultipleResults : true)) {
                return (
                  <EditableDataTable
                    key={`result-${activeResultIndex}`}
                    tabId={tabId}
                    columns={getColumnsForEditing()}
                    data={
                      isTablePreview && tab.totalRowCount != null
                        ? ((tabResult?.rows ?? []) as Record<string, unknown>[])
                        : (paginatedRows as Record<string, unknown>[])
                    }
                    pageSize={pageSize}
                    canEdit={true}
                    editContext={editContext}
                    connection={tabConnection}
                    onFiltersChange={setTableFilters}
                    onSortingChange={setTableSorting}
                    onApplyToQuery={hasActiveFiltersOrSorting ? handleApplyToQuery : undefined}
                    onForeignKeyClick={handleFKClick}
                    onForeignKeyOpenTab={handleFKOpenTab}
                    onColumnStatsClick={tabConnection ? handleColumnStatsClick : undefined}
                    onChangesCommitted={handleRunQuery}
                    serverCurrentPage={isTablePreview ? tab.currentPage : undefined}
                    serverTotalRowCount={isTablePreview ? tab.totalRowCount : undefined}
                    onServerPaginationChange={
                      isTablePreview ? handleTablePreviewPaginationChange : undefined
                    }
                  />
                )
              }
              return null
            })() || (
              <DataTable
                key={`result-${activeResultIndex}`}
                tabId={tabId}
                columns={
                  hasMultipleResults
                    ? getActiveResultColumns().map((col) => ({
                        name: col.name,
                        dataType: col.dataType
                      }))
                    : getColumnsWithFKInfo()
                }
                data={getAllRows()}
                pageSize={pageSize}
                onFiltersChange={setTableFilters}
                onSortingChange={setTableSorting}
                onApplyToQuery={hasActiveFiltersOrSorting ? handleApplyToQuery : undefined}
                onForeignKeyClick={handleFKClick}
                onForeignKeyOpenTab={handleFKOpenTab}
                onColumnStatsClick={tabConnection ? handleColumnStatsClick : undefined}
              />
            )}
          </div>

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
                    <span>{tabMultiResult?.totalDurationMs}ms total</span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-green-500" />
                      {tabResult?.rowCount ?? 0} rows returned
                    </span>
                    <span>{tabResult?.durationMs}ms</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(telemetry || benchmark) && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={showTelemetryPanel ? 'secondary' : 'ghost'}
                        size="sm"
                        className="gap-1.5 h-7"
                        onClick={() => setShowTelemetryPanel(!showTelemetryPanel)}
                      >
                        <Timer className="size-3.5" />
                        Telemetry
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">
                        {showTelemetryPanel ? 'Hide' : 'Show'} query performance breakdown
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {tabResult && (!tabConnection?.dbType || tabConnection.dbType === 'postgresql') && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={showPerfPanel ? 'secondary' : 'ghost'}
                        size="sm"
                        className="gap-1.5 h-7"
                        onClick={
                          perfAnalysis
                            ? () => setShowPerfPanel(!showPerfPanel)
                            : handleAnalyzePerformance
                        }
                        disabled={isPerfAnalyzing}
                      >
                        {isPerfAnalyzing ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <ActivitySquare className="size-3.5" />
                        )}
                        {perfAnalysis &&
                          perfAnalysis.issueCount.critical + perfAnalysis.issueCount.warning >
                            0 && (
                            <Badge
                              variant="secondary"
                              className={`h-4 px-1.5 text-[10px] ${
                                perfAnalysis.issueCount.critical > 0
                                  ? 'bg-red-500/20 text-red-500'
                                  : 'bg-yellow-500/20 text-yellow-500'
                              }`}
                            >
                              {perfAnalysis.issueCount.critical + perfAnalysis.issueCount.warning}
                            </Badge>
                          )}
                        Analyze
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">
                        {perfAnalysis
                          ? showPerfPanel
                            ? 'Hide performance analysis'
                            : 'Show performance analysis'
                          : 'Analyze query for performance issues'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <MaskingToolbar tabId={tabId} />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-7"
                      onClick={() => setShareResultsOpen(true)}
                    >
                      <Share2 className="size-3.5" />
                      Share
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Share results as an image</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 h-7">
                    <Download className="size-3.5" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <ExportItem type="csv" Icon={FileSpreadsheet} label="Export as CSV" />
                  <ExportItem type="json" Icon={FileJson} label="Export as JSON" />
                  <ExportItem type="sql" Icon={FileCode2} label="Export as SQL" />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {showTelemetryPanel && (telemetry || benchmark) && (
            <TelemetryPanel
              telemetry={telemetry}
              benchmark={benchmark}
              showConnectionOverhead={showConnectionOverhead}
              onToggleConnectionOverhead={setShowConnectionOverhead}
              selectedPercentile={selectedPercentile}
              onSelectPercentile={setSelectedPercentile}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onClose={() => setShowTelemetryPanel(false)}
            />
          )}

          {showPerfPanel && perfAnalysis && (
            <PerfIndicatorPanel
              analysis={perfAnalysis}
              onClose={() => setShowPerfPanel(false)}
              onReanalyze={handleAnalyzePerformance}
              isAnalyzing={isPerfAnalyzing}
              showCritical={showCritical}
              showWarning={showWarning}
              showInfo={showInfo}
              onToggleSeverity={toggleSeverityFilter}
            />
          )}
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3 max-w-sm">
            <div className="size-10 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
              <Play className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                {tabQuery.trim() ? 'Ready to execute' : 'Write a query to get started'}
              </p>
              <p className="text-xs text-muted-foreground/60">
                {tabQuery.trim()
                  ? `Press ${keys.mod}+Enter to run your query`
                  : 'Browse the schema explorer to view tables, or type a SQL query above'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-4 pt-1">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                <kbd className="rounded bg-muted/80 px-1.5 py-0.5 font-mono">{keys.mod}Enter</kbd>
                <span>Run</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                <kbd className="rounded bg-muted/80 px-1.5 py-0.5 font-mono">
                  {keys.mod}
                  {keys.shift}F
                </kbd>
                <span>Format</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                <kbd className="rounded bg-muted/80 px-1.5 py-0.5 font-mono">{keys.mod}K</kbd>
                <span>Search</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
