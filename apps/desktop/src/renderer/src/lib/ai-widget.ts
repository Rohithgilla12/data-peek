import type { WidgetConfig } from '@data-peek/shared'

/** The subset of an AI structured response that widget construction reads. */
export interface WidgetSourceData {
  type: 'query' | 'chart' | 'metric' | 'schema' | 'message' | 'report'
  message?: string | null
  chartType?: 'bar' | 'line' | 'pie' | 'area' | null
  xKey?: string | null
  yKeys?: string[] | null
  title?: string | null
  label?: string | null
  format?: 'number' | 'currency' | 'percent' | 'duration' | null
}

/**
 * Map an AI structured response + the real result columns → a dashboard widget
 * config + grid size. Shared by the "Ask AI" widget dialog and the chat
 * "pin to dashboard" action so both build identical widgets.
 */
export function buildWidgetConfig(
  data: WidgetSourceData,
  cols: string[]
): { config: WidgetConfig; w: number; h: number } {
  // Chart when the model returned a usable chart spec.
  if (data.type === 'chart' && data.chartType && (data.xKey || cols[0])) {
    const xKey = data.xKey && cols.includes(data.xKey) ? data.xKey : cols[0]
    const usableYKeys = (data.yKeys ?? []).filter((k) => cols.includes(k))
    const yKeys = usableYKeys.length > 0 ? usableYKeys : cols.filter((c) => c !== xKey).slice(0, 1)
    return {
      config: {
        widgetType: 'chart',
        chartType: data.chartType,
        xKey,
        yKeys: yKeys.length ? yKeys : cols.slice(0, 1),
        title: data.title ?? undefined,
        showLegend: true,
        showGrid: true
      },
      w: 6,
      h: 4
    }
  }

  // KPI for a single-value metric.
  if (data.type === 'metric' && cols[0]) {
    return {
      config: {
        widgetType: 'kpi',
        format: data.format ?? 'number',
        label: data.label ?? data.message?.slice(0, 40) ?? 'Metric',
        valueKey: cols[0]
      },
      w: 3,
      h: 2
    }
  }

  // Otherwise show the rows as a table.
  return { config: { widgetType: 'table', maxRows: 50 }, w: 6, h: 4 }
}

/** A short widget/artifact name from an AI response. */
export function widgetNameFor(data: WidgetSourceData): string {
  return (
    (data.type === 'chart' && data.title) ||
    (data.type === 'metric' && data.label) ||
    data.message?.slice(0, 60) ||
    'AI widget'
  )
}
