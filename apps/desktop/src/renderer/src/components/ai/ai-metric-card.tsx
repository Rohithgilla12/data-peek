'use client'

import { TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type MetricFormat = 'number' | 'currency' | 'percent' | 'duration'
type TrendDirection = 'up' | 'down' | 'neutral'

interface MetricData {
  label: string
  value: number | string | null
  format?: MetricFormat
  trend?: {
    direction: TrendDirection
    value: string
  }
  isLoading?: boolean
  error?: string | null
}

interface AIMetricCardProps {
  metric: MetricData
  className?: string
}

// Format value based on type
function formatMetricValue(value: number | string | null, format: MetricFormat): string {
  if (value === null || value === undefined) return 'N/A'

  const numValue = typeof value === 'string' ? parseFloat(value) : value

  if (isNaN(numValue)) return String(value)

  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(numValue)

    case 'percent':
      return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      }).format(numValue / 100)

    case 'duration':
      // Format as hours/minutes/seconds
      if (numValue < 60) return `${numValue.toFixed(1)}s`
      if (numValue < 3600) return `${(numValue / 60).toFixed(1)}m`
      return `${(numValue / 3600).toFixed(1)}h`

    case 'number':
    default:
      // Use compact notation for large numbers
      if (Math.abs(numValue) >= 1000000) {
        return new Intl.NumberFormat('en-US', {
          notation: 'compact',
          compactDisplay: 'short',
          maximumFractionDigits: 1
        }).format(numValue)
      }
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2
      }).format(numValue)
  }
}

// Trend icon component
function TrendIcon({ direction }: { direction: TrendDirection }) {
  switch (direction) {
    case 'up':
      return <TrendingUp className="size-3.5" />
    case 'down':
      return <TrendingDown className="size-3.5" />
    default:
      return <Minus className="size-3.5" />
  }
}

// Trend color classes
function getTrendColorClass(direction: TrendDirection): string {
  switch (direction) {
    case 'up':
      return 'text-green-500'
    case 'down':
      return 'text-red-500'
    default:
      return 'text-muted-foreground'
  }
}

export function AIMetricCard({ metric, className }: AIMetricCardProps) {
  const { label, value, format = 'number', trend, isLoading, error } = metric

  return (
    <div
      className={cn(
        'relative rounded-xl border border-border/50 bg-gradient-to-br from-background to-muted/20 p-4 overflow-hidden',
        className
      )}
    >
      {/* Decorative gradient */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-2xl -translate-y-8 translate-x-8" />

      <div className="relative">
        {/* Label */}
        <p className="text-xs text-muted-foreground font-medium mb-1">{label}</p>

        {/* Value */}
        {isLoading ? (
          <div className="flex items-center gap-2 h-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        ) : error ? (
          <div className="h-10 flex items-center">
            <span className="text-sm text-red-400">{error}</span>
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight">
              {formatMetricValue(value, format)}
            </span>
          </div>
        )}

        {/* Trend */}
        {trend && !isLoading && !error && (
          <div className={cn('flex items-center gap-1 mt-2', getTrendColorClass(trend.direction))}>
            <TrendIcon direction={trend.direction} />
            <span className="text-xs font-medium">{trend.value}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Grid component for multiple metrics
interface AIMetricGridProps {
  metrics: MetricData[]
  className?: string
}

export function AIMetricGrid({ metrics, className }: AIMetricGridProps) {
  if (metrics.length === 0) return null

  const gridCols =
    metrics.length === 1
      ? 'grid-cols-1'
      : metrics.length === 2
        ? 'grid-cols-2'
        : metrics.length === 3
          ? 'grid-cols-3'
          : 'grid-cols-2 md:grid-cols-4'

  return (
    <div className={cn('grid gap-3', gridCols, className)}>
      {metrics.map((metric, index) => (
        <AIMetricCard key={`${metric.label}-${index}`} metric={metric} />
      ))}
    </div>
  )
}

export type { MetricData, MetricFormat, TrendDirection }
