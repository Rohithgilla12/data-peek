import { useState, useEffect } from 'react'
import { Check, Play, Loader2, FileText, Database } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { SQLEditor } from '@/components/sql-editor'
import { useConnectionStore, useSavedQueryStore, useDashboardStore } from '@/stores'
import type {
  Widget,
  WidgetDataSource,
  ChartWidgetConfig,
  KPIWidgetConfig,
  TableWidgetConfig,
  WidgetType,
  ChartWidgetType,
  KPIFormat
} from '@shared/index'
import { WIDGET_TYPES, CHART_TYPES, KPI_FORMATS } from './add-widget-dialog-reducer'

interface EditWidgetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dashboardId: string
  widget: Widget
}

export function EditWidgetDialog({
  open,
  onOpenChange,
  dashboardId,
  widget
}: EditWidgetDialogProps) {
  const connections = useConnectionStore((s) => s.connections)
  const schemas = useConnectionStore((s) => s.schemas)
  const savedQueries = useSavedQueryStore((s) => s.savedQueries)
  const initializeSavedQueries = useSavedQueryStore((s) => s.initializeSavedQueries)
  const updateWidget = useDashboardStore((s) => s.updateWidget)
  const refreshWidget = useDashboardStore((s) => s.refreshWidget)

  // Form state
  const [widgetName, setWidgetName] = useState('')
  const [widgetType, setWidgetType] = useState<WidgetType>('chart')
  const [sourceType, setSourceType] = useState<'saved-query' | 'inline'>('inline')
  const [selectedQueryId, setSelectedQueryId] = useState('')
  const [inlineSql, setInlineSql] = useState('')
  const [connectionId, setConnectionId] = useState('')

  // Chart config
  const [chartType, setChartType] = useState<ChartWidgetType>('bar')
  const [xKey, setXKey] = useState('')
  const [yKeys, setYKeys] = useState('')

  // KPI config
  const [kpiFormat, setKpiFormat] = useState<KPIFormat>('number')
  const [kpiLabel, setKpiLabel] = useState('')
  const [valueKey, setValueKey] = useState('')
  const [prefix, setPrefix] = useState('')
  const [suffix, setSuffix] = useState('')

  // Table config
  const [maxRows, setMaxRows] = useState(10)

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<Record<string, unknown>[] | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

  // Initialize form with widget data
  useEffect(() => {
    if (open) {
      initializeSavedQueries()

      // Basic info
      setWidgetName(widget.name)
      setWidgetType(widget.config.widgetType)

      // Data source
      setSourceType(widget.dataSource.type)
      setConnectionId(widget.dataSource.connectionId)
      if (widget.dataSource.type === 'saved-query') {
        setSelectedQueryId(widget.dataSource.savedQueryId || '')
      } else {
        setInlineSql(widget.dataSource.sql || '')
      }

      // Widget-specific config
      if (widget.config.widgetType === 'chart') {
        const chartConfig = widget.config as ChartWidgetConfig
        setChartType(chartConfig.chartType)
        setXKey(chartConfig.xKey)
        setYKeys(chartConfig.yKeys.join(', '))
      } else if (widget.config.widgetType === 'kpi') {
        const kpiConfig = widget.config as KPIWidgetConfig
        setKpiFormat(kpiConfig.format)
        setKpiLabel(kpiConfig.label)
        setValueKey(kpiConfig.valueKey)
        setPrefix(kpiConfig.prefix || '')
        setSuffix(kpiConfig.suffix || '')
      } else if (widget.config.widgetType === 'table') {
        const tableConfig = widget.config as TableWidgetConfig
        setMaxRows(tableConfig.maxRows)
      }

      setError(null)
      setPreviewData(null)
    }
  }, [open, widget, initializeSavedQueries])

  const handlePreviewQuery = async () => {
    let sql =
      sourceType === 'saved-query'
        ? savedQueries.find((q) => q.id === selectedQueryId)?.query
        : inlineSql

    const connection = connections.find((c) => c.id === connectionId)
    if (!sql || !connection) return

    sql = sql.trim().replace(/;+$/, '')
    sql = sql.replace(/\s+LIMIT\s+\d+\s*$/i, '')
    const previewSql = `${sql} LIMIT 10`

    setIsLoadingPreview(true)
    try {
      const result = await window.api.db.query(connection, previewSql)
      if (result.success && result.data) {
        const data = result.data as { rows?: Record<string, unknown>[] }
        setPreviewData(data.rows || null)
      } else {
        setPreviewData(null)
      }
    } catch (err) {
      console.error('Preview query failed:', err)
      setPreviewData(null)
    } finally {
      setIsLoadingPreview(false)
    }
  }

  const canSubmit = (): boolean => {
    if (!widgetName.trim()) return false
    if (!connectionId) return false

    if (sourceType === 'saved-query' && !selectedQueryId) return false
    if (sourceType === 'inline' && !inlineSql.trim()) return false

    if (widgetType === 'chart') {
      return !!xKey && !!yKeys
    }
    if (widgetType === 'kpi') {
      return !!valueKey && !!kpiLabel
    }
    return true
  }

  const handleSubmit = async () => {
    if (!canSubmit()) return

    setIsSubmitting(true)
    setError(null)

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

      await updateWidget(dashboardId, widget.id, {
        name: widgetName.trim(),
        dataSource,
        config
      })

      // Refresh the widget to show new data
      refreshWidget({ ...widget, dataSource, config })

      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update widget'
      console.error('Failed to update widget:', err)
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const columns = previewData && previewData.length > 0 ? Object.keys(previewData[0]) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure Widget</DialogTitle>
          <DialogDescription>
            Update widget settings. Changes will be applied immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Widget Name */}
          <div className="space-y-2">
            <Label htmlFor="widget-name">Widget Name</Label>
            <Input
              id="widget-name"
              value={widgetName}
              onChange={(e) => setWidgetName(e.target.value)}
              placeholder="Enter widget name"
            />
          </div>

          {/* Widget Type */}
          <div className="space-y-2">
            <Label>Widget Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {WIDGET_TYPES.map(({ type, label, icon: Icon }) => (
                <Button
                  key={type}
                  variant={widgetType === type ? 'default' : 'outline'}
                  className="flex items-center gap-2 h-auto py-3"
                  onClick={() => setWidgetType(type)}
                >
                  <Icon className="size-4" />
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Data Source */}
          <div className="space-y-3">
            <Label>Data Source</Label>
            <div className="flex gap-2">
              <Button
                variant={sourceType === 'saved-query' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setSourceType('saved-query')}
              >
                <FileText className="size-4 mr-2" />
                Saved Query
              </Button>
              <Button
                variant={sourceType === 'inline' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setSourceType('inline')}
              >
                <Database className="size-4 mr-2" />
                Write SQL
              </Button>
            </div>
            {sourceType === 'saved-query' ? (
              <Select value={selectedQueryId} onValueChange={setSelectedQueryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a saved query" />
                </SelectTrigger>
                <SelectContent>
                  {savedQueries.map((query) => (
                    <SelectItem key={query.id} value={query.id}>
                      {query.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <SQLEditor
                  value={inlineSql}
                  onChange={setInlineSql}
                  height={120}
                  placeholder="SELECT * FROM your_table LIMIT 100"
                  schemas={schemas}
                />
              </div>
            )}
          </div>

          {/* Connection */}
          <div className="space-y-2">
            <Label>Connection</Label>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a connection" />
              </SelectTrigger>
              <SelectContent>
                {connections.map((conn) => (
                  <SelectItem key={conn.id} value={conn.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className={`size-2 rounded-full ${conn.isConnected ? 'bg-green-500' : 'bg-gray-400'}`}
                      />
                      {conn.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preview Button */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviewQuery}
              disabled={isLoadingPreview || (!inlineSql && !selectedQueryId)}
            >
              {isLoadingPreview ? (
                <>
                  <Loader2 className="size-3 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Play className="size-3 mr-2" />
                  Preview Data
                </>
              )}
            </Button>
            {previewData && (
              <span className="text-xs text-muted-foreground">
                {previewData.length} rows, {columns.length} columns
              </span>
            )}
          </div>

          {/* Preview Data Table */}
          {previewData && previewData.length > 0 && (
            <div className="border rounded-md overflow-auto max-h-40">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    {columns.map((col) => (
                      <th key={col} className="px-2 py-1 text-left font-medium">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-t">
                      {columns.map((col) => (
                        <td key={col} className="px-2 py-1 truncate max-w-[150px]">
                          {String(row[col] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Widget-Specific Configuration */}
          {widgetType === 'chart' && (
            <div className="space-y-4 border-t pt-4">
              <h4 className="font-medium">Chart Configuration</h4>
              <div className="space-y-2">
                <Label>Chart Type</Label>
                <div className="grid grid-cols-4 gap-2">
                  {CHART_TYPES.map(({ type, label, icon: Icon }) => (
                    <Button
                      key={type}
                      variant={chartType === type ? 'default' : 'outline'}
                      size="sm"
                      className="flex items-center gap-1.5"
                      onClick={() => setChartType(type)}
                    >
                      <Icon className="size-3" />
                      {label.split(' ')[0]}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="x-key">X-Axis Column</Label>
                  {columns.length > 0 ? (
                    <Select value={xKey} onValueChange={setXKey}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {columns.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="x-key"
                      value={xKey}
                      onChange={(e) => setXKey(e.target.value)}
                      placeholder="e.g., date, category"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="y-keys">Y-Axis Columns (comma-separated)</Label>
                  {columns.length > 0 ? (
                    <Select value={yKeys.split(',')[0]?.trim() || ''} onValueChange={setYKeys}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {columns.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="y-keys"
                      value={yKeys}
                      onChange={(e) => setYKeys(e.target.value)}
                      placeholder="e.g., value, count"
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {widgetType === 'kpi' && (
            <div className="space-y-4 border-t pt-4">
              <h4 className="font-medium">KPI Configuration</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Value Column</Label>
                  {columns.length > 0 ? (
                    <Select value={valueKey} onValueChange={setValueKey}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {columns.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={valueKey}
                      onChange={(e) => setValueKey(e.target.value)}
                      placeholder="e.g., total_count"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kpi-label">Label</Label>
                  <Input
                    id="kpi-label"
                    value={kpiLabel}
                    onChange={(e) => setKpiLabel(e.target.value)}
                    placeholder="e.g., Total Users"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Select value={kpiFormat} onValueChange={(v) => setKpiFormat(v as KPIFormat)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KPI_FORMATS.map(({ format, label }) => (
                        <SelectItem key={format} value={format}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prefix">Prefix</Label>
                  <Input
                    id="prefix"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder="e.g., $"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="suffix">Suffix</Label>
                  <Input
                    id="suffix"
                    value={suffix}
                    onChange={(e) => setSuffix(e.target.value)}
                    placeholder="e.g., %"
                  />
                </div>
              </div>
            </div>
          )}

          {widgetType === 'table' && (
            <div className="space-y-4 border-t pt-4">
              <h4 className="font-medium">Table Configuration</h4>
              <div className="space-y-2">
                <Label htmlFor="max-rows">Max Rows</Label>
                <Input
                  id="max-rows"
                  type="number"
                  min={1}
                  max={100}
                  value={maxRows}
                  onChange={(e) => setMaxRows(parseInt(e.target.value, 10) || 10)}
                />
              </div>
            </div>
          )}
        </div>

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
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="size-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
