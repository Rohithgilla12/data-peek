import { cn } from '@/lib/utils'
import type { QueryTelemetry, BenchmarkResult, TimingPhase } from '@data-peek/shared'
import {
  X,
  Activity,
  Zap,
  Database,
  Clock,
  ArrowDownToLine,
  FileCode,
  BarChart3,
  GanttChart
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { TelemetryViewMode } from '@/stores/telemetry-store'

interface TelemetryPanelProps {
  telemetry?: QueryTelemetry | null
  benchmark?: BenchmarkResult | null
  showConnectionOverhead: boolean
  onToggleConnectionOverhead: (show: boolean) => void
  selectedPercentile: 'avg' | 'p90' | 'p95' | 'p99'
  onSelectPercentile: (p: 'avg' | 'p90' | 'p95' | 'p99') => void
  viewMode: TelemetryViewMode
  onViewModeChange: (mode: TelemetryViewMode) => void
  onClose: () => void
}

/**
 * Phase display configuration with icons and distinctive colors
 */
const PHASE_CONFIG: Record<
  string,
  {
    label: string
    shortLabel: string
    color: string
    glowColor: string
    icon: typeof Activity
    description: string
    isConnectionPhase?: boolean
  }
> = {
  tcp_handshake: {
    label: 'TCP Handshake',
    shortLabel: 'TCP',
    color: 'from-violet-500 to-purple-600',
    glowColor: 'shadow-violet-500/30',
    icon: Zap,
    description: 'TCP connection establishment',
    isConnectionPhase: true
  },
  db_handshake: {
    label: 'DB Handshake',
    shortLabel: 'AUTH',
    color: 'from-purple-500 to-fuchsia-600',
    glowColor: 'shadow-purple-500/30',
    icon: Database,
    description: 'Database authentication and protocol handshake',
    isConnectionPhase: true
  },
  network_latency: {
    label: 'Network Latency',
    shortLabel: 'NET',
    color: 'from-blue-500 to-cyan-500',
    glowColor: 'shadow-blue-500/30',
    icon: Activity,
    description: 'Round-trip time to server'
  },
  planning: {
    label: 'Query Planning',
    shortLabel: 'PLAN',
    color: 'from-cyan-500 to-teal-500',
    glowColor: 'shadow-cyan-500/30',
    icon: FileCode,
    description: 'Query plan generation'
  },
  execution: {
    label: 'Execution',
    shortLabel: 'EXEC',
    color: 'from-emerald-500 to-green-500',
    glowColor: 'shadow-emerald-500/30',
    icon: Zap,
    description: 'Server-side query execution'
  },
  download: {
    label: 'Data Transfer',
    shortLabel: 'XFER',
    color: 'from-amber-500 to-orange-500',
    glowColor: 'shadow-amber-500/30',
    icon: ArrowDownToLine,
    description: 'Data transfer from server'
  },
  parse: {
    label: 'Parse & Decode',
    shortLabel: 'PARSE',
    color: 'from-orange-500 to-red-500',
    glowColor: 'shadow-orange-500/30',
    icon: FileCode,
    description: 'Client-side result parsing'
  }
}

const PHASE_ORDER = [
  'tcp_handshake',
  'db_handshake',
  'network_latency',
  'planning',
  'execution',
  'download',
  'parse'
]

/**
 * Format duration for display with smart units
 */
function formatDuration(ms: number): string {
  if (ms < 0.001) return '<1µs'
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(2)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

/**
 * Format bytes for display
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
}

/**
 * Stat badge component for benchmark stats
 */
function StatBadge({
  label,
  value,
  variant = 'default'
}: {
  label: string
  value: string
  variant?: 'default' | 'min' | 'max' | 'highlight'
}) {
  return (
    <div
      className={cn(
        'flex items-baseline gap-1.5 px-2.5 py-1.5 rounded-md',
        'bg-gradient-to-b from-muted/80 to-muted/40',
        'border border-border/50',
        variant === 'min' && 'border-emerald-500/30',
        variant === 'max' && 'border-amber-500/30',
        variant === 'highlight' && 'border-primary/40 bg-primary/5'
      )}
    >
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
        {label}
      </span>
      <span
        className={cn(
          'font-mono text-xs tabular-nums',
          variant === 'min' && 'text-emerald-500',
          variant === 'max' && 'text-amber-500',
          variant === 'highlight' && 'text-primary',
          variant === 'default' && 'text-foreground'
        )}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * Generate time axis markers for the timeline view
 */
function generateTimeMarkers(totalMs: number): { position: number; label: string }[] {
  // Handle edge case of zero or negative duration
  if (totalMs <= 0) {
    return [{ position: 0, label: '0ms' }]
  }

  const markers: { position: number; label: string }[] = []

  // Determine nice intervals based on total duration
  let interval: number
  if (totalMs <= 10) {
    interval = 2
  } else if (totalMs <= 50) {
    interval = 10
  } else if (totalMs <= 100) {
    interval = 20
  } else if (totalMs <= 500) {
    interval = 100
  } else if (totalMs <= 1000) {
    interval = 200
  } else {
    interval = Math.ceil(totalMs / 5 / 100) * 100
  }

  for (let t = 0; t <= totalMs; t += interval) {
    markers.push({
      position: (t / totalMs) * 100,
      label: t < 1000 ? `${t}ms` : `${(t / 1000).toFixed(1)}s`
    })
  }

  // Always add the end marker if not already there
  const lastMarker = markers[markers.length - 1]
  if (lastMarker && Math.abs(lastMarker.position - 100) > 5) {
    markers.push({
      position: 100,
      label: formatDuration(totalMs)
    })
  }

  return markers
}

export function TelemetryPanel({
  telemetry,
  benchmark,
  showConnectionOverhead,
  onToggleConnectionOverhead,
  selectedPercentile,
  onSelectPercentile,
  viewMode,
  onViewModeChange,
  onClose
}: TelemetryPanelProps) {
  if (!telemetry && !benchmark) return null

  const phases = telemetry?.phases ?? benchmark?.telemetryRuns[0]?.phases ?? []

  const visiblePhases = phases.filter((p) => {
    const config = PHASE_CONFIG[p.name]
    if (!config) return false
    if (!showConnectionOverhead && config.isConnectionPhase) return false
    return p.durationMs > 0
  })

  // Sort phases by startOffset for timeline view
  const sortedPhases = [...visiblePhases].sort((a, b) => a.startOffset - b.startOffset)

  const getDisplayValue = (phaseName: string): number => {
    if (benchmark?.phaseStats[phaseName]) {
      return benchmark.phaseStats[phaseName][selectedPercentile]
    }
    const phase = phases.find((p) => p.name === phaseName)
    return phase?.durationMs ?? 0
  }

  // Compute maxDuration from the same source as getDisplayValue to ensure
  // bar widths never exceed 100% in benchmark mode
  const maxDuration = Math.max(...visiblePhases.map((p) => getDisplayValue(p.name)), 0.001)

  const getTotalDuration = (): number => {
    if (benchmark) {
      return benchmark.stats[selectedPercentile]
    }
    return telemetry?.totalDurationMs ?? 0
  }

  const getPhaseForTimeline = (phase: TimingPhase): { start: number; duration: number } => {
    // For benchmark mode, we don't have per-run startOffset, so estimate based on phase order
    if (benchmark) {
      const duration = benchmark.phaseStats[phase.name]?.[selectedPercentile] ?? phase.durationMs
      return { start: phase.startOffset, duration }
    }
    return { start: phase.startOffset, duration: phase.durationMs }
  }

  const totalDuration = getTotalDuration()
  const timeMarkers = generateTimeMarkers(totalDuration)

  const percentiles = ['avg', 'p90', 'p95', 'p99'] as const

  return (
    <div
      className={cn(
        'border-t border-border/60',
        'bg-gradient-to-b from-card/95 to-muted/30',
        'backdrop-blur-sm',
        'animate-in slide-in-from-bottom-2 fade-in duration-200'
      )}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
        <div className="flex items-center gap-4">
          {/* Title with pulse indicator */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Clock className="size-4 text-primary" />
              <span className="absolute -top-0.5 -right-0.5 size-1.5 bg-emerald-500 rounded-full animate-pulse" />
            </div>
            <h3 className="text-sm font-semibold tracking-tight">Query Telemetry</h3>
          </div>

          {/* Quick stats */}
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/50 border border-border/50">
              <span className="text-muted-foreground/70">Total</span>
              <span className="font-mono font-semibold tabular-nums text-primary">
                {formatDuration(getTotalDuration())}
              </span>
            </div>

            {telemetry?.rowCount !== undefined && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-1 bg-emerald-500 rounded-full" />
                <span className="font-mono tabular-nums">
                  {telemetry.rowCount.toLocaleString()}
                </span>
                <span className="text-muted-foreground/60">rows</span>
              </div>
            )}

            {telemetry?.bytesReceived && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-1 bg-blue-500 rounded-full" />
                <span className="font-mono tabular-nums">
                  {formatBytes(telemetry.bytesReceived)}
                </span>
              </div>
            )}

            {benchmark && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="size-1 bg-amber-500 rounded-full" />
                <span className="font-mono tabular-nums">{benchmark.runCount}</span>
                <span className="text-muted-foreground/60">runs</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Percentile selector (benchmark mode) */}
          {benchmark && (
            <div className="flex items-center p-0.5 bg-muted/50 rounded-md border border-border/50">
              {percentiles.map((p) => (
                <button
                  key={p}
                  onClick={() => onSelectPercentile(p)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium rounded transition-all duration-150',
                    selectedPercentile === p
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                  )}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* View mode toggle */}
          <div className="flex items-center p-0.5 bg-muted/50 rounded-md border border-border/50">
            <button
              onClick={() => onViewModeChange('bars')}
              className={cn(
                'p-1.5 rounded transition-all duration-150',
                viewMode === 'bars'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
              )}
              title="Proportional bars"
            >
              <BarChart3 className="size-3.5" />
            </button>
            <button
              onClick={() => onViewModeChange('timeline')}
              className={cn(
                'p-1.5 rounded transition-all duration-150',
                viewMode === 'timeline'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
              )}
              title="Timeline waterfall"
            >
              <GanttChart className="size-3.5" />
            </button>
          </div>

          {/* Connection overhead toggle */}
          <div className="flex items-center gap-2 pl-3 border-l border-border/40">
            <Switch
              id="connection-overhead"
              checked={showConnectionOverhead}
              onCheckedChange={onToggleConnectionOverhead}
              className="scale-90"
            />
            <Label
              htmlFor="connection-overhead"
              className="text-xs text-muted-foreground cursor-pointer select-none"
            >
              Conn. overhead
            </Label>
          </div>

          {/* Close button */}
          <Button
            variant="ghost"
            size="sm"
            className="size-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Phase breakdown - Bars view */}
      {viewMode === 'bars' && (
        <div className="px-4 py-3">
          <div className="grid gap-2">
            {PHASE_ORDER.map((phaseName) => {
              const config = PHASE_CONFIG[phaseName]
              if (!config) return null
              if (!showConnectionOverhead && config.isConnectionPhase) return null

              const duration = getDisplayValue(phaseName)
              if (duration <= 0) return null

              const widthPercent = Math.max((duration / maxDuration) * 100, 2)
              const Icon = config.icon

              return (
                <div key={phaseName} className="group flex items-center gap-3">
                  {/* Phase label with icon */}
                  <div className="w-28 flex items-center gap-2">
                    <Icon
                      className={cn(
                        'size-3.5 text-muted-foreground/60',
                        'group-hover:text-muted-foreground transition-colors'
                      )}
                    />
                    <span
                      className={cn(
                        'text-[11px] font-medium uppercase tracking-wide',
                        'text-muted-foreground/80 group-hover:text-foreground',
                        'transition-colors duration-150'
                      )}
                    >
                      {config.shortLabel}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="flex-1 relative h-6">
                    {/* Track */}
                    <div className="absolute inset-0 bg-muted/50 rounded-sm overflow-hidden">
                      {/* Fill with gradient */}
                      <div
                        className={cn(
                          'h-full rounded-sm',
                          'bg-gradient-to-r',
                          config.color,
                          'transition-all duration-500 ease-out',
                          'group-hover:shadow-lg',
                          config.glowColor
                        )}
                        style={{
                          width: `${widthPercent}%`,
                          boxShadow:
                            widthPercent > 30 ? `inset 0 1px 0 rgba(255,255,255,0.15)` : undefined
                        }}
                      />
                    </div>

                    {/* Inline duration label */}
                    <div
                      className={cn(
                        'absolute inset-y-0 flex items-center',
                        widthPercent > 30 ? 'left-2' : 'right-2'
                      )}
                    >
                      <span
                        className={cn(
                          'font-mono text-[11px] font-medium tabular-nums',
                          widthPercent > 30 ? 'text-white/90 drop-shadow-sm' : 'text-foreground/80'
                        )}
                      >
                        {formatDuration(duration)}
                      </span>
                    </div>

                    {/* Hover tooltip */}
                    <div
                      className={cn(
                        'absolute left-0 top-full mt-1 z-20',
                        'px-2.5 py-1.5 rounded-md',
                        'bg-popover border border-border shadow-lg',
                        'opacity-0 pointer-events-none scale-95',
                        'group-hover:opacity-100 group-hover:scale-100',
                        'transition-all duration-150 origin-top-left'
                      )}
                    >
                      <div className="text-xs font-medium">{config.label}</div>
                      <div className="text-[10px] text-muted-foreground">{config.description}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Phase breakdown - Timeline/Waterfall view */}
      {viewMode === 'timeline' && (
        <div className="px-4 py-3">
          {/* Time axis */}
          <div className="relative h-6 mb-2">
            {/* Axis line */}
            <div className="absolute bottom-0 left-28 right-0 h-px bg-border/60" />

            {/* Time markers */}
            {timeMarkers.map((marker, idx) => (
              <div
                key={idx}
                className="absolute bottom-0 flex flex-col items-center"
                style={{ left: `calc(112px + ${marker.position}% * (100% - 112px) / 100)` }}
              >
                <span className="text-[9px] font-mono text-muted-foreground/60 tabular-nums mb-1">
                  {marker.label}
                </span>
                <div className="w-px h-1.5 bg-border/60" />
              </div>
            ))}
          </div>

          {/* Waterfall phases */}
          <div className="grid gap-1.5">
            {sortedPhases.map((phase) => {
              const config = PHASE_CONFIG[phase.name]
              if (!config) return null

              const { start, duration } = getPhaseForTimeline(phase)
              const startPercent = totalDuration > 0 ? (start / totalDuration) * 100 : 0
              const widthPercent = totalDuration > 0 ? (duration / totalDuration) * 100 : 0
              const Icon = config.icon

              return (
                <div key={phase.name} className="group flex items-center gap-3">
                  {/* Phase label with icon */}
                  <div className="w-28 flex items-center gap-2">
                    <Icon
                      className={cn(
                        'size-3.5 text-muted-foreground/60',
                        'group-hover:text-muted-foreground transition-colors'
                      )}
                    />
                    <span
                      className={cn(
                        'text-[11px] font-medium uppercase tracking-wide',
                        'text-muted-foreground/80 group-hover:text-foreground',
                        'transition-colors duration-150'
                      )}
                    >
                      {config.shortLabel}
                    </span>
                  </div>

                  {/* Timeline track */}
                  <div className="flex-1 relative h-5 overflow-hidden">
                    {/* Background track with grid lines */}
                    <div className="absolute inset-0 bg-muted/30 rounded-sm overflow-hidden">
                      {/* Subtle vertical grid lines */}
                      {timeMarkers.map((marker, idx) => (
                        <div
                          key={idx}
                          className="absolute top-0 bottom-0 w-px bg-border/20"
                          style={{ left: `${marker.position}%` }}
                        />
                      ))}
                    </div>

                    {/* Phase bar positioned on timeline */}
                    <div
                      className={cn(
                        'absolute top-0.5 bottom-0.5 rounded-sm',
                        'bg-gradient-to-r',
                        config.color,
                        'transition-all duration-300 ease-out',
                        'group-hover:shadow-md',
                        config.glowColor,
                        'min-w-[4px]'
                      )}
                      style={{
                        left: `${Math.min(startPercent, 100)}%`,
                        width: `${Math.min(Math.max(widthPercent, 0.5), 100 - startPercent)}%`
                      }}
                    >
                      {/* Duration label inside bar if wide enough */}
                      {widthPercent > 8 && (
                        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                          <span className="font-mono text-[10px] font-medium text-white/90 drop-shadow-sm tabular-nums">
                            {formatDuration(duration)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Duration label outside bar if too narrow */}
                    {widthPercent <= 8 && startPercent + widthPercent < 85 && (
                      <div
                        className="absolute top-0 bottom-0 flex items-center pl-1"
                        style={{ left: `${startPercent + widthPercent}%` }}
                      >
                        <span className="font-mono text-[10px] font-medium text-foreground/70 tabular-nums whitespace-nowrap">
                          {formatDuration(duration)}
                        </span>
                      </div>
                    )}

                    {/* Hover tooltip */}
                    <div
                      className={cn(
                        'absolute z-20',
                        'px-2.5 py-1.5 rounded-md',
                        'bg-popover border border-border shadow-lg',
                        'opacity-0 pointer-events-none scale-95',
                        'group-hover:opacity-100 group-hover:scale-100',
                        'transition-all duration-150 origin-top-left',
                        'top-full mt-1'
                      )}
                      style={{ left: `${startPercent}%` }}
                    >
                      <div className="text-xs font-medium">{config.label}</div>
                      <div className="text-[10px] text-muted-foreground">{config.description}</div>
                      <div className="text-[10px] text-muted-foreground/70 mt-1 font-mono">
                        {formatDuration(start)} → {formatDuration(start + duration)}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Benchmark statistics footer */}
      {benchmark && (
        <div className="px-4 py-2.5 border-t border-border/40 bg-muted/20">
          <div className="flex items-center gap-2 flex-wrap">
            <StatBadge label="Min" value={formatDuration(benchmark.stats.min)} variant="min" />
            <StatBadge label="Max" value={formatDuration(benchmark.stats.max)} variant="max" />
            <StatBadge label="Avg" value={formatDuration(benchmark.stats.avg)} />
            <StatBadge label="P90" value={formatDuration(benchmark.stats.p90)} />
            <StatBadge label="P95" value={formatDuration(benchmark.stats.p95)} />
            <StatBadge
              label="P99"
              value={formatDuration(benchmark.stats.p99)}
              variant="highlight"
            />
            <div className="flex-1" />
            <StatBadge label="σ" value={formatDuration(benchmark.stats.stdDev)} />
          </div>
        </div>
      )}

      {/* Connection status */}
      {telemetry?.connectionReused !== undefined && (
        <div className="px-4 py-1.5 border-t border-border/30 bg-muted/10">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
            <span
              className={cn(
                'size-1.5 rounded-full',
                telemetry.connectionReused ? 'bg-emerald-500/80' : 'bg-amber-500/80'
              )}
            />
            <span>{telemetry.connectionReused ? 'Connection pooled' : 'New connection'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
