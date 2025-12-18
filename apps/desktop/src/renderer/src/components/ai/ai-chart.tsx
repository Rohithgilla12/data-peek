import * as React from 'react'
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
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  AreaChart as AreaChartIcon,
  TrendingUp,
  Hash,
  Calendar
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig
} from '@/components/ui/chart'
import { cn } from '@/lib/utils'

// Chart types supported
type ChartType = 'bar' | 'line' | 'pie' | 'area'

// Data structure from query results
interface ChartData {
  title?: string
  description?: string
  chartType?: ChartType
  data: Record<string, unknown>[]
  xKey: string
  yKeys: string[]
  colors?: string[]
}

interface AIChartProps {
  chartData: ChartData
  className?: string
}

// Default color palette
const DEFAULT_COLORS = [
  'hsl(221, 83%, 53%)', // blue
  'hsl(262, 83%, 58%)', // purple
  'hsl(142, 71%, 45%)', // green
  'hsl(38, 92%, 50%)', // amber
  'hsl(0, 84%, 60%)', // red
  'hsl(199, 89%, 48%)', // cyan
  'hsl(339, 90%, 51%)', // pink
  'hsl(24, 95%, 53%)' // orange
]

// Chart type icons
const CHART_ICONS: Record<ChartType, React.ReactNode> = {
  bar: <BarChart3 className="size-3.5" />,
  line: <LineChartIcon className="size-3.5" />,
  pie: <PieChartIcon className="size-3.5" />,
  area: <AreaChartIcon className="size-3.5" />
}

// Helper to detect data type
function detectDataType(values: unknown[]): 'number' | 'date' | 'string' {
  const sample = values.find((v) => v !== null && v !== undefined)
  if (typeof sample === 'number') return 'number'
  if (sample instanceof Date) return 'date'
  if (typeof sample === 'string') {
    // Check if it looks like a date
    if (!isNaN(Date.parse(sample)) && sample.match(/^\d{4}-\d{2}/)) {
      return 'date'
    }
  }
  return 'string'
}

// Helper to format values for display
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

// Helper to suggest best chart type based on data
function suggestChartType(
  data: Record<string, unknown>[],
  xKey: string,
  yKeys: string[]
): ChartType {
  if (data.length === 0) return 'bar'

  const xValues = data.map((d) => d[xKey])
  const xType = detectDataType(xValues)

  // Pie chart for categorical data with single metric and few categories
  if (xType === 'string' && yKeys.length === 1 && data.length <= 8) {
    return 'pie'
  }

  // Line/area chart for time series
  if (xType === 'date') {
    return yKeys.length > 1 ? 'area' : 'line'
  }

  // Bar chart for categorical comparisons
  return 'bar'
}

export function AIChart({ chartData, className }: AIChartProps) {
  const { title, description, data, xKey, yKeys, colors = DEFAULT_COLORS } = chartData

  // Determine chart type
  const suggestedType = React.useMemo(
    () => chartData.chartType || suggestChartType(data, xKey, yKeys),
    [chartData.chartType, data, xKey, yKeys]
  )

  const [chartType, setChartType] = React.useState<ChartType>(suggestedType)

  // Detect x-axis data type
  const xDataType = React.useMemo(() => {
    const xValues = data.map((d) => d[xKey])
    return detectDataType(xValues)
  }, [data, xKey])

  // Build chart config for theming
  const chartConfig = React.useMemo(() => {
    const config: ChartConfig = {}
    yKeys.forEach((key, index) => {
      config[key] = {
        label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        color: colors[index % colors.length]
      }
    })
    return config
  }, [yKeys, colors])

  // Format x-axis tick
  const formatXAxis = React.useCallback(
    (value: unknown) => {
      if (xDataType === 'date') {
        const date = new Date(value as string)
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      }
      const str = String(value)
      return str.length > 12 ? str.slice(0, 12) + '...' : str
    },
    [xDataType]
  )

  // Calculate summary stats
  const stats = React.useMemo(() => {
    if (yKeys.length === 0 || data.length === 0) return null

    const primaryKey = yKeys[0]
    const values = data.map((d) => Number(d[primaryKey]) || 0)
    const sum = values.reduce((a, b) => a + b, 0)
    const avg = sum / values.length
    const max = Math.max(...values)
    const min = Math.min(...values)

    return { sum, avg, max, min, count: values.length }
  }, [data, yKeys])

  if (data.length === 0) {
    return (
      <div className={cn('p-4 text-center text-muted-foreground', className)}>
        No data to visualize
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-border/50 bg-gradient-to-b from-background to-muted/20 overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {title && <h3 className="font-semibold text-sm truncate">{title}</h3>}
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
            )}
          </div>

          {/* Chart type selector */}
          <div className="flex items-center gap-1 shrink-0">
            {(['bar', 'line', 'area', 'pie'] as ChartType[]).map((type) => (
              <Button
                key={type}
                variant={chartType === type ? 'secondary' : 'ghost'}
                size="icon"
                className="size-7"
                onClick={() => setChartType(type)}
              >
                {CHART_ICONS[type]}
              </Button>
            ))}
          </div>
        </div>

        {/* Data info badges */}
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="outline" className="text-[10px] gap-1">
            <Hash className="size-2.5" />
            {data.length} rows
          </Badge>
          <Badge variant="outline" className="text-[10px] gap-1">
            {xDataType === 'date' ? (
              <Calendar className="size-2.5" />
            ) : xDataType === 'number' ? (
              <Hash className="size-2.5" />
            ) : (
              <BarChart3 className="size-2.5" />
            )}
            {xKey}
          </Badge>
          {yKeys.map((key, i) => (
            <Badge
              key={key}
              variant="outline"
              className="text-[10px] gap-1"
              style={{ borderColor: colors[i % colors.length] + '50' }}
            >
              <TrendingUp className="size-2.5" style={{ color: colors[i % colors.length] }} />
              {key}
            </Badge>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="p-4">
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          {chartType === 'bar' && (
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/30" />
              <XAxis
                dataKey={xKey}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatXAxis}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatValue(v, 'number')}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent labelFormatter={(label) => formatValue(label, xDataType)} />
                }
              />
              {yKeys.length > 1 && (
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
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          )}

          {chartType === 'line' && (
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/30" />
              <XAxis
                dataKey={xKey}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatXAxis}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatValue(v, 'number')}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent labelFormatter={(label) => formatValue(label, xDataType)} />
                }
              />
              {yKeys.length > 1 && (
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
                  dot={data.length <= 20}
                />
              ))}
            </LineChart>
          )}

          {chartType === 'area' && (
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                {yKeys.map((key, index) => (
                  <linearGradient key={key} id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors[index % colors.length]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={colors[index % colors.length]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/30" />
              <XAxis
                dataKey={xKey}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatXAxis}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatValue(v, 'number')}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent labelFormatter={(label) => formatValue(label, xDataType)} />
                }
              />
              {yKeys.length > 1 && (
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
                  fill={`url(#gradient-${key})`}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          )}

          {chartType === 'pie' && (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(label) => formatValue(label, xDataType)}
                    />
                  }
                />
                <Pie
                  data={data}
                  dataKey={yKeys[0]}
                  nameKey={xKey}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={40}
                  paddingAngle={2}
                  label={({ name, percent }) =>
                    `${String(name).slice(0, 10)}${String(name).length > 10 ? '...' : ''} (${((percent ?? 0) * 100).toFixed(0)}%)`
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
      </div>

      {/* Stats footer */}
      {stats && chartType !== 'pie' && (
        <div className="px-4 py-2 border-t border-border/30 bg-muted/10">
          <div className="flex items-center justify-between gap-4 text-[10px]">
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">
                Sum:{' '}
                <span className="font-medium text-foreground">
                  {formatValue(stats.sum, 'number')}
                </span>
              </span>
              <span className="text-muted-foreground">
                Avg:{' '}
                <span className="font-medium text-foreground">
                  {formatValue(stats.avg, 'number')}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">
                Min:{' '}
                <span className="font-medium text-foreground">
                  {formatValue(stats.min, 'number')}
                </span>
              </span>
              <span className="text-muted-foreground">
                Max:{' '}
                <span className="font-medium text-foreground">
                  {formatValue(stats.max, 'number')}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Export types for use in other components
export type { ChartData, ChartType }
