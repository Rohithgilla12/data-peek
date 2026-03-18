import { useState } from 'react'
import {
  Sparkles,
  Loader2,
  BarChart3,
  LineChart,
  AreaChart,
  PieChart,
  Hash,
  Table2
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { ChartWidgetType, KPIFormat, WidgetType } from '@shared/index'

interface AIWidgetSuggestionProps {
  queryResult: Record<string, unknown>[] | null
  onSuggestionSelect: (suggestion: WidgetSuggestion) => void
}

export interface WidgetSuggestion {
  type: WidgetType
  name: string
  chartType?: ChartWidgetType
  xKey?: string
  yKeys?: string[]
  kpiFormat?: KPIFormat
  valueKey?: string
  label?: string
  confidence: number
  reason: string
}

const CHART_ICONS: Record<ChartWidgetType, typeof BarChart3> = {
  bar: BarChart3,
  line: LineChart,
  area: AreaChart,
  pie: PieChart
}

/**
 * Infers up to four widget suggestions (charts, KPI, or table) from tabular query data.
 *
 * Analyzes column types (numeric, date, categorical) and dataset size to propose relevant
 * visualizations and a data table preview. Possible suggestions include:
 * - KPI for a single-row numeric value
 * - Line/area time series when a date column and numeric columns are present
 * - Bar (and optionally pie) charts for categorical × numeric data
 * - A data table preview when there are multiple columns and rows
 *
 * @param data - Array of result rows to analyze; each row is a record of column name to value
 * @returns An array of up to four `WidgetSuggestion` objects sorted by descending confidence.
 * `[]` is returned when `data` is null, undefined, or empty.
 */
function analyzeQueryData(data: Record<string, unknown>[]): WidgetSuggestion[] {
  if (!data || data.length === 0) return []

  const suggestions: WidgetSuggestion[] = []
  const columns = Object.keys(data[0])

  const numericColumns: string[] = []
  const dateColumns: string[] = []
  const categoryColumns: string[] = []

  for (const col of columns) {
    const values = data.map((row) => row[col]).filter((v) => v !== null && v !== undefined)
    const sample = values[0]

    if (typeof sample === 'number') {
      numericColumns.push(col)
    } else if (typeof sample === 'string') {
      if (!isNaN(Date.parse(sample)) && sample.match(/^\d{4}-\d{2}/)) {
        dateColumns.push(col)
      } else {
        const uniqueValues = new Set(values.map(String))
        if (uniqueValues.size <= Math.min(20, data.length * 0.5)) {
          categoryColumns.push(col)
        }
      }
    }
  }

  if (data.length === 1 && numericColumns.length >= 1) {
    const primaryNumeric = numericColumns[0]
    const isPercentage =
      primaryNumeric.toLowerCase().includes('percent') ||
      primaryNumeric.toLowerCase().includes('rate')
    const isCurrency =
      primaryNumeric.toLowerCase().includes('amount') ||
      primaryNumeric.toLowerCase().includes('revenue') ||
      primaryNumeric.toLowerCase().includes('cost') ||
      primaryNumeric.toLowerCase().includes('price')

    suggestions.push({
      type: 'kpi',
      name: formatColumnName(primaryNumeric),
      kpiFormat: isPercentage ? 'percent' : isCurrency ? 'currency' : 'number',
      valueKey: primaryNumeric,
      label: formatColumnName(primaryNumeric),
      confidence: 0.9,
      reason: 'Single row with numeric value - ideal for KPI display'
    })
  }

  if (dateColumns.length >= 1 && numericColumns.length >= 1) {
    const xKey = dateColumns[0]
    const yKeys = numericColumns.slice(0, 3)

    suggestions.push({
      type: 'chart',
      name: `${formatColumnName(yKeys[0])} Over Time`,
      chartType: 'line',
      xKey,
      yKeys,
      confidence: 0.85,
      reason: 'Time series data detected - line chart shows trends over time'
    })

    suggestions.push({
      type: 'chart',
      name: `${formatColumnName(yKeys[0])} Trend`,
      chartType: 'area',
      xKey,
      yKeys: [yKeys[0]],
      confidence: 0.75,
      reason: 'Area chart emphasizes volume/magnitude over time'
    })
  }

  if (categoryColumns.length >= 1 && numericColumns.length >= 1) {
    const xKey = categoryColumns[0]
    const yKeys = numericColumns.slice(0, 2)

    suggestions.push({
      type: 'chart',
      name: `${formatColumnName(yKeys[0])} by ${formatColumnName(xKey)}`,
      chartType: 'bar',
      xKey,
      yKeys,
      confidence: 0.8,
      reason: 'Categorical data with numeric values - bar chart for comparison'
    })

    if (numericColumns.length === 1 && data.length <= 8) {
      suggestions.push({
        type: 'chart',
        name: `${formatColumnName(xKey)} Distribution`,
        chartType: 'pie',
        xKey,
        yKeys: [numericColumns[0]],
        confidence: 0.7,
        reason: 'Small categorical dataset - pie chart shows proportions'
      })
    }
  }

  if (columns.length >= 2 && data.length >= 3) {
    suggestions.push({
      type: 'table',
      name: 'Data Table',
      confidence: 0.6,
      reason: 'Tabular data preview for detailed inspection'
    })
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 4)
}

/**
 * Convert a column identifier into a human-readable, title-cased label.
 *
 * Handles snake_case and camelCase by replacing underscores with spaces,
 * inserting spaces before camelCase transitions, and capitalizing words.
 *
 * @param col - Column name or identifier (e.g., "total_sales", "orderDate")
 * @returns A spaced, title-cased label (e.g., "Total Sales", "Order Date")
 */
function formatColumnName(col: string): string {
  return col
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Render AI-driven widget suggestions inferred from the provided query result and allow the user to select one.
 *
 * Displays a control to trigger analysis, shows a loading state while analyzing, and renders up to four suggested widgets
 * (charts, KPI, or table) with name, confidence, and a brief reason. When a suggestion is clicked the `onSuggestionSelect`
 * callback is invoked with the chosen suggestion.
 *
 * @param queryResult - The dataset (array of records) used to infer widget suggestions; if empty or null nothing is rendered.
 * @param onSuggestionSelect - Callback invoked with the selected WidgetSuggestion when the user picks a suggestion.
 * @returns A React element containing the suggestion UI, or `null` when `queryResult` is empty or null.
 */
export function AIWidgetSuggestion({ queryResult, onSuggestionSelect }: AIWidgetSuggestionProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [suggestions, setSuggestions] = useState<WidgetSuggestion[]>([])
  const [hasAnalyzed, setHasAnalyzed] = useState(false)

  const handleAnalyze = () => {
    if (!queryResult || queryResult.length === 0) return

    setIsAnalyzing(true)
    setTimeout(() => {
      const results = analyzeQueryData(queryResult)
      setSuggestions(results)
      setHasAnalyzed(true)
      setIsAnalyzing(false)
    }, 500)
  }

  if (!queryResult || queryResult.length === 0) {
    return null
  }

  if (!hasAnalyzed && !isAnalyzing) {
    handleAnalyze()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-purple-500" />
        <span className="text-sm font-medium">AI Suggestions</span>
        {isAnalyzing && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Analyzing data...
          </div>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="grid gap-2">
          {suggestions.map((suggestion, index) => {
            const Icon =
              suggestion.type === 'chart' && suggestion.chartType
                ? CHART_ICONS[suggestion.chartType]
                : suggestion.type === 'kpi'
                  ? Hash
                  : Table2

            return (
              <button
                key={index}
                className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/60 hover:bg-accent/50 transition-all text-left group"
                onClick={() => onSuggestionSelect(suggestion)}
              >
                <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                  <Icon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{suggestion.name}</span>
                    <Badge
                      variant="secondary"
                      className="text-xs font-medium bg-primary/10 text-primary border-0"
                    >
                      {Math.round(suggestion.confidence * 100)}% match
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {suggestion.reason}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {hasAnalyzed && suggestions.length === 0 && (
        <div className="p-3 rounded-lg border border-dashed">
          <p className="text-sm text-muted-foreground">
            No widget suggestions available for this data. Configure manually below.
          </p>
        </div>
      )}
    </div>
  )
}
