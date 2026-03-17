import { create } from 'zustand'
import type { PerformanceAnalysisResult } from '@shared/index'

interface PerfIndicatorState {
  // Per-tab analysis results
  tabAnalysis: Map<string, PerformanceAnalysisResult | null>

  // UI state
  showPerfPanel: boolean

  // Per-tab analyzing state
  analyzingTabs: Map<string, boolean>

  // Selected issue for expanded view
  selectedIssueId: string | null

  // Severity filters
  showCritical: boolean
  showWarning: boolean
  showInfo: boolean

  // Actions
  setTabAnalysis: (tabId: string, result: PerformanceAnalysisResult | null) => void
  setShowPerfPanel: (show: boolean) => void
  setAnalyzing: (tabId: string, analyzing: boolean) => void
  setSelectedIssue: (issueId: string | null) => void
  toggleSeverityFilter: (severity: 'critical' | 'warning' | 'info') => void
  clearTabAnalysis: (tabId: string) => void
  clearAllAnalysis: () => void
}

export const usePerfIndicatorStore = create<PerfIndicatorState>((set) => ({
  tabAnalysis: new Map(),
  showPerfPanel: false,
  analyzingTabs: new Map(),
  selectedIssueId: null,
  showCritical: true,
  showWarning: true,
  showInfo: true,

  setTabAnalysis: (tabId, result) =>
    set((state) => {
      const newMap = new Map(state.tabAnalysis)
      newMap.set(tabId, result)
      return { tabAnalysis: newMap }
    }),

  setShowPerfPanel: (show) => set({ showPerfPanel: show }),

  setAnalyzing: (tabId, analyzing) =>
    set((state) => {
      const newMap = new Map(state.analyzingTabs)
      newMap.set(tabId, analyzing)
      return { analyzingTabs: newMap }
    }),

  setSelectedIssue: (issueId) => set({ selectedIssueId: issueId }),

  toggleSeverityFilter: (severity) =>
    set((state) => {
      switch (severity) {
        case 'critical':
          return { showCritical: !state.showCritical }
        case 'warning':
          return { showWarning: !state.showWarning }
        case 'info':
          return { showInfo: !state.showInfo }
      }
    }),

  clearTabAnalysis: (tabId) =>
    set((state) => {
      const newAnalysis = new Map(state.tabAnalysis)
      const newAnalyzing = new Map(state.analyzingTabs)
      newAnalysis.delete(tabId)
      newAnalyzing.delete(tabId)
      return { tabAnalysis: newAnalysis, analyzingTabs: newAnalyzing }
    }),

  clearAllAnalysis: () =>
    set({
      tabAnalysis: new Map(),
      analyzingTabs: new Map(),
      selectedIssueId: null
    })
}))

/**
 * Hook to get performance analysis state for a specific tab
 */
export function useTabPerfIndicator(tabId: string) {
  const analysis = usePerfIndicatorStore((s) => s.tabAnalysis.get(tabId) ?? null)
  const isAnalyzing = usePerfIndicatorStore((s) => s.analyzingTabs.get(tabId) ?? false)
  const showPerfPanel = usePerfIndicatorStore((s) => s.showPerfPanel)
  const selectedIssueId = usePerfIndicatorStore((s) => s.selectedIssueId)
  const showCritical = usePerfIndicatorStore((s) => s.showCritical)
  const showWarning = usePerfIndicatorStore((s) => s.showWarning)
  const showInfo = usePerfIndicatorStore((s) => s.showInfo)

  const setTabAnalysis = usePerfIndicatorStore((s) => s.setTabAnalysis)
  const setShowPerfPanel = usePerfIndicatorStore((s) => s.setShowPerfPanel)
  const setAnalyzing = usePerfIndicatorStore((s) => s.setAnalyzing)
  const setSelectedIssue = usePerfIndicatorStore((s) => s.setSelectedIssue)
  const toggleSeverityFilter = usePerfIndicatorStore((s) => s.toggleSeverityFilter)
  const clearTabAnalysis = usePerfIndicatorStore((s) => s.clearTabAnalysis)

  return {
    analysis,
    isAnalyzing,
    showPerfPanel,
    selectedIssueId,
    showCritical,
    showWarning,
    showInfo,
    setAnalysis: (result: PerformanceAnalysisResult | null) => setTabAnalysis(tabId, result),
    setShowPerfPanel,
    setAnalyzing: (analyzing: boolean) => setAnalyzing(tabId, analyzing),
    setSelectedIssue,
    toggleSeverityFilter,
    clearAnalysis: () => clearTabAnalysis(tabId)
  }
}
