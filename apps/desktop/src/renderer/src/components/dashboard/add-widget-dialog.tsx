import { useReducer, useEffect, useState } from 'react'
import {
  Database,
  FileText,
  Play,
  Loader2,
  CheckCircle2,
  BarChart3,
  Hash,
  Table2,
  Search
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SQLEditor } from '@/components/sql-editor'
import { useConnectionStore, useSavedQueryStore, useDashboardStore } from '@/stores'
import type {
  CreateWidgetInput,
  WidgetDataSource,
  ChartWidgetConfig,
  KPIWidgetConfig,
  TableWidgetConfig,
  WidgetType,
  KPIFormat
} from '@shared/index'
import { dialogReducer, initialDialogState, CHART_TYPES, KPI_FORMATS } from './add-widget-dialog-reducer'
import { AIWidgetSuggestion, type WidgetSuggestion } from './ai-widget-suggestion'
import { cn } from '@/lib/utils'

interface AddWidgetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dashboardId: string
}

const WIDGET_TYPE_OPTIONS: { type: WidgetType; label: string; icon: typeof BarChart3 }[] = [
  { type: 'chart', label: 'Chart', icon: BarChart3 },
  { type: 'kpi', label: 'KPI', icon: Hash },
  { type: 'table', label: 'Table', icon: Table2 }
]

export function AddWidgetDialog({ open, onOpenChange, dashboardId }: AddWidgetDialogProps) {
  const connections = useConnectionStore((s) => s.connections)
  const schemas = useConnectionStore((s) => s.schemas)
  const savedQueries = useSavedQueryStore((s) => s.savedQueries)
  const initializeSavedQueries = useSavedQueryStore((s) => s.initializeSavedQueries)
  const addWidget = useDashboardStore((s) => s.addWidget)

  const [state, dispatch] = useReducer(dialogReducer, initialDialogState)
  const [querySearch, setQuerySearch] = useState('')

  const {
    isSubmitting,
    error,
    widgetName,
    widgetType,
    sourceType,
    selectedQueryId,
    inlineSql,
    connectionId,
    chartType,
    xKey,
    yKeys,
    kpiFormat,
    kpiLabel,
    valueKey,
    prefix,
    suffix,
    maxRows,
    widgetWidth,
    previewData,
    isLoadingPreview
  } = state

  useEffect(() => {
    if (open) {
      initializeSavedQueries()
      const defaultConnectionId =
        connections.find((c) => c.isConnected)?.id || connections[0]?.id || ''
      dispatch({ type: 'RESET', payload: { defaultConnectionId } })
      setQuerySearch('')
    }
  }, [open, connections, initializeSavedQueries])

  useEffect(() => {
    if (sourceType === 'saved-query' && selectedQueryId) {
      const query = savedQueries.find((q) => q.id === selectedQueryId)
      if (query && !widgetName) {
        dispatch({ type: 'SET_WIDGET_NAME', payload: query.name })
        if (query.connectionId) {
          dispatch({ type: 'SET_CONNECTION_ID', payload: query.connectionId })
        }
      }
    }
  }, [selectedQueryId, savedQueries, sourceType, widgetName])

  const filteredQueries = savedQueries.filter(
    (q) =>
      q.name.toLowerCase().includes(querySearch.toLowerCase()) ||
      q.query.toLowerCase().includes(querySearch.toLowerCase())
  )

  const canSubmit = (): boolean => {
    if (!widgetName.trim()) return false
    if (!connectionId) return false
    if (sourceType === 'saved-query' && !selectedQueryId) return false
    if (sourceType === 'inline' && !inlineSql.trim()) return false
    if (widgetType === 'chart' && (!xKey || !yKeys)) return false
    if (widgetType === 'kpi' && (!valueKey || !kpiLabel)) return false
    return true
  }

  const handlePreviewQuery = async () => {
    let sql =
      sourceType === 'saved-query'
        ? savedQueries.find((q) => q.id === selectedQueryId)?.query
        : inlineSql

    const connection = connections.find((c) => c.id === connectionId)
    if (!sql || !connection) return

    sql = sql.trim().replace(/;+$/, '')
    sql = sql.replace(/\s+LIMIT\s+\d+\s*$/i, '')
    const previewSql = `${sql} LIMIT 100`

    dispatch({ type: 'SET_LOADING_PREVIEW', payload: true })
    try {
      const result = await window.api.db.query(connection, previewSql)
      if (result.success && result.data) {
        const data = result.data as { rows?: Record<string, unknown>[] }
        dispatch({ type: 'SET_PREVIEW_DATA', payload: data.rows || null })
      } else {
        dispatch({ type: 'SET_PREVIEW_DATA', payload: null })
      }
    } catch (err) {
      console.error('Preview query failed:', err)
      dispatch({ type: 'SET_PREVIEW_DATA', payload: null })
    } finally {
      dispatch({ type: 'SET_LOADING_PREVIEW', payload: false })
    }
  }

  const handleSuggestionSelect = (suggestion: WidgetSuggestion) => {
    dispatch({ type: 'APPLY_SUGGESTION', payload: suggestion })
  }

  const handleSubmit = async () => {
    if (!canSubmit()) return

    dispatch({ type: 'SET_SUBMITTING', payload: true })
    dispatch({ type: 'SET_ERROR', payload: null })

    try {
      const dataSource: WidgetDataSource = {
        type: sourceType,
        connectionId,
        ...(sourceType === 'saved-query' ? { savedQueryId: selectedQueryId } : { sql: inlineSql })
      }

      let config: ChartWidgetConfig | KPIWidgetConfig | TableWidgetConfig

      if (widgetType === 'chart') {
        config = {
          widgetType: 'chart',
          chartType,
          xKey,
          yKeys: yKeys.split(',').map((k) => k.trim()),
          showLegend: true,
          showGrid: true
        }
      } else if (widgetType === 'kpi') {
        config = {
          widgetType: 'kpi',
          format: kpiFormat,
          label: kpiLabel,
          valueKey,
          prefix: prefix || undefined,
          suffix: suffix || undefined
        }
      } else {
        config = {
          widgetType: 'table',
          maxRows
        }
      }

      const getWidgetWidth = (): number => {
        if (widgetWidth === 'full') return 12
        if (widgetWidth === 'half') return 6
        return widgetType === 'table' ? 6 : 4
      }

      const input: CreateWidgetInput = {
        name: widgetName.trim(),
        dataSource,
        config,
        layout: {
          x: 0,
          y: 0,
          w: getWidgetWidth(),
          h: widgetType === 'kpi' ? 2 : widgetWidth === 'full' ? 4 : 3,
          minW: 2,
          minH: 2
        }
      }

      await addWidget(dashboardId, input)
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add widget'
      console.error('Failed to add widget:', err)
      dispatch({ type: 'SET_ERROR', payload: message })
    } finally {
      dispatch({ type: 'SET_SUBMITTING', payload: false })
    }
  }

  const availableColumns = previewData && previewData.length > 0 ? Object.keys(previewData[0]) : []
  const selectedQuery = savedQueries.find((q) => q.id === selectedQueryId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Widget</DialogTitle>
          <DialogDescription>Configure your dashboard widget</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 pb-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Widget Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g., Monthly Revenue"
                  value={widgetName}
                  onChange={(e) => dispatch({ type: 'SET_WIDGET_NAME', payload: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Widget Type
                </Label>
                <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
                  {WIDGET_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.type}
                      onClick={() => dispatch({ type: 'SET_WIDGET_TYPE', payload: opt.type })}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                        widgetType === opt.type
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <opt.icon className="size-3.5" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Data Source
                </Label>
                <div className="flex gap-1 p-0.5 bg-muted/50 rounded-md">
                  <button
                    onClick={() => dispatch({ type: 'SET_SOURCE_TYPE', payload: 'inline' })}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all',
                      sourceType === 'inline'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Database className="size-3" />
                    SQL
                  </button>
                  <button
                    onClick={() => dispatch({ type: 'SET_SOURCE_TYPE', payload: 'saved-query' })}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all',
                      sourceType === 'saved-query'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <FileText className="size-3" />
                    Saved
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Connection</Label>
                  <Select
                    value={connectionId}
                    onValueChange={(v) => dispatch({ type: 'SET_CONNECTION_ID', payload: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {connections.map((conn) => (
                        <SelectItem key={conn.id} value={conn.id} className="text-xs">
                          {conn.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {sourceType === 'saved-query' && (
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Saved Query</Label>
                    <Select
                      value={selectedQueryId}
                      onValueChange={(v) =>
                        dispatch({ type: 'SET_SELECTED_QUERY_ID', payload: v })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select a query..." />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 pb-2">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                            <Input
                              placeholder="Search..."
                              value={querySearch}
                              onChange={(e) => setQuerySearch(e.target.value)}
                              className="h-7 pl-7 text-xs"
                            />
                          </div>
                        </div>
                        {filteredQueries.map((q) => (
                          <SelectItem key={q.id} value={q.id} className="text-xs">
                            {q.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {sourceType === 'inline' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] text-muted-foreground">SQL Query</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePreviewQuery}
                      disabled={isLoadingPreview || !inlineSql.trim() || !connectionId}
                      className="h-6 px-2 text-xs"
                    >
                      {isLoadingPreview ? (
                        <Loader2 className="size-3 mr-1 animate-spin" />
                      ) : (
                        <Play className="size-3 mr-1" />
                      )}
                      Preview
                    </Button>
                  </div>
                  <div className="rounded-lg border overflow-hidden bg-muted/20">
                    <SQLEditor
                      value={inlineSql}
                      onChange={(v) => dispatch({ type: 'SET_INLINE_SQL', payload: v })}
                      height={120}
                      placeholder="SELECT * FROM your_table"
                      schemas={schemas}
                    />
                  </div>
                </div>
              )}

              {sourceType === 'saved-query' && selectedQuery && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] text-muted-foreground">Query Preview</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePreviewQuery}
                      disabled={isLoadingPreview || !connectionId}
                      className="h-6 px-2 text-xs"
                    >
                      {isLoadingPreview ? (
                        <Loader2 className="size-3 mr-1 animate-spin" />
                      ) : (
                        <Play className="size-3 mr-1" />
                      )}
                      Run
                    </Button>
                  </div>
                  <div className="p-2 rounded-lg border bg-muted/20 font-mono text-xs text-muted-foreground max-h-20 overflow-auto">
                    {selectedQuery.query}
                  </div>
                </div>
              )}

              {previewData && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      {previewData.length} row{previewData.length !== 1 ? 's' : ''}, {availableColumns.length} column{availableColumns.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="rounded-lg border overflow-hidden">
                    <div className="overflow-x-auto max-h-[150px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            {availableColumns.map((col) => (
                              <th
                                key={col}
                                className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap border-b"
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.slice(0, 5).map((row, i) => (
                            <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                              {availableColumns.map((col) => (
                                <td
                                  key={col}
                                  className="px-2 py-1.5 whitespace-nowrap font-mono text-[11px] max-w-[200px] truncate"
                                  title={String(row[col] ?? '')}
                                >
                                  {row[col] === null ? (
                                    <span className="text-muted-foreground/50 italic">null</span>
                                  ) : (
                                    String(row[col])
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {previewData.length > 5 && (
                      <div className="px-2 py-1 text-[10px] text-muted-foreground bg-muted/30 border-t">
                        Showing 5 of {previewData.length} rows
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <AIWidgetSuggestion queryResult={previewData} onSuggestionSelect={handleSuggestionSelect} />

            {widgetType === 'chart' && (
              <div className="space-y-3">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Chart Configuration
                </Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {CHART_TYPES.map((ct) => (
                    <button
                      key={ct.type}
                      onClick={() => dispatch({ type: 'SET_CHART_TYPE', payload: ct.type })}
                      className={cn(
                        'flex flex-col items-center gap-1 py-2 px-2 rounded-lg transition-all',
                        chartType === ct.type
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <ct.icon className="size-4" />
                      <span className="text-[10px] font-medium">{ct.label.replace(' Chart', '')}</span>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      X Axis <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="e.g., date"
                      value={xKey}
                      onChange={(e) => dispatch({ type: 'SET_X_KEY', payload: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      Y Axis <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="e.g., revenue, profit"
                      value={yKeys}
                      onChange={(e) => dispatch({ type: 'SET_Y_KEYS', payload: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {widgetType === 'kpi' && (
              <div className="space-y-3">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  KPI Configuration
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      Label <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="e.g., Total Revenue"
                      value={kpiLabel}
                      onChange={(e) => dispatch({ type: 'SET_KPI_LABEL', payload: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      Value Column <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="e.g., total"
                      value={valueKey}
                      onChange={(e) => dispatch({ type: 'SET_VALUE_KEY', payload: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Format</Label>
                    <Select
                      value={kpiFormat}
                      onValueChange={(v) =>
                        dispatch({ type: 'SET_KPI_FORMAT', payload: v as KPIFormat })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KPI_FORMATS.map((f) => (
                          <SelectItem key={f.format} value={f.format} className="text-xs">
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Prefix</Label>
                    <Input
                      placeholder="$"
                      value={prefix}
                      onChange={(e) => dispatch({ type: 'SET_PREFIX', payload: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Suffix</Label>
                    <Input
                      placeholder="%"
                      value={suffix}
                      onChange={(e) => dispatch({ type: 'SET_SUFFIX', payload: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {widgetType === 'table' && (
              <div className="space-y-3">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Table Configuration
                </Label>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Max Rows</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={maxRows}
                    onChange={(e) =>
                      dispatch({ type: 'SET_MAX_ROWS', payload: parseInt(e.target.value) || 10 })
                    }
                    className="h-8 text-xs w-24"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Widget Width
              </Label>
              <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
                {(['auto', 'half', 'full'] as const).map((w) => (
                  <button
                    key={w}
                    onClick={() => dispatch({ type: 'SET_WIDGET_WIDTH', payload: w })}
                    className={cn(
                      'px-3 py-1 rounded-md text-xs font-medium transition-all',
                      widgetWidth === w
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {w === 'auto' ? 'Auto' : w === 'half' ? 'Half' : 'Full'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit() || isSubmitting}>
            {isSubmitting ? 'Adding...' : 'Add Widget'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
