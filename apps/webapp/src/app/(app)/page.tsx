'use client'

import { useCallback, useEffect } from 'react'
import { trpc } from '@/lib/trpc-client'
import { useConnectionStore } from '@/stores/connection-store'
import { useQueryStore } from '@/stores/query-store'
import { SqlEditor } from '@/components/query/sql-editor'
import { QueryToolbar } from '@/components/query/query-toolbar'
import { ResultsTable } from '@/components/query/results-table'
import { ResultsStatus } from '@/components/query/results-status'
import { TabContainer } from '@/components/query/tab-container'

export default function QueryPage() {
  const { activeConnectionId } = useConnectionStore()
  const { tabs, activeTabId, updateSql, setResults, setError, setExecuting } = useQueryStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  const executeMutation = trpc.queries.execute.useMutation()
  const explainMutation = trpc.queries.explain.useMutation()

  const executeQuery = useCallback((sql: string) => {
    if (!activeConnectionId || !sql.trim()) return

    setExecuting(activeTabId, true)
    setError(activeTabId, null)

    executeMutation.mutate(
      { connectionId: activeConnectionId, sql },
      {
        onSuccess: (result) => {
          setResults(activeTabId, result)
          setExecuting(activeTabId, false)
        },
        onError: (error) => {
          setError(activeTabId, error.message)
          setExecuting(activeTabId, false)
        },
      }
    )
  }, [activeConnectionId, activeTabId, executeMutation, setResults, setError, setExecuting])

  const handleExecute = useCallback(() => {
    if (!activeTab?.sql.trim()) return
    executeQuery(activeTab.sql)
  }, [activeTab, executeQuery])

  useEffect(() => {
    function onExecuteEvent() {
      const store = useQueryStore.getState()
      const tab = store.tabs.find((t) => t.id === store.activeTabId)
      if (tab?.sql.trim()) executeQuery(tab.sql)
    }
    window.addEventListener('datapeek:execute', onExecuteEvent)
    return () => window.removeEventListener('datapeek:execute', onExecuteEvent)
  }, [executeQuery])

  const handleExplain = useCallback(() => {
    if (!activeConnectionId || !activeTab?.sql.trim()) return

    setExecuting(activeTabId, true)
    setError(activeTabId, null)

    explainMutation.mutate(
      { connectionId: activeConnectionId, sql: activeTab.sql, analyze: false },
      {
        onSuccess: (result) => {
          setResults(activeTabId, {
            rows: Array.isArray(result.plan) ? result.plan : [result.plan],
            fields: [{ name: 'QUERY PLAN', dataType: 'json' }],
            rowCount: 1,
            durationMs: result.durationMs,
          })
          setExecuting(activeTabId, false)
        },
        onError: (error) => {
          setError(activeTabId, error.message)
          setExecuting(activeTabId, false)
        },
      }
    )
  }, [activeConnectionId, activeTab, activeTabId, explainMutation, setResults, setError, setExecuting])

  if (!activeConnectionId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 animate-fade-in">
        <div className="h-3 w-3 rounded-full bg-accent/30 animate-pulse-glow mb-2" />
        <p className="text-sm">Select a connection from the sidebar to start querying</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <TabContainer />

      {/* Editor section */}
      <div className="flex flex-col border-b border-border" style={{ height: '45%' }}>
        <div className="flex-1 min-h-0">
          <SqlEditor
            value={activeTab?.sql ?? ''}
            onChange={(sql) => updateSql(activeTabId, sql)}
            onExecute={handleExecute}
          />
        </div>
        {/* Toolbar BELOW editor — matches desktop layout */}
        <QueryToolbar
          onExecute={handleExecute}
          onExplain={handleExplain}
          isExecuting={activeTab?.isExecuting ?? false}
        />
      </div>

      {/* Results section */}
      <div className="flex flex-col flex-1 min-h-0">
        {activeTab?.results ? (
          <ResultsTable rows={activeTab.results.rows} fields={activeTab.results.fields} />
        ) : activeTab?.error ? (
          <div className="flex-1" />
        ) : (
          <div className="flex-1" />
        )}
      </div>

      {/* Bottom status bar — matches desktop "● 25 rows returned 466ms" */}
      <ResultsStatus
        rowCount={activeTab?.results?.rowCount ?? null}
        durationMs={activeTab?.results?.durationMs ?? null}
        error={activeTab?.error ?? null}
        isExecuting={activeTab?.isExecuting ?? false}
        rows={activeTab?.results?.rows}
        fields={activeTab?.results?.fields}
      />
    </div>
  )
}
