import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  ResponsiveContainer
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig
} from '@/components/ui/chart'
import type { ChartWidgetConfig } from '@shared/index'
import { useMemo, useCallback } from 'react'

interface WidgetChartProps {
  config: ChartWidgetConfig
  data: Record<string, unknown>[]
}

const DEFAULT_COLORS = [
  'hsl(221, 83%, 53%)',
  'hsl(262, 83%, 58%)',
  'hsl(142, 71%, 45%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)',
  'hsl(199, 89%, 48%)',
  'hsl(339, 90%, 51%)',
  'hsl(24, 95%, 53%)'
]

/**
 * Detects the data type of the first non-null, non-undefined value in an array.
 *
 * Inspects the first present value and classifies it as a number, date, or string.
 *
 * @param values - Array of values to inspect
 * @returns `'number'` if the value is a number, `'date'` if the value is a `Date` instance or a string that parses as a date and matches a `YYYY-MM` prefix, `'string'` otherwise
 */
function detectDataType(values: unknown[]): 'number' | 'date' | 'string' {
  const sample = values.find((v) => v !== null && v !== undefined)
  if (typeof sample === 'number') return 'number'
  if (sample instanceof Date) return 'date'
  if (typeof sample === 'string') {
    if (!isNaN(Date.parse(sample)) && sample.match(/^\d{4}-\d{2}/)) {
      return 'date'
    }
  }
  return 'string'
}

/**
 * Format a value for display according to the specified output type.
 *
 * @param value - The value to format; may be a number, Date, date-string/number, or any other value
 * @param type - The target format: `'number'`, `'date'`, or `'string'`
 * @returns `'N/A'` if `value` is `null` or `undefined`; otherwise a locale-formatted number (max 2 decimals) when `type` is `'number'`, a locale date string when `type` is `'date'`, or the value converted to a string for `'string'`
 */
function formatValue(value: unknown, type: 'number' | 'date' | 'string'): string {
  if (value === null || value === undefined) return 'N/A'
  if (type === 'number' && typeof value === 'number') {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  if (type === 'date') {
    const date = new Date(value as string | number | Date)
    return date.toLocaleDateString()
  }
  return String(value)
}

/**
 * Renders a responsive chart (bar, line, area, or pie) based on the provided configuration and data.
 *
 * The component auto-detects the x-axis value type (number, date, or string), formats axis labels and tooltips,
 * generates per-series labels and colors, and conditionally shows grid and legend entries.
 *
 * @param props.config - ChartWidgetConfig that specifies chartType, xKey, yKeys, optional colors, and display options.
 * @param props.data - Array of data records used as the chart dataset; each record must contain the configured xKey and yKeys.
 * @returns A JSX element containing the rendered chart configured according to `config` and populated with `data`.
 */
export function WidgetChart({ config, data }: WidgetChartProps) {
  const {
    chartType,
    xKey,
    yKeys,
    colors = DEFAULT_COLORS,
    showLegend = true,
    showGrid = true
  } = config

  const xDataType = useMemo(() => {
    const xValues = data.map((d) => d[xKey])
    return detectDataType(xValues)
  }, [data, xKey])

  const chartConfig = useMemo(() => {
    const cfg: ChartConfig = {}
    yKeys.forEach((key, index) => {
      cfg[key] = {
        label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        color: colors[index % colors.length]
      }
    })
    return cfg
  }, [yKeys, colors])

  const formatXAxis = useCallback(
    (value: unknown) => {
      if (xDataType === 'date') {
        const date = new Date(value as string)
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      }
      const str = String(value)
      return str.length > 10 ? str.slice(0, 10) + '...' : str
    },
    [xDataType]
  )

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No data available
      </div>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="h-full w-full min-h-0">
      {chartType === 'bar' && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            {showGrid && (
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/30" />
            )}
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatXAxis}
              tick={{ fontSize: 10 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => formatValue(v, 'number')}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent labelFormatter={(label) => formatValue(label, xDataType)} />
              }
            />
            {showLegend && yKeys.length > 1 && (
              <ChartLegend
                content={({ payload, verticalAlign }) => (
                  <ChartLegendContent
                    payload={
                      payload as { value?: string; dataKey?: string | number; color?: string }[]
                    }
                    verticalAlign={verticalAlign}
                  />
                )}
              />
            )}
            {yKeys.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                fill={colors[index % colors.length]}
                radius={[2, 2, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}

      {chartType === 'line' && (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            {showGrid && (
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/30" />
            )}
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatXAxis}
              tick={{ fontSize: 10 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => formatValue(v, 'number')}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent labelFormatter={(label) => formatValue(label, xDataType)} />
              }
            />
            {showLegend && yKeys.length > 1 && (
              <ChartLegend
                content={({ payload, verticalAlign }) => (
                  <ChartLegendContent
                    payload={
                      payload as { value?: string; dataKey?: string | number; color?: string }[]
                    }
                    verticalAlign={verticalAlign}
                  />
                )}
              />
            )}
            {yKeys.map((key, index) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[index % colors.length]}
                strokeWidth={2}
                dot={data.length <= 15}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      {chartType === 'area' && (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              {yKeys.map((key, index) => (
                <linearGradient key={key} id={`widget-gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors[index % colors.length]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={colors[index % colors.length]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {showGrid && (
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/30" />
            )}
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatXAxis}
              tick={{ fontSize: 10 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => formatValue(v, 'number')}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent labelFormatter={(label) => formatValue(label, xDataType)} />
              }
            />
            {showLegend && yKeys.length > 1 && (
              <ChartLegend
                content={({ payload, verticalAlign }) => (
                  <ChartLegendContent
                    payload={
                      payload as { value?: string; dataKey?: string | number; color?: string }[]
                    }
                    verticalAlign={verticalAlign}
                  />
                )}
              />
            )}
            {yKeys.map((key, index) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colors[index % colors.length]}
                fill={`url(#widget-gradient-${key})`}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}

      {chartType === 'pie' && (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <ChartTooltip
              content={
                <ChartTooltipContent labelFormatter={(label) => formatValue(label, xDataType)} />
              }
            />
            <Pie
              data={data}
              dataKey={yKeys[0]}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius="80%"
              innerRadius="40%"
              paddingAngle={2}
              label={({ name, percent }) =>
                `${String(name).slice(0, 8)}${String(name).length > 8 ? '..' : ''} (${((percent ?? 0) * 100).toFixed(0)}%)`
              }
              labelLine={{ strokeWidth: 1 }}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartContainer>
  )
}
