import { useCallback, useState } from 'react'
import { useExecutionPlanResize } from '@/hooks/use-execution-plan-resize'
import { useQueryStore, useTabTelemetry, useTabPerfIndicator, notify } from '@/stores'
import type { ConnectionWithStatus } from '@/stores/connection-store'
import { isExecutableTab, type Tab } from '@/stores/tab-store'

interface ExecutionPlanState {
  plan: unknown[]
  durationMs: number
}

/**
 * Query analysis tooling for a tab: telemetry panel state, benchmark runs,
 * EXPLAIN execution plans (with panel resize), and the performance analyzer.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useQueryAnalysis(
  tabId: string,
  tab: Tab | undefined,
  tabConnection: ConnectionWithStatus | null | undefined,
  updateTabResult: (tabId: string, result: null, error: string | null) => void
) {
  const telemetryState = useTabTelemetry(tabId)
  const {
    isRunningBenchmark,
    setTelemetry,
    setBenchmark,
    setShowTelemetryPanel,
    setRunningBenchmark
  } = telemetryState

  const perfState = useTabPerfIndicator(tabId)
  const {
    isAnalyzing: isPerfAnalyzing,
    setAnalysis: setPerfAnalysis,
    setShowPerfPanel,
    setAnalyzing: setPerfAnalyzing
  } = perfState

  // Execution plan state (resize logic extracted to hook)
  const [executionPlan, setExecutionPlan] = useState<ExecutionPlanState | null>(null)
  const [isExplaining, setIsExplaining] = useState(false)
  const { executionPlanWidth, startResizing } = useExecutionPlanResize()

  const handleBenchmark = useCallback(
    async (runCount: number) => {
      if (
        !tab ||
        !isExecutableTab(tab) ||
        !tabConnection ||
        tab.isExecuting ||
        isRunningBenchmark ||
        !tab.query.trim()
      ) {
        return
      }

      setRunningBenchmark(true)
      // Clear previous telemetry and show panel
      setTelemetry(null)
      setBenchmark(null)
      setShowTelemetryPanel(true)

      try {
        const response = await window.api.db.benchmark(tabConnection, tab.query, runCount)

        if (response.success && response.data) {
          setBenchmark(response.data)
          // Also set the first run's telemetry for display
          if (response.data.telemetryRuns.length > 0) {
            setTelemetry(response.data.telemetryRuns[0])
          }
        } else {
          notify.error('Benchmark failed', response.error || 'An unexpected error occurred')
        }
      } catch (error) {
        notify.error(
          'Benchmark failed',
          error instanceof Error ? error.message : 'An unexpected error occurred'
        )
      } finally {
        setRunningBenchmark(false)
      }
    },
    [
      tab,
      tabConnection,
      isRunningBenchmark,
      setRunningBenchmark,
      setTelemetry,
      setBenchmark,
      setShowTelemetryPanel
    ]
  )

  const handleExplainQuery = useCallback(async () => {
    if (!tab || !isExecutableTab(tab) || !tabConnection || isExplaining || !tab.query.trim()) {
      return
    }

    setIsExplaining(true)
    setExecutionPlan(null)

    try {
      const response = await window.api.db.explain(tabConnection, tab.query, true)

      if (response.success && response.data) {
        setExecutionPlan({
          plan: response.data.plan as unknown[],
          durationMs: response.data.durationMs
        })
      } else {
        // Show error in the existing error display
        updateTabResult(tabId, null, response.error ?? 'Failed to get execution plan')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      updateTabResult(tabId, null, errorMessage)
    } finally {
      setIsExplaining(false)
    }
  }, [tab, tabConnection, tabId, isExplaining, updateTabResult])

  // Get query history for performance analysis
  const queryHistory = useQueryStore((s) => s.history)

  const handleAnalyzePerformance = useCallback(async () => {
    if (!tab || !isExecutableTab(tab) || !tabConnection || isPerfAnalyzing || !tab.query.trim()) {
      return
    }

    // Only support PostgreSQL for now
    if (tabConnection.dbType && tabConnection.dbType !== 'postgresql') {
      notify.info(
        'Not Supported',
        'Performance analysis is currently only available for PostgreSQL databases.'
      )
      return
    }

    setPerfAnalyzing(true)

    try {
      // Convert query history to the format expected by the API
      const historyForAnalysis = queryHistory
        .filter((h) => h.connectionId === tabConnection.id)
        .slice(0, 50)
        .map((h) => ({
          query: h.query,
          timestamp: h.timestamp instanceof Date ? h.timestamp.getTime() : h.timestamp,
          connectionId: h.connectionId
        }))

      const response = await window.api.db.analyzePerformance(
        tabConnection,
        tab.query,
        historyForAnalysis
      )

      if (response.success && response.data) {
        setPerfAnalysis(response.data)
        setShowPerfPanel(true)
      } else {
        notify.error('Analysis Failed', response.error ?? 'Failed to analyze query performance')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      notify.error('Analysis Error', errorMessage)
    } finally {
      setPerfAnalyzing(false)
    }
  }, [
    tab,
    tabConnection,
    isPerfAnalyzing,
    queryHistory,
    setPerfAnalyzing,
    setPerfAnalysis,
    setShowPerfPanel
  ])

  return {
    ...telemetryState,
    perf: perfState,
    executionPlan,
    setExecutionPlan,
    isExplaining,
    executionPlanWidth,
    startResizing,
    handleBenchmark,
    handleExplainQuery,
    handleAnalyzePerformance
  }
}
