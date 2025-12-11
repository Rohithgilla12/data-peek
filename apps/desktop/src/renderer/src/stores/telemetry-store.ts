import { create } from 'zustand'
import type { QueryTelemetry, BenchmarkResult } from '@data-peek/shared'

/**
 * Percentile options for benchmark display
 */
export type PercentileOption = 'avg' | 'p90' | 'p95' | 'p99'

/**
 * View mode for telemetry visualization
 */
export type TelemetryViewMode = 'bars' | 'timeline'

interface TelemetryState {
  // Current query telemetry (per tab)
  tabTelemetry: Map<string, QueryTelemetry | null>

  // Current benchmark result (per tab)
  tabBenchmark: Map<string, BenchmarkResult | null>

  // UI state (global settings)
  showTelemetryPanel: boolean
  showConnectionOverhead: boolean
  selectedPercentile: PercentileOption
  viewMode: TelemetryViewMode

  // Benchmark running state (per tab)
  benchmarkRunning: Map<string, boolean>

  // Actions
  setTabTelemetry: (tabId: string, telemetry: QueryTelemetry | null) => void
  setTabBenchmark: (tabId: string, benchmark: BenchmarkResult | null) => void
  setShowTelemetryPanel: (show: boolean) => void
  setShowConnectionOverhead: (show: boolean) => void
  setSelectedPercentile: (p: PercentileOption) => void
  setViewMode: (mode: TelemetryViewMode) => void
  setBenchmarkRunning: (tabId: string, running: boolean) => void
  clearTabTelemetry: (tabId: string) => void
  clearAllTelemetry: () => void
}

export const useTelemetryStore = create<TelemetryState>((set) => ({
  tabTelemetry: new Map(),
  tabBenchmark: new Map(),
  showTelemetryPanel: false,
  showConnectionOverhead: true,
  selectedPercentile: 'avg',
  viewMode: 'timeline',
  benchmarkRunning: new Map(),

  setTabTelemetry: (tabId, telemetry) =>
    set((state) => {
      const newMap = new Map(state.tabTelemetry)
      newMap.set(tabId, telemetry)
      return { tabTelemetry: newMap }
    }),

  setTabBenchmark: (tabId, benchmark) =>
    set((state) => {
      const newMap = new Map(state.tabBenchmark)
      newMap.set(tabId, benchmark)
      return { tabBenchmark: newMap }
    }),

  setShowTelemetryPanel: (show) => set({ showTelemetryPanel: show }),

  setShowConnectionOverhead: (show) => set({ showConnectionOverhead: show }),

  setSelectedPercentile: (p) => set({ selectedPercentile: p }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setBenchmarkRunning: (tabId, running) =>
    set((state) => {
      const newMap = new Map(state.benchmarkRunning)
      newMap.set(tabId, running)
      return { benchmarkRunning: newMap }
    }),

  clearTabTelemetry: (tabId) =>
    set((state) => {
      const newTelemetry = new Map(state.tabTelemetry)
      const newBenchmark = new Map(state.tabBenchmark)
      newTelemetry.delete(tabId)
      newBenchmark.delete(tabId)
      return { tabTelemetry: newTelemetry, tabBenchmark: newBenchmark }
    }),

  clearAllTelemetry: () =>
    set({
      tabTelemetry: new Map(),
      tabBenchmark: new Map(),
      benchmarkRunning: new Map()
    })
}))

/**
 * Hook to get telemetry state for a specific tab
 */
export function useTabTelemetry(tabId: string) {
  const telemetry = useTelemetryStore((s) => s.tabTelemetry.get(tabId) ?? null)
  const benchmark = useTelemetryStore((s) => s.tabBenchmark.get(tabId) ?? null)
  const isRunningBenchmark = useTelemetryStore((s) => s.benchmarkRunning.get(tabId) ?? false)
  const showTelemetryPanel = useTelemetryStore((s) => s.showTelemetryPanel)
  const showConnectionOverhead = useTelemetryStore((s) => s.showConnectionOverhead)
  const selectedPercentile = useTelemetryStore((s) => s.selectedPercentile)
  const viewMode = useTelemetryStore((s) => s.viewMode)

  const setTabTelemetry = useTelemetryStore((s) => s.setTabTelemetry)
  const setTabBenchmark = useTelemetryStore((s) => s.setTabBenchmark)
  const setShowTelemetryPanel = useTelemetryStore((s) => s.setShowTelemetryPanel)
  const setShowConnectionOverhead = useTelemetryStore((s) => s.setShowConnectionOverhead)
  const setSelectedPercentile = useTelemetryStore((s) => s.setSelectedPercentile)
  const setViewMode = useTelemetryStore((s) => s.setViewMode)
  const setBenchmarkRunning = useTelemetryStore((s) => s.setBenchmarkRunning)
  const clearTabTelemetry = useTelemetryStore((s) => s.clearTabTelemetry)

  return {
    telemetry,
    benchmark,
    isRunningBenchmark,
    showTelemetryPanel,
    showConnectionOverhead,
    selectedPercentile,
    viewMode,
    setTelemetry: (t: QueryTelemetry | null) => setTabTelemetry(tabId, t),
    setBenchmark: (b: BenchmarkResult | null) => setTabBenchmark(tabId, b),
    setShowTelemetryPanel,
    setShowConnectionOverhead,
    setSelectedPercentile,
    setViewMode,
    setRunningBenchmark: (running: boolean) => setBenchmarkRunning(tabId, running),
    clearTelemetry: () => clearTabTelemetry(tabId)
  }
}
