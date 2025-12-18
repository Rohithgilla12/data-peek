'use client'

import { useState, useEffect } from 'react'
import {
  BarChart3,
  LineChart,
  AreaChart,
  PieChart,
  Hash,
  Table2,
  Database,
  FileText,
  ChevronLeft,
  ChevronRight,
  Search
} from 'lucide-react'

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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useConnectionStore, useSavedQueryStore, useDashboardStore } from '@/stores'
import type {
  WidgetType,
  ChartWidgetType,
  KPIFormat,
  CreateWidgetInput,
  WidgetDataSource,
  ChartWidgetConfig,
  KPIWidgetConfig,
  TableWidgetConfig
} from '@shared/index'
import { cn } from '@/lib/utils'

interface AddWidgetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dashboardId: string
}

type Step = 'type' | 'source' | 'config'

const WIDGET_TYPES: { type: WidgetType; label: string; description: string; icon: typeof Hash }[] =
  [
    {
      type: 'chart',
      label: 'Chart',
      description: 'Visualize trends and comparisons',
      icon: BarChart3
    },
    {
      type: 'kpi',
      label: 'KPI Metric',
      description: 'Display key numbers and trends',
      icon: Hash
    },
    {
      type: 'table',
      label: 'Table',
      description: 'Show tabular data preview',
      icon: Table2
    }
  ]

const CHART_TYPES: { type: ChartWidgetType; label: string; icon: typeof BarChart3 }[] = [
  { type: 'bar', label: 'Bar Chart', icon: BarChart3 },
  { type: 'line', label: 'Line Chart', icon: LineChart },
  { type: 'area', label: 'Area Chart', icon: AreaChart },
  { type: 'pie', label: 'Pie Chart', icon: PieChart }
]

const KPI_FORMATS: { format: KPIFormat; label: string }[] = [
  { format: 'number', label: 'Number' },
  { format: 'currency', label: 'Currency' },
  { format: 'percent', label: 'Percentage' },
  { format: 'duration', label: 'Duration' }
]

/**
 * Render a three-step modal dialog to create and configure a dashboard widget.
 *
 * The dialog guides the user through choosing a widget type (chart, KPI, table), selecting a data
 * source (saved query or inline SQL with connection), and configuring widget-specific settings
 * (chart axes, KPI format/label, table row limit) and layout width. On submit it constructs a
 * CreateWidgetInput and calls the dashboard store to add the widget to the provided dashboardId,
 * then closes the dialog.
 *
 * @param open - Whether the dialog is visible
 * @param onOpenChange - Callback invoked when the dialog should open or close; called with `false` after a successful add
 * @param dashboardId - ID of the dashboard to which the new widget will be added
 * @returns The Add Widget dialog React element
 */
export function AddWidgetDialog({ open, onOpenChange, dashboardId }: AddWidgetDialogProps) {
  const connections = useConnectionStore((s) => s.connections)
  const savedQueries = useSavedQueryStore((s) => s.savedQueries)
  const initializeSavedQueries = useSavedQueryStore((s) => s.initializeSavedQueries)
  const addWidget = useDashboardStore((s) => s.addWidget)

  const [step, setStep] = useState<Step>('type')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Widget basic info
  const [widgetName, setWidgetName] = useState('')
  const [widgetType, setWidgetType] = useState<WidgetType>('chart')

  // Data source
  const [sourceType, setSourceType] = useState<'saved-query' | 'inline'>('saved-query')
  const [selectedQueryId, setSelectedQueryId] = useState<string>('')
  const [inlineSql, setInlineSql] = useState('')
  const [connectionId, setConnectionId] = useState<string>('')
  const [querySearch, setQuerySearch] = useState('')

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

  // Layout config
  const [widgetWidth, setWidgetWidth] = useState<'auto' | 'half' | 'full'>('auto')

  useEffect(() => {
    if (open) {
      initializeSavedQueries()
      // Reset form
      setStep('type')
      setWidgetName('')
      setWidgetType('chart')
      setSourceType('saved-query')
      setSelectedQueryId('')
      setInlineSql('')
      setConnectionId(connections.find((c) => c.isConnected)?.id || connections[0]?.id || '')
      setQuerySearch('')
      setChartType('bar')
      setXKey('')
      setYKeys('')
      setKpiFormat('number')
      setKpiLabel('')
      setValueKey('')
      setPrefix('')
      setSuffix('')
      setMaxRows(10)
      setWidgetWidth('auto')
    }
  }, [open, connections, initializeSavedQueries])

  // Auto-fill widget name from saved query
  useEffect(() => {
    if (sourceType === 'saved-query' && selectedQueryId) {
      const query = savedQueries.find((q) => q.id === selectedQueryId)
      if (query && !widgetName) {
        setWidgetName(query.name)
        if (query.connectionId) {
          setConnectionId(query.connectionId)
        }
      }
    }
  }, [selectedQueryId, savedQueries, sourceType, widgetName])

  const filteredQueries = savedQueries.filter(
    (q) =>
      q.name.toLowerCase().includes(querySearch.toLowerCase()) ||
      q.query.toLowerCase().includes(querySearch.toLowerCase())
  )

  const canProceed = (): boolean => {
    switch (step) {
      case 'type':
        return true
      case 'source':
        if (sourceType === 'saved-query') {
          return !!selectedQueryId && !!connectionId
        }
        return !!inlineSql.trim() && !!connectionId
      case 'config':
        if (!widgetName.trim()) return false
        if (widgetType === 'chart') {
          return !!xKey && !!yKeys
        }
        if (widgetType === 'kpi') {
          return !!valueKey && !!kpiLabel
        }
        return true
      default:
        return false
    }
  }

  const handleNext = () => {
    if (step === 'type') setStep('source')
    else if (step === 'source') setStep('config')
  }

  const handleBack = () => {
    if (step === 'source') setStep('type')
    else if (step === 'config') setStep('source')
  }

  const handleSubmit = async () => {
    if (!canProceed()) return

    setIsSubmitting(true)

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
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add Widget</DialogTitle>
          <DialogDescription>
            {step === 'type' && 'Choose what type of widget you want to add'}
            {step === 'source' && 'Select the data source for your widget'}
            {step === 'config' && 'Configure your widget settings'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {step === 'type' && (
            <div className="grid gap-3">
              {WIDGET_TYPES.map((wt) => (
                <button
                  key={wt.type}
                  onClick={() => setWidgetType(wt.type)}
                  className={cn(
                    'flex items-center gap-4 p-4 rounded-lg border text-left transition-colors',
                    widgetType === wt.type
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  <div
                    className={cn(
                      'flex size-10 items-center justify-center rounded-lg',
                      widgetType === wt.type ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    )}
                  >
                    <wt.icon className="size-5" />
                  </div>
                  <div>
                    <div className="font-medium">{wt.label}</div>
                    <div className="text-sm text-muted-foreground">{wt.description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 'source' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={sourceType === 'saved-query' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSourceType('saved-query')}
                  className="flex-1"
                >
                  <FileText className="size-4 mr-2" />
                  Saved Query
                </Button>
                <Button
                  variant={sourceType === 'inline' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSourceType('inline')}
                  className="flex-1"
                >
                  <Database className="size-4 mr-2" />
                  Write SQL
                </Button>
              </div>

              {sourceType === 'saved-query' ? (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      placeholder="Search saved queries..."
                      value={querySearch}
                      onChange={(e) => setQuerySearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <ScrollArea className="h-[200px] border rounded-md">
                    <div className="p-2 space-y-1">
                      {filteredQueries.length === 0 ? (
                        <div className="text-center py-8 text-sm text-muted-foreground">
                          No saved queries found
                        </div>
                      ) : (
                        filteredQueries.map((query) => (
                          <button
                            key={query.id}
                            onClick={() => setSelectedQueryId(query.id)}
                            className={cn(
                              'w-full text-left p-2 rounded-md transition-colors',
                              selectedQueryId === query.id
                                ? 'bg-primary/10 border border-primary/30'
                                : 'hover:bg-muted'
                            )}
                          >
                            <div className="font-medium text-sm">{query.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {query.query}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-2">
                    <Label>Connection</Label>
                    <Select value={connectionId} onValueChange={setConnectionId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select connection" />
                      </SelectTrigger>
                      <SelectContent>
                        {connections.map((conn) => (
                          <SelectItem key={conn.id} value={conn.id}>
                            {conn.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>SQL Query</Label>
                    <Textarea
                      placeholder="SELECT * FROM ..."
                      value={inlineSql}
                      onChange={(e) => setInlineSql(e.target.value)}
                      rows={6}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
              )}

              {sourceType === 'saved-query' && selectedQueryId && (
                <div className="grid gap-2">
                  <Label>Connection</Label>
                  <Select value={connectionId} onValueChange={setConnectionId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select connection" />
                    </SelectTrigger>
                    <SelectContent>
                      {connections.map((conn) => (
                        <SelectItem key={conn.id} value={conn.id}>
                          {conn.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {step === 'config' && (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="widgetName">Widget Name</Label>
                <Input
                  id="widgetName"
                  placeholder="My Widget"
                  value={widgetName}
                  onChange={(e) => setWidgetName(e.target.value)}
                />
              </div>

              {widgetType === 'chart' && (
                <>
                  <div className="grid gap-2">
                    <Label>Chart Type</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {CHART_TYPES.map((ct) => (
                        <button
                          key={ct.type}
                          onClick={() => setChartType(ct.type)}
                          className={cn(
                            'flex flex-col items-center gap-1 p-3 rounded-md border transition-colors',
                            chartType === ct.type
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50'
                          )}
                        >
                          <ct.icon className="size-5" />
                          <span className="text-xs">{ct.label.replace(' Chart', '')}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="xKey">X Axis Column</Label>
                    <Input
                      id="xKey"
                      placeholder="e.g., date, category"
                      value={xKey}
                      onChange={(e) => setXKey(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="yKeys">Y Axis Columns (comma-separated)</Label>
                    <Input
                      id="yKeys"
                      placeholder="e.g., sales, revenue"
                      value={yKeys}
                      onChange={(e) => setYKeys(e.target.value)}
                    />
                  </div>
                </>
              )}

              {widgetType === 'kpi' && (
                <>
                  <div className="grid gap-2">
                    <Label>Format</Label>
                    <Select value={kpiFormat} onValueChange={(v) => setKpiFormat(v as KPIFormat)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KPI_FORMATS.map((f) => (
                          <SelectItem key={f.format} value={f.format}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="kpiLabel">Label</Label>
                    <Input
                      id="kpiLabel"
                      placeholder="e.g., Total Revenue"
                      value={kpiLabel}
                      onChange={(e) => setKpiLabel(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="valueKey">Value Column</Label>
                    <Input
                      id="valueKey"
                      placeholder="e.g., total, count"
                      value={valueKey}
                      onChange={(e) => setValueKey(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="prefix">Prefix (optional)</Label>
                      <Input
                        id="prefix"
                        placeholder="e.g., $"
                        value={prefix}
                        onChange={(e) => setPrefix(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="suffix">Suffix (optional)</Label>
                      <Input
                        id="suffix"
                        placeholder="e.g., %"
                        value={suffix}
                        onChange={(e) => setSuffix(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              {widgetType === 'table' && (
                <div className="grid gap-2">
                  <Label htmlFor="maxRows">Maximum Rows</Label>
                  <Input
                    id="maxRows"
                    type="number"
                    min={1}
                    max={100}
                    value={maxRows}
                    onChange={(e) => setMaxRows(parseInt(e.target.value) || 10)}
                  />
                </div>
              )}

              <div className="grid gap-2">
                <Label>Widget Width</Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setWidgetWidth('auto')}
                    className={cn(
                      'p-2 rounded-md border text-center text-sm transition-colors',
                      widgetWidth === 'auto'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    Auto
                  </button>
                  <button
                    onClick={() => setWidgetWidth('half')}
                    className={cn(
                      'p-2 rounded-md border text-center text-sm transition-colors',
                      widgetWidth === 'half'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    Half Width
                  </button>
                  <button
                    onClick={() => setWidgetWidth('full')}
                    className={cn(
                      'p-2 rounded-md border text-center text-sm transition-colors',
                      widgetWidth === 'full'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    Full Width
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {step !== 'type' && (
              <Button variant="ghost" onClick={handleBack}>
                <ChevronLeft className="size-4 mr-1" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {step === 'config' ? (
              <Button onClick={handleSubmit} disabled={!canProceed() || isSubmitting}>
                {isSubmitting ? 'Adding...' : 'Add Widget'}
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Next
                <ChevronRight className="size-4 ml-1" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}