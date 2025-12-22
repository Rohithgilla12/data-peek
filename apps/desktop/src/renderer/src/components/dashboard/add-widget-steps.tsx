import { Database, FileText, Search, Play, Loader2, CheckCircle2, RefreshCw } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SQLEditor } from '@/components/sql-editor'
import type {
  WidgetType,
  ChartWidgetType,
  KPIFormat,
  ConnectionConfig,
  SavedQuery,
  SchemaInfo
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
    <div className="grid gap-2">
      {WIDGET_TYPES.map((wt) => (
        <button
          key={wt.type}
          onClick={() => dispatch({ type: 'SET_WIDGET_TYPE', payload: wt.type })}
          className={cn(
            'group relative flex items-center gap-4 p-4 rounded-xl text-left transition-all duration-200',
            widgetType === wt.type
              ? 'bg-primary/10 ring-2 ring-primary/50 ring-offset-1 ring-offset-background'
              : 'bg-muted/30 hover:bg-muted/50'
          )}
        >
          <div
            className={cn(
              'flex size-11 items-center justify-center rounded-xl transition-all duration-200',
              widgetType === wt.type
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-background border border-border group-hover:border-primary/30 group-hover:bg-primary/5'
            )}
          >
            <wt.icon className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{wt.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{wt.description}</div>
          </div>
          <div
            className={cn(
              'size-5 rounded-full border-2 flex items-center justify-center transition-all duration-200',
              widgetType === wt.type
                ? 'border-primary bg-primary'
                : 'border-muted-foreground/30 group-hover:border-primary/50'
            )}
          >
            {widgetType === wt.type && (
              <div className="size-2 rounded-full bg-primary-foreground" />
            )}
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
  schemas: SchemaInfo[]
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
  schemas,
  dispatch
}: SourceStepProps) {
  return (
    <div className="space-y-4">
      <div className="inline-flex p-1 bg-muted/50 rounded-lg w-full">
        <button
          onClick={() => dispatch({ type: 'SET_SOURCE_TYPE', payload: 'saved-query' })}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200',
            sourceType === 'saved-query'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <FileText className="size-4" />
          Saved Query
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_SOURCE_TYPE', payload: 'inline' })}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200',
            sourceType === 'inline'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Database className="size-4" />
          Write SQL
        </button>
      </div>

      {sourceType === 'saved-query' ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search saved queries..."
              value={querySearch}
              onChange={(e) => dispatch({ type: 'SET_QUERY_SEARCH', payload: e.target.value })}
              className="pl-9 h-9"
            />
          </div>
          <ScrollArea className="h-[180px] rounded-lg border bg-muted/20">
            <div className="p-1.5 space-y-1">
              {filteredQueries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <FileText className="size-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No saved queries found</p>
                </div>
              ) : (
                filteredQueries.map((query) => (
                  <button
                    key={query.id}
                    onClick={() => dispatch({ type: 'SET_SELECTED_QUERY_ID', payload: query.id })}
                    className={cn(
                      'w-full text-left p-2.5 rounded-lg transition-all duration-150',
                      selectedQueryId === query.id
                        ? 'bg-primary/10 ring-1 ring-primary/30'
                        : 'hover:bg-muted/80'
                    )}
                  >
                    <div className="font-medium text-sm">{query.name}</div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5 font-mono">
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
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Connection
            </Label>
            <Select
              value={connectionId}
              onValueChange={(v) => dispatch({ type: 'SET_CONNECTION_ID', payload: v })}
            >
              <SelectTrigger className="h-9">
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
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              SQL Query
            </Label>
            <div className="rounded-lg border overflow-hidden bg-muted/20">
              <SQLEditor
                value={inlineSql}
                onChange={(v) => dispatch({ type: 'SET_INLINE_SQL', payload: v })}
                height={140}
                placeholder="SELECT * FROM ..."
                schemas={schemas}
              />
            </div>
          </div>
        </div>
      )}

      {sourceType === 'saved-query' && selectedQueryId && (
        <div className="grid gap-1.5 pt-1">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Connection
          </Label>
          <Select
            value={connectionId}
            onValueChange={(v) => dispatch({ type: 'SET_CONNECTION_ID', payload: v })}
          >
            <SelectTrigger className="h-9">
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

  const availableColumns = previewData && previewData.length > 0 ? Object.keys(previewData[0]) : []

  return (
    <div className="space-y-4">
      {!previewData ? (
        <button
          onClick={onPreviewQuery}
          disabled={isLoadingPreview}
          className="w-full flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 hover:border-primary/40 transition-all duration-200 group"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
              {isLoadingPreview ? (
                <Loader2 className="size-5 text-primary animate-spin" />
              ) : (
                <Play className="size-5 text-primary" />
              )}
            </div>
            <div className="text-left">
              <div className="font-medium text-sm">
                {isLoadingPreview ? 'Loading preview...' : 'Preview your data'}
              </div>
              <div className="text-xs text-muted-foreground">
                Get AI-powered widget suggestions
              </div>
            </div>
          </div>
          {!isLoadingPreview && (
            <div className="text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              Click to preview
            </div>
          )}
        </button>
      ) : (
        <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-500" />
            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              Preview loaded
            </span>
            <span className="text-xs text-muted-foreground">
              {previewData.length} row{previewData.length !== 1 ? 's' : ''}, {availableColumns.length} column{availableColumns.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={onPreviewQuery}
            disabled={isLoadingPreview}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {isLoadingPreview ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            Refresh
          </button>
        </div>
      )}

      <AIWidgetSuggestion queryResult={previewData} onSuggestionSelect={onSuggestionSelect} />

      <div className="space-y-4">
        <div className="grid gap-1.5">
          <Label
            htmlFor="widgetName"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
          >
            Widget Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="widgetName"
            placeholder="e.g., Monthly Revenue Trend"
            value={widgetName}
            onChange={(e) => dispatch({ type: 'SET_WIDGET_NAME', payload: e.target.value })}
            className={cn('h-9', !widgetName.trim() && 'border-destructive/50')}
          />
        </div>

        {widgetType === 'chart' && (
          <ChartConfig
            chartType={chartType}
            xKey={xKey}
            yKeys={yKeys}
            availableColumns={availableColumns}
            dispatch={dispatch}
          />
        )}

        {widgetType === 'kpi' && (
          <KPIConfig
            kpiFormat={kpiFormat}
            kpiLabel={kpiLabel}
            valueKey={valueKey}
            prefix={prefix}
            suffix={suffix}
            availableColumns={availableColumns}
            dispatch={dispatch}
          />
        )}

        {widgetType === 'table' && (
          <div className="grid gap-1.5">
            <Label
              htmlFor="maxRows"
              className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
            >
              Maximum Rows
            </Label>
            <Input
              id="maxRows"
              type="number"
              min={1}
              max={100}
              value={maxRows}
              onChange={(e) =>
                dispatch({ type: 'SET_MAX_ROWS', payload: parseInt(e.target.value) || 10 })
              }
              className="h-9 w-24"
            />
            <p className="text-xs text-muted-foreground">
              Display up to {maxRows} rows in the table widget
            </p>
          </div>
        )}

        <WidgetWidthSelector widgetWidth={widgetWidth} dispatch={dispatch} />
      </div>
    </div>
  )
}

interface ChartConfigProps {
  chartType: ChartWidgetType
  xKey: string
  yKeys: string
  availableColumns: string[]
  dispatch: React.Dispatch<DialogAction>
}

function ChartConfig({ chartType, xKey, yKeys, availableColumns, dispatch }: ChartConfigProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Chart Type
        </Label>
        <div className="grid grid-cols-4 gap-1.5">
          {CHART_TYPES.map((ct) => (
            <button
              key={ct.type}
              onClick={() => dispatch({ type: 'SET_CHART_TYPE', payload: ct.type })}
              className={cn(
                'flex flex-col items-center gap-1 py-2.5 px-2 rounded-lg transition-all duration-150',
                chartType === ct.type
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              <ct.icon className="size-4" />
              <span className="text-[11px] font-medium">{ct.label.replace(' Chart', '')}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label
            htmlFor="xKey"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
          >
            X Axis <span className="text-destructive">*</span>
          </Label>
          <Input
            id="xKey"
            placeholder="e.g., date"
            value={xKey}
            onChange={(e) => dispatch({ type: 'SET_X_KEY', payload: e.target.value })}
            className={cn('h-9', !xKey && 'border-destructive/50')}
          />
        </div>
        <div className="grid gap-1.5">
          <Label
            htmlFor="yKeys"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
          >
            Y Axis <span className="text-destructive">*</span>
          </Label>
          <Input
            id="yKeys"
            placeholder="e.g., sales, revenue"
            value={yKeys}
            onChange={(e) => dispatch({ type: 'SET_Y_KEYS', payload: e.target.value })}
            className={cn('h-9', !yKeys && 'border-destructive/50')}
          />
        </div>
      </div>
      {availableColumns.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide mr-1">
            Columns:
          </span>
          {availableColumns.map((col) => (
            <span
              key={col}
              className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
            >
              {col}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

interface KPIConfigProps {
  kpiFormat: KPIFormat
  kpiLabel: string
  valueKey: string
  prefix: string
  suffix: string
  availableColumns: string[]
  dispatch: React.Dispatch<DialogAction>
}

function KPIConfig({
  kpiFormat,
  kpiLabel,
  valueKey,
  prefix,
  suffix,
  availableColumns,
  dispatch
}: KPIConfigProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label
            htmlFor="kpiLabel"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
          >
            Label <span className="text-destructive">*</span>
          </Label>
          <Input
            id="kpiLabel"
            placeholder="e.g., Total Revenue"
            value={kpiLabel}
            onChange={(e) => dispatch({ type: 'SET_KPI_LABEL', payload: e.target.value })}
            className={cn('h-9', !kpiLabel.trim() && 'border-destructive/50')}
          />
        </div>
        <div className="grid gap-1.5">
          <Label
            htmlFor="valueKey"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
          >
            Value Column <span className="text-destructive">*</span>
          </Label>
          <Input
            id="valueKey"
            placeholder="e.g., total"
            value={valueKey}
            onChange={(e) => dispatch({ type: 'SET_VALUE_KEY', payload: e.target.value })}
            className={cn('h-9', !valueKey && 'border-destructive/50')}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Format
          </Label>
          <Select
            value={kpiFormat}
            onValueChange={(v) => dispatch({ type: 'SET_KPI_FORMAT', payload: v as KPIFormat })}
          >
            <SelectTrigger className="h-9">
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
        <div className="grid gap-1.5">
          <Label
            htmlFor="prefix"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
          >
            Prefix
          </Label>
          <Input
            id="prefix"
            placeholder="$"
            value={prefix}
            onChange={(e) => dispatch({ type: 'SET_PREFIX', payload: e.target.value })}
            className="h-9"
          />
        </div>
        <div className="grid gap-1.5">
          <Label
            htmlFor="suffix"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
          >
            Suffix
          </Label>
          <Input
            id="suffix"
            placeholder="%"
            value={suffix}
            onChange={(e) => dispatch({ type: 'SET_SUFFIX', payload: e.target.value })}
            className="h-9"
          />
        </div>
      </div>

      {availableColumns.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide mr-1">
            Columns:
          </span>
          {availableColumns.map((col) => (
            <span
              key={col}
              className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
            >
              {col}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

interface WidgetWidthSelectorProps {
  widgetWidth: 'auto' | 'half' | 'full'
  dispatch: React.Dispatch<DialogAction>
}

const WIDTH_OPTIONS = [
  { value: 'auto' as const, label: 'Auto', width: '33%' },
  { value: 'half' as const, label: 'Half', width: '50%' },
  { value: 'full' as const, label: 'Full', width: '100%' }
]

function WidgetWidthSelector({ widgetWidth, dispatch }: WidgetWidthSelectorProps) {
  return (
    <div className="grid gap-2">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Widget Width
      </Label>
      <div className="inline-flex p-1 bg-muted/50 rounded-lg">
        {WIDTH_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => dispatch({ type: 'SET_WIDGET_WIDTH', payload: option.value })}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150',
              widgetWidth === option.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span>{option.label}</span>
            <span className="text-[10px] text-muted-foreground">{option.width}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
