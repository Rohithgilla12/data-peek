import { X, BarChart2 } from 'lucide-react'
import type { ColumnStats, HistogramBucket, CommonValue } from '@shared/index'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

interface StatRowProps {
  label: string
  value: string | number | null | undefined
}

function StatRow({ label, value }: StatRowProps) {
  if (value === null || value === undefined) return null
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-mono font-medium">{String(value)}</span>
    </div>
  )
}

function formatNumber(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined) return 'N/A'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  })
}

function formatPercentage(n: number): string {
  return `${n.toFixed(1)}%`
}

interface HistogramProps {
  buckets: HistogramBucket[]
}

function Histogram({ buckets }: HistogramProps) {
  const maxCount = Math.max(...buckets.map((b) => b.count), 1)
  return (
    <div className="space-y-1">
      {buckets.map((bucket, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-20 text-right shrink-0">
            <span className="text-[10px] text-muted-foreground font-mono">
              {formatNumber(bucket.min, 0)}
            </span>
          </div>
          <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
            <div
              className="h-full bg-primary/60 rounded-sm transition-all"
              style={{ width: `${(bucket.count / maxCount) * 100}%` }}
            />
          </div>
          <div className="w-12 shrink-0">
            <span className="text-[10px] text-muted-foreground font-mono">
              {formatNumber(bucket.count, 0)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

interface CommonValuesProps {
  values: CommonValue[]
  totalRows: number
}

function CommonValuesList({ values }: CommonValuesProps) {
  const maxCount = Math.max(...values.map((v) => v.count), 1)
  return (
    <div className="space-y-1.5">
      {values.map((item, i) => (
        <div key={i} className="space-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono truncate max-w-[160px]">
              {item.value === null ? (
                <span className="text-muted-foreground italic">NULL</span>
              ) : (
                item.value
              )}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {formatNumber(item.count, 0)} ({formatPercentage(item.percentage)})
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary/50 rounded-full"
              style={{ width: `${(item.count / maxCount) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

interface BooleanBarProps {
  trueCount: number
  falseCount: number
  nullCount: number
}

function BooleanBar({ trueCount, falseCount, nullCount }: BooleanBarProps) {
  const total = trueCount + falseCount + nullCount
  if (total === 0) return null

  const truePct = (trueCount / total) * 100
  const falsePct = (falseCount / total) * 100
  const nullPct = (nullCount / total) * 100

  return (
    <div className="space-y-2">
      <div className="flex h-6 rounded overflow-hidden gap-0.5">
        {truePct > 0 && (
          <div
            className="bg-green-500/70 flex items-center justify-center"
            style={{ width: `${truePct}%` }}
            title={`true: ${trueCount}`}
          />
        )}
        {falsePct > 0 && (
          <div
            className="bg-red-500/70 flex items-center justify-center"
            style={{ width: `${falsePct}%` }}
            title={`false: ${falseCount}`}
          />
        )}
        {nullPct > 0 && (
          <div
            className="bg-muted-foreground/30 flex items-center justify-center"
            style={{ width: `${nullPct}%` }}
            title={`null: ${nullCount}`}
          />
        )}
      </div>
      <div className="flex gap-3 text-xs">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-green-500/70 inline-block" />
          true: {formatNumber(trueCount, 0)} ({formatPercentage(truePct)})
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-red-500/70 inline-block" />
          false: {formatNumber(falseCount, 0)} ({formatPercentage(falsePct)})
        </span>
        {nullCount > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-muted-foreground/30 inline-block" />
            null: {formatNumber(nullCount, 0)} ({formatPercentage(nullPct)})
          </span>
        )}
      </div>
    </div>
  )
}

interface ColumnStatsPanelProps {
  stats: ColumnStats | null
  isLoading: boolean
  error: string | null
  onClose: () => void
}

export function ColumnStatsPanel({ stats, isLoading, error, onClose }: ColumnStatsPanelProps) {
  return (
    <div className="flex flex-col h-full border-l border-border/50 bg-background w-72 shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <BarChart2 className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Column Stats</span>
        </div>
        <Button variant="ghost" size="icon" className="size-6" onClick={onClose}>
          <X className="size-3" />
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-3">
          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {error && !isLoading && (
            <div className="text-xs text-destructive bg-destructive/10 rounded p-2">{error}</div>
          )}

          {stats && !isLoading && (
            <>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium font-mono">{stats.column}</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
                    {stats.dataType}
                  </Badge>
                </div>
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                  {stats.statsType}
                </Badge>
              </div>

              <Separator />

              <div className="space-y-0.5">
                <StatRow label="Total rows" value={formatNumber(stats.totalRows, 0)} />
                <StatRow
                  label="Null"
                  value={`${formatNumber(stats.nullCount, 0)} (${formatPercentage(stats.nullPercentage)})`}
                />
                <StatRow
                  label="Distinct"
                  value={`${formatNumber(stats.distinctCount, 0)} (${formatPercentage(stats.distinctPercentage)})`}
                />
              </div>

              {stats.statsType === 'numeric' && (
                <>
                  <Separator />
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium pb-0.5">
                      Numeric
                    </p>
                    <StatRow label="Min" value={stats.min != null ? String(stats.min) : null} />
                    <StatRow label="Max" value={stats.max != null ? String(stats.max) : null} />
                    <StatRow
                      label="Avg"
                      value={stats.avg != null ? formatNumber(stats.avg) : null}
                    />
                    <StatRow
                      label="Median"
                      value={stats.median != null ? formatNumber(stats.median) : null}
                    />
                    <StatRow
                      label="Std Dev"
                      value={stats.stdDev != null ? formatNumber(stats.stdDev) : null}
                    />
                  </div>
                  {stats.histogram && stats.histogram.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
                          Distribution
                        </p>
                        <Histogram buckets={stats.histogram} />
                      </div>
                    </>
                  )}
                </>
              )}

              {stats.statsType === 'text' && (
                <>
                  <Separator />
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium pb-0.5">
                      Length
                    </p>
                    <StatRow
                      label="Min length"
                      value={stats.minLength != null ? formatNumber(stats.minLength, 0) : null}
                    />
                    <StatRow
                      label="Max length"
                      value={stats.maxLength != null ? formatNumber(stats.maxLength, 0) : null}
                    />
                    <StatRow
                      label="Avg length"
                      value={stats.avgLength != null ? formatNumber(stats.avgLength) : null}
                    />
                  </div>
                  {stats.commonValues && stats.commonValues.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
                          Top values
                        </p>
                        <CommonValuesList values={stats.commonValues} totalRows={stats.totalRows} />
                      </div>
                    </>
                  )}
                </>
              )}

              {stats.statsType === 'datetime' && (
                <>
                  <Separator />
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium pb-0.5">
                      Range
                    </p>
                    <StatRow label="Min" value={stats.min != null ? String(stats.min) : null} />
                    <StatRow label="Max" value={stats.max != null ? String(stats.max) : null} />
                  </div>
                </>
              )}

              {stats.statsType === 'boolean' && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
                      Distribution
                    </p>
                    <BooleanBar
                      trueCount={stats.trueCount ?? 0}
                      falseCount={stats.falseCount ?? 0}
                      nullCount={stats.nullCount}
                    />
                  </div>
                </>
              )}

              {stats.statsType === 'other' && (
                <>
                  <Separator />
                  <p className="text-xs text-muted-foreground">
                    Detailed statistics are not available for this column type.
                  </p>
                </>
              )}
            </>
          )}

          {!stats && !isLoading && !error && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Select a column to view statistics
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
