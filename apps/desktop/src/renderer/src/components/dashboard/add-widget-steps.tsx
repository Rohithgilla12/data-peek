import { Database, FileText, Search, Play, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
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
import type {
  WidgetType,
  ChartWidgetType,
  KPIFormat,
  ConnectionConfig,
  SavedQuery
} from '@shared/index'
import { cn } from '@/lib/utils'
import { AIWidgetSuggestion, type WidgetSuggestion } from './ai-widget-suggestion'
import {
  WIDGET_TYPES,
  CHART_TYPES,
  KPI_FORMATS,
  type DialogState,
  type DialogAction
} from './add-widget-dialog-reducer'

interface TypeStepProps {
  widgetType: WidgetType
  dispatch: React.Dispatch<DialogAction>
}

export function TypeStep({ widgetType, dispatch }: TypeStepProps) {
  return (
    <div className="grid gap-3">
      {WIDGET_TYPES.map((wt) => (
        <button
          key={wt.type}
          onClick={() => dispatch({ type: 'SET_WIDGET_TYPE', payload: wt.type })}
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
  )
}

interface SourceStepProps {
  sourceType: 'saved-query' | 'inline'
  querySearch: string
  selectedQueryId: string
  connectionId: string
  inlineSql: string
  connections: ConnectionConfig[]
  filteredQueries: SavedQuery[]
  dispatch: React.Dispatch<DialogAction>
}

export function SourceStep({
  sourceType,
  querySearch,
  selectedQueryId,
  connectionId,
  inlineSql,
  connections,
  filteredQueries,
  dispatch
}: SourceStepProps) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          variant={sourceType === 'saved-query' ? 'default' : 'outline'}
          size="sm"
          onClick={() => dispatch({ type: 'SET_SOURCE_TYPE', payload: 'saved-query' })}
          className="flex-1"
        >
          <FileText className="size-4 mr-2" />
          Saved Query
        </Button>
        <Button
          variant={sourceType === 'inline' ? 'default' : 'outline'}
          size="sm"
          onClick={() => dispatch({ type: 'SET_SOURCE_TYPE', payload: 'inline' })}
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
              onChange={(e) => dispatch({ type: 'SET_QUERY_SEARCH', payload: e.target.value })}
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
                    onClick={() => dispatch({ type: 'SET_SELECTED_QUERY_ID', payload: query.id })}
                    className={cn(
                      'w-full text-left p-2 rounded-md transition-colors',
                      selectedQueryId === query.id
                        ? 'bg-primary/10 border border-primary/30'
                        : 'hover:bg-muted'
                    )}
                  >
                    <div className="font-medium text-sm">{query.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{query.query}</div>
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
            <Select
              value={connectionId}
              onValueChange={(v) => dispatch({ type: 'SET_CONNECTION_ID', payload: v })}
            >
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
              onChange={(e) => dispatch({ type: 'SET_INLINE_SQL', payload: e.target.value })}
              rows={6}
              className="font-mono text-sm"
            />
          </div>
        </div>
      )}

      {sourceType === 'saved-query' && selectedQueryId && (
        <div className="grid gap-2">
          <Label>Connection</Label>
          <Select
            value={connectionId}
            onValueChange={(v) => dispatch({ type: 'SET_CONNECTION_ID', payload: v })}
          >
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
  )
}

interface ConfigStepProps {
  state: DialogState
  connections: ConnectionConfig[]
  previewData: Record<string, unknown>[] | null
  isLoadingPreview: boolean
  onPreviewQuery: () => void
  onSuggestionSelect: (suggestion: WidgetSuggestion) => void
  dispatch: React.Dispatch<DialogAction>
}

export function ConfigStep({
  state,
  previewData,
  isLoadingPreview,
  onPreviewQuery,
  onSuggestionSelect,
  dispatch
}: ConfigStepProps) {
  const {
    widgetName,
    widgetType,
    chartType,
    xKey,
    yKeys,
    kpiFormat,
    kpiLabel,
    valueKey,
    prefix,
    suffix,
    maxRows,
    widgetWidth
  } = state

  return (
    <div className="space-y-4">
      {!previewData && (
        <div className="flex items-center justify-between p-3 rounded-lg border border-dashed">
          <span className="text-sm text-muted-foreground">
            Preview data to get AI widget suggestions
          </span>
          <Button variant="outline" size="sm" onClick={onPreviewQuery} disabled={isLoadingPreview}>
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
        </div>
      )}

      <AIWidgetSuggestion queryResult={previewData} onSuggestionSelect={onSuggestionSelect} />

      <div className="grid gap-2">
        <Label htmlFor="widgetName">Widget Name</Label>
        <Input
          id="widgetName"
          placeholder="My Widget"
          value={widgetName}
          onChange={(e) => dispatch({ type: 'SET_WIDGET_NAME', payload: e.target.value })}
        />
      </div>

      {widgetType === 'chart' && (
        <ChartConfig chartType={chartType} xKey={xKey} yKeys={yKeys} dispatch={dispatch} />
      )}

      {widgetType === 'kpi' && (
        <KPIConfig
          kpiFormat={kpiFormat}
          kpiLabel={kpiLabel}
          valueKey={valueKey}
          prefix={prefix}
          suffix={suffix}
          dispatch={dispatch}
        />
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
            onChange={(e) =>
              dispatch({ type: 'SET_MAX_ROWS', payload: parseInt(e.target.value) || 10 })
            }
          />
        </div>
      )}

      <WidgetWidthSelector widgetWidth={widgetWidth} dispatch={dispatch} />
    </div>
  )
}

interface ChartConfigProps {
  chartType: ChartWidgetType
  xKey: string
  yKeys: string
  dispatch: React.Dispatch<DialogAction>
}

function ChartConfig({ chartType, xKey, yKeys, dispatch }: ChartConfigProps) {
  return (
    <>
      <div className="grid gap-2">
        <Label>Chart Type</Label>
        <div className="grid grid-cols-4 gap-2">
          {CHART_TYPES.map((ct) => (
            <button
              key={ct.type}
              onClick={() => dispatch({ type: 'SET_CHART_TYPE', payload: ct.type })}
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
          onChange={(e) => dispatch({ type: 'SET_X_KEY', payload: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="yKeys">Y Axis Columns (comma-separated)</Label>
        <Input
          id="yKeys"
          placeholder="e.g., sales, revenue"
          value={yKeys}
          onChange={(e) => dispatch({ type: 'SET_Y_KEYS', payload: e.target.value })}
        />
      </div>
    </>
  )
}

interface KPIConfigProps {
  kpiFormat: KPIFormat
  kpiLabel: string
  valueKey: string
  prefix: string
  suffix: string
  dispatch: React.Dispatch<DialogAction>
}

function KPIConfig({ kpiFormat, kpiLabel, valueKey, prefix, suffix, dispatch }: KPIConfigProps) {
  return (
    <>
      <div className="grid gap-2">
        <Label>Format</Label>
        <Select
          value={kpiFormat}
          onValueChange={(v) => dispatch({ type: 'SET_KPI_FORMAT', payload: v as KPIFormat })}
        >
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
          onChange={(e) => dispatch({ type: 'SET_KPI_LABEL', payload: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="valueKey">Value Column</Label>
        <Input
          id="valueKey"
          placeholder="e.g., total, count"
          value={valueKey}
          onChange={(e) => dispatch({ type: 'SET_VALUE_KEY', payload: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="prefix">Prefix (optional)</Label>
          <Input
            id="prefix"
            placeholder="e.g., $"
            value={prefix}
            onChange={(e) => dispatch({ type: 'SET_PREFIX', payload: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="suffix">Suffix (optional)</Label>
          <Input
            id="suffix"
            placeholder="e.g., %"
            value={suffix}
            onChange={(e) => dispatch({ type: 'SET_SUFFIX', payload: e.target.value })}
          />
        </div>
      </div>
    </>
  )
}

interface WidgetWidthSelectorProps {
  widgetWidth: 'auto' | 'half' | 'full'
  dispatch: React.Dispatch<DialogAction>
}

function WidgetWidthSelector({ widgetWidth, dispatch }: WidgetWidthSelectorProps) {
  return (
    <div className="grid gap-2">
      <Label>Widget Width</Label>
      <div className="grid grid-cols-3 gap-2">
        {(['auto', 'half', 'full'] as const).map((width) => (
          <button
            key={width}
            onClick={() => dispatch({ type: 'SET_WIDGET_WIDTH', payload: width })}
            className={cn(
              'p-2 rounded-md border text-center text-sm transition-colors',
              widgetWidth === width
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            )}
          >
            {width === 'auto' ? 'Auto' : width === 'half' ? 'Half Width' : 'Full Width'}
          </button>
        ))}
      </div>
    </div>
  )
}
