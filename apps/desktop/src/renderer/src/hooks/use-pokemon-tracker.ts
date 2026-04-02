import { useEffect } from 'react'
import { useTabStore, type Tab } from '@/stores/tab-store'
import { usePokemonBuddyStore } from '@/stores/pokemon-buddy-store'

/**
 * Hook that tracks query results and feeds them into the Pokemon buddy store
 * for fun analytics. Watches tab store for result/error changes.
 */
export function usePokemonTracker() {
  useEffect(() => {
    // Subscribe to tab store changes
    const unsubscribe = useTabStore.subscribe((state, prevState) => {
      const { recordQuerySuccess, recordQueryError } = usePokemonBuddyStore.getState()

      for (const tab of state.tabs) {
        if (tab.type !== 'query' && tab.type !== 'table-preview') continue

        const prevTab = prevState.tabs.find((t: Tab) => t.id === tab.id)
        if (!prevTab) continue

        // Check for new multi-result (multi-statement queries)
        if (
          'multiResult' in tab &&
          tab.multiResult &&
          'multiResult' in prevTab &&
          tab.multiResult !== prevTab.multiResult
        ) {
          const totalRows = tab.multiResult.statements.reduce(
            (sum, s) => sum + (s.rowCount ?? s.rows.length),
            0
          )
          recordQuerySuccess(tab.multiResult.totalDurationMs, totalRows)
          continue
        }

        // Check for new single result
        if ('result' in tab && tab.result && 'result' in prevTab && tab.result !== prevTab.result) {
          recordQuerySuccess(tab.result.durationMs, tab.result.rowCount)
          continue
        }

        // Check for new error
        if ('error' in tab && tab.error && 'error' in prevTab && tab.error !== prevTab.error) {
          recordQueryError()
        }
      }
    })

    return unsubscribe
  }, [])
}
