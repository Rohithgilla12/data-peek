import { useCallback, useEffect, useMemo } from 'react'
import type { QueryResult as IpcQueryResult } from '@data-peek/shared'
import { useConnectionStore, useTabStore } from '@/stores'
import type { ConnectionWithStatus } from '@/stores/connection-store'
import { isExecutableTab } from '@/stores/tab-store'
import { useWatchStore } from '@/stores/watch-store'
import { gateForWatch } from '@/lib/watch-sql-gate'
import { watchScheduler, type WatchRunner } from '@/lib/watch-scheduler'
import { resolveSelectKeyColumns } from '@/lib/result-key-columns'

/**
 * Watch Mode wiring for a query tab: the runner the scheduler re-invokes on a
 * cadence, plus the toggle handler bound to the native-menu accelerator.
 */
export function useWatchRunner(
  tabId: string,
  tabConnection: ConnectionWithStatus | null | undefined
): { watchRunner: WatchRunner; handleToggleWatch: () => void } {
  // The scheduler holds runnerRef from this object across ticks. We read the
  // latest query/connection from the store at runQuery time so that an
  // in-flight watch never sees stale closures.
  const watchRunner = useMemo<WatchRunner>(
    () => ({
      runQuery: async () => {
        const live = useTabStore.getState().getTab(tabId)
        const liveConn = live?.connectionId
          ? useConnectionStore.getState().connections.find((c) => c.id === live.connectionId)
          : null
        if (!live || !isExecutableTab(live) || !liveConn) {
          return { rows: [], fields: [], durationMs: 0, error: 'No active connection.' }
        }
        const sql = live.query.trim()
        if (!sql) return { rows: [], fields: [], durationMs: 0, error: 'Empty query.' }
        try {
          const response = await window.api.db.query(liveConn, sql)
          if (!response.success || !response.data) {
            return {
              rows: [],
              fields: [],
              durationMs: 0,
              error: response.error ?? 'Query failed.'
            }
          }
          const data = response.data as IpcQueryResult
          return {
            rows: data.rows as Record<string, unknown>[],
            fields: data.fields,
            durationMs: data.durationMs,
            error: null
          }
        } catch (err) {
          return {
            rows: [],
            fields: [],
            durationMs: 0,
            error: err instanceof Error ? err.message : String(err)
          }
        }
      },
      getKeyColumns: () => {
        const live = useTabStore.getState().getTab(tabId)
        if (!live) return undefined
        const allSchemas = useConnectionStore.getState().schemas

        // Table-preview tabs know their table directly.
        if (live.type === 'table-preview') {
          const schemaInfo = allSchemas.find((s) => s.name === live.schemaName)
          const tableInfo = schemaInfo?.tables.find((t) => t.name === live.tableName)
          const pks = tableInfo?.columns.filter((c) => c.isPrimaryKey).map((c) => c.name)
          return pks && pks.length > 0 ? pks : undefined
        }

        // Query tabs: single-table SELECTs resolve their PK from the schema
        // cache (shared with Time Machine capture so both key rows the same
        // way); pickKeyingPlan's heuristic covers everything else.
        if (live.type === 'query' && tabConnection) {
          return resolveSelectKeyColumns(live.query, tabConnection.dbType, allSchemas)
        }
        return undefined
      }
    }),
    [tabId, tabConnection]
  )

  // Cmd+Shift+W is wired via the native menu (see main/menu.ts → 'Toggle
  // Watch Mode'). Menu accelerators win over renderer keybindings on
  // Electron, so we subscribe to the menu IPC here rather than using
  // useHotkeys. Scoped to the currently-mounted query editor so multi-window
  // setups toggle the focused tab.
  const handleToggleWatch = useCallback(() => {
    const t = useTabStore.getState().getTab(tabId)
    if (!t || !isExecutableTab(t) || !tabConnection) return
    const st = useWatchStore.getState()
    if (st.isWatching(tabId)) {
      st.stop(tabId)
      watchScheduler.unregister(tabId)
      return
    }
    const sql = ('query' in t ? t.query : '').trim()
    if (!sql) return
    if (!gateForWatch(sql).ok) return
    st.start(tabId)
    watchScheduler.register(tabId, {
      runQuery: () => watchRunner.runQuery(),
      getKeyColumns: () => watchRunner.getKeyColumns?.()
    })
  }, [tabId, tabConnection, watchRunner])

  useEffect(() => window.api.menu.onToggleWatch(handleToggleWatch), [handleToggleWatch])

  return { watchRunner, handleToggleWatch }
}
