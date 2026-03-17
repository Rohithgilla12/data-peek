import { BarChart3, LineChart, AreaChart, PieChart, Hash, Table2 } from 'lucide-react'
import type { WidgetType, ChartWidgetType, KPIFormat } from '@shared/index'
import type { WidgetSuggestion } from './ai-widget-suggestion'

export type Step = 'type' | 'source' | 'config'

export const WIDGET_TYPES: {
  type: WidgetType
  label: string
  description: string
  icon: typeof Hash
}[] = [
  {
    type: 'chart',
    label: 'Chart',
    description: 'Visualize trends and comparisons',
    icon: BarChart3
  },
  { type: 'kpi', label: 'KPI Metric', description: 'Display key numbers and trends', icon: Hash },
  { type: 'table', label: 'Table', description: 'Show tabular data preview', icon: Table2 }
]

export const CHART_TYPES: { type: ChartWidgetType; label: string; icon: typeof BarChart3 }[] = [
  { type: 'bar', label: 'Bar Chart', icon: BarChart3 },
  { type: 'line', label: 'Line Chart', icon: LineChart },
  { type: 'area', label: 'Area Chart', icon: AreaChart },
  { type: 'pie', label: 'Pie Chart', icon: PieChart }
]

export const KPI_FORMATS: { format: KPIFormat; label: string }[] = [
  { format: 'number', label: 'Number' },
  { format: 'currency', label: 'Currency' },
  { format: 'percent', label: 'Percentage' },
  { format: 'duration', label: 'Duration' }
]

export interface DialogState {
  step: Step
  isSubmitting: boolean
  error: string | null
  widgetName: string
  widgetType: WidgetType
  sourceType: 'saved-query' | 'inline'
  selectedQueryId: string
  inlineSql: string
  connectionId: string
  querySearch: string
  chartType: ChartWidgetType
  xKey: string
  yKeys: string
  kpiFormat: KPIFormat
  kpiLabel: string
  valueKey: string
  prefix: string
  suffix: string
  maxRows: number
  widgetWidth: 'auto' | 'half' | 'full'
  previewData: Record<string, unknown>[] | null
  isLoadingPreview: boolean
}

export type DialogAction =
  | { type: 'SET_STEP'; payload: Step }
  | { type: 'SET_SUBMITTING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_WIDGET_NAME'; payload: string }
  | { type: 'SET_WIDGET_TYPE'; payload: WidgetType }
  | { type: 'SET_SOURCE_TYPE'; payload: 'saved-query' | 'inline' }
  | { type: 'SET_SELECTED_QUERY_ID'; payload: string }
  | { type: 'SET_INLINE_SQL'; payload: string }
  | { type: 'SET_CONNECTION_ID'; payload: string }
  | { type: 'SET_QUERY_SEARCH'; payload: string }
  | { type: 'SET_CHART_TYPE'; payload: ChartWidgetType }
  | { type: 'SET_X_KEY'; payload: string }
  | { type: 'SET_Y_KEYS'; payload: string }
  | { type: 'SET_KPI_FORMAT'; payload: KPIFormat }
  | { type: 'SET_KPI_LABEL'; payload: string }
  | { type: 'SET_VALUE_KEY'; payload: string }
  | { type: 'SET_PREFIX'; payload: string }
  | { type: 'SET_SUFFIX'; payload: string }
  | { type: 'SET_MAX_ROWS'; payload: number }
  | { type: 'SET_WIDGET_WIDTH'; payload: 'auto' | 'half' | 'full' }
  | { type: 'SET_PREVIEW_DATA'; payload: Record<string, unknown>[] | null }
  | { type: 'SET_LOADING_PREVIEW'; payload: boolean }
  | { type: 'APPLY_SUGGESTION'; payload: WidgetSuggestion }
  | { type: 'RESET'; payload: { defaultConnectionId: string } }

export const initialDialogState: DialogState = {
  step: 'type',
  isSubmitting: false,
  error: null,
  widgetName: '',
  widgetType: 'chart',
  sourceType: 'saved-query',
  selectedQueryId: '',
  inlineSql: '',
  connectionId: '',
  querySearch: '',
  chartType: 'bar',
  xKey: '',
  yKeys: '',
  kpiFormat: 'number',
  kpiLabel: '',
  valueKey: '',
  prefix: '',
  suffix: '',
  maxRows: 10,
  widgetWidth: 'auto',
  previewData: null,
  isLoadingPreview: false
}

export function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.payload }
    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload }
    case 'SET_WIDGET_NAME':
      return { ...state, widgetName: action.payload }
    case 'SET_WIDGET_TYPE':
      return { ...state, widgetType: action.payload }
    case 'SET_SOURCE_TYPE':
      return { ...state, sourceType: action.payload }
    case 'SET_SELECTED_QUERY_ID':
      return { ...state, selectedQueryId: action.payload }
    case 'SET_INLINE_SQL':
      return { ...state, inlineSql: action.payload }
    case 'SET_CONNECTION_ID':
      return { ...state, connectionId: action.payload }
    case 'SET_QUERY_SEARCH':
      return { ...state, querySearch: action.payload }
    case 'SET_CHART_TYPE':
      return { ...state, chartType: action.payload }
    case 'SET_X_KEY':
      return { ...state, xKey: action.payload }
    case 'SET_Y_KEYS':
      return { ...state, yKeys: action.payload }
    case 'SET_KPI_FORMAT':
      return { ...state, kpiFormat: action.payload }
    case 'SET_KPI_LABEL':
      return { ...state, kpiLabel: action.payload }
    case 'SET_VALUE_KEY':
      return { ...state, valueKey: action.payload }
    case 'SET_PREFIX':
      return { ...state, prefix: action.payload }
    case 'SET_SUFFIX':
      return { ...state, suffix: action.payload }
    case 'SET_MAX_ROWS':
      return { ...state, maxRows: action.payload }
    case 'SET_WIDGET_WIDTH':
      return { ...state, widgetWidth: action.payload }
    case 'SET_PREVIEW_DATA':
      return { ...state, previewData: action.payload }
    case 'SET_LOADING_PREVIEW':
      return { ...state, isLoadingPreview: action.payload }
    case 'APPLY_SUGGESTION': {
      const suggestion = action.payload
      const updates: Partial<DialogState> = {
        widgetType: suggestion.type,
        widgetName: state.widgetName || suggestion.name
      }
      if (suggestion.type === 'chart' && suggestion.chartType) {
        updates.chartType = suggestion.chartType
        if (suggestion.xKey) updates.xKey = suggestion.xKey
        if (suggestion.yKeys) updates.yKeys = suggestion.yKeys.join(', ')
      } else if (suggestion.type === 'kpi') {
        if (suggestion.kpiFormat) updates.kpiFormat = suggestion.kpiFormat
        if (suggestion.valueKey) updates.valueKey = suggestion.valueKey
        if (suggestion.label) updates.kpiLabel = suggestion.label
      }
      return { ...state, ...updates }
    }
    case 'RESET':
      return { ...initialDialogState, connectionId: action.payload.defaultConnectionId }
    default:
      return state
  }
}
