import type {
  QueryTelemetry,
  TimingPhase,
  BenchmarkResult,
  TelemetryStats,
  PhaseStats
} from '@shared/index'
import { performance } from 'perf_hooks'

/**
 * Internal context for tracking telemetry during query execution
 */
interface TelemetryContext {
  executionId: string
  startTime: number
  phases: Map<string, { start: number; end?: number }>
  connectionReused: boolean
}

/**
 * Phase names used for telemetry collection
 */
export const TELEMETRY_PHASES = {
  TCP_HANDSHAKE: 'tcp_handshake',
  DB_HANDSHAKE: 'db_handshake',
  NETWORK_LATENCY: 'network_latency',
  PLANNING: 'planning',
  EXECUTION: 'execution',
  DOWNLOAD: 'download',
  PARSE: 'parse'
} as const

export type TelemetryPhaseName = (typeof TELEMETRY_PHASES)[keyof typeof TELEMETRY_PHASES]

/**
 * Collects and aggregates query telemetry data
 */
class TelemetryCollector {
  private contexts: Map<string, TelemetryContext> = new Map()

  /**
   * Start tracking telemetry for a new query execution
   */
  startQuery(executionId: string, connectionReused: boolean = false): void {
    this.contexts.set(executionId, {
      executionId,
      startTime: performance.now(),
      phases: new Map(),
      connectionReused
    })
  }

  /**
   * Start timing a specific phase
   */
  startPhase(executionId: string, phaseName: TelemetryPhaseName): void {
    const ctx = this.contexts.get(executionId)
    if (!ctx) return
    ctx.phases.set(phaseName, { start: performance.now() })
  }

  /**
   * End timing a specific phase
   */
  endPhase(executionId: string, phaseName: TelemetryPhaseName): void {
    const ctx = this.contexts.get(executionId)
    if (!ctx) return
    const phase = ctx.phases.get(phaseName)
    if (phase && !phase.end) {
      phase.end = performance.now()
    }
  }

  /**
   * Record a phase with explicit duration (useful when timing is external)
   */
  recordPhase(executionId: string, phaseName: TelemetryPhaseName, durationMs: number): void {
    const ctx = this.contexts.get(executionId)
    if (!ctx) return
    const now = performance.now()
    ctx.phases.set(phaseName, { start: now - durationMs, end: now })
  }

  /**
   * Check if telemetry collection is active for an execution
   */
  isActive(executionId: string): boolean {
    return this.contexts.has(executionId)
  }

  /**
   * Finalize telemetry collection and return results
   */
  finalize(executionId: string, rowCount: number, bytesReceived?: number): QueryTelemetry {
    const ctx = this.contexts.get(executionId)
    if (!ctx) {
      throw new Error(`No telemetry context for ${executionId}`)
    }

    const endTime = performance.now()
    const phases: TimingPhase[] = []

    // Convert phase timings to TimingPhase array
    for (const [name, timing] of ctx.phases) {
      if (timing.end) {
        phases.push({
          name,
          durationMs: timing.end - timing.start,
          startOffset: timing.start - ctx.startTime
        })
      }
    }

    // Sort phases by start offset
    phases.sort((a, b) => a.startOffset - b.startOffset)

    // Helper to get phase duration by name
    const getPhaseMs = (name: string): number | undefined => {
      const phase = phases.find((p) => p.name === name)
      return phase?.durationMs
    }

    const telemetry: QueryTelemetry = {
      executionId,
      totalDurationMs: endTime - ctx.startTime,
      phases,
      tcpHandshakeMs: getPhaseMs(TELEMETRY_PHASES.TCP_HANDSHAKE),
      dbHandshakeMs: getPhaseMs(TELEMETRY_PHASES.DB_HANDSHAKE),
      networkLatencyMs: getPhaseMs(TELEMETRY_PHASES.NETWORK_LATENCY),
      planningMs: getPhaseMs(TELEMETRY_PHASES.PLANNING),
      executionMs: getPhaseMs(TELEMETRY_PHASES.EXECUTION),
      downloadMs: getPhaseMs(TELEMETRY_PHASES.DOWNLOAD),
      parseMs: getPhaseMs(TELEMETRY_PHASES.PARSE),
      connectionReused: ctx.connectionReused,
      rowCount,
      bytesReceived,
      timestamp: Date.now()
    }

    // Cleanup context
    this.contexts.delete(executionId)

    return telemetry
  }

  /**
   * Cancel telemetry collection without finalizing
   */
  cancel(executionId: string): void {
    this.contexts.delete(executionId)
  }

  /**
   * Calculate percentile from a sorted array
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0
    if (sorted.length === 1) return sorted[0]
    const idx = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]
  }

  /**
   * Calculate standard deviation
   */
  private stdDev(values: number[], mean: number): number {
    if (values.length === 0) return 0
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length
    return Math.sqrt(variance)
  }

  /**
   * Aggregate multiple telemetry runs into benchmark results
   */
  aggregateBenchmark(runs: QueryTelemetry[]): BenchmarkResult {
    if (runs.length === 0) {
      throw new Error('Cannot aggregate empty benchmark runs')
    }

    // Calculate total duration stats
    const durations = runs.map((r) => r.totalDurationMs).sort((a, b) => a - b)
    const sum = durations.reduce((a, b) => a + b, 0)
    const avg = sum / durations.length

    const stats: TelemetryStats = {
      avg,
      min: durations[0],
      max: durations[durations.length - 1],
      p90: this.percentile(durations, 90),
      p95: this.percentile(durations, 95),
      p99: this.percentile(durations, 99),
      stdDev: this.stdDev(durations, avg)
    }

    // Calculate per-phase statistics
    const phaseNames = Object.values(TELEMETRY_PHASES)
    const phaseStats: Record<string, PhaseStats> = {}

    for (const name of phaseNames) {
      const phaseDurations = runs
        .map((r) => r.phases.find((p) => p.name === name)?.durationMs ?? 0)
        .filter((d) => d > 0)
        .sort((a, b) => a - b)

      if (phaseDurations.length > 0) {
        const phaseAvg = phaseDurations.reduce((a, b) => a + b, 0) / phaseDurations.length
        phaseStats[name] = {
          avg: phaseAvg,
          p90: this.percentile(phaseDurations, 90),
          p95: this.percentile(phaseDurations, 95),
          p99: this.percentile(phaseDurations, 99)
        }
      }
    }

    return {
      runCount: runs.length,
      telemetryRuns: runs,
      stats,
      phaseStats
    }
  }
}

// Export singleton instance
export const telemetryCollector = new TelemetryCollector()
