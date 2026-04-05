'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import type { editor } from 'monaco-editor'
import { trpc } from '@/lib/trpc-client'
import { useConnectionStore } from '@/stores/connection-store'
import { useQueryStore } from '@/stores/query-store'
import { useEditStore } from '@/stores/edit-store'
import { formatSQL } from '@/lib/sql-formatter'
import { SqlEditor } from '@/components/query/sql-editor'
import { QueryToolbar } from '@/components/query/query-toolbar'
import { ResultsTable } from '@/components/query/results-table'
import { ResultsStatus } from '@/components/query/results-status'
import { TabContainer } from '@/components/query/tab-container'
import { EditToolbar } from '@/components/query/edit-toolbar'

export default function QueryPage() {
  const { activeConnectionId } = useConnectionStore()
  const { tabs, activeTabId, updateSql, setResults, setError, setExecuting } = useQueryStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const { isInEditMode, buildEditSql, clearPendingChanges, addNewRow, getEditContext } = useEditStore()
  const isEditing = isInEditMode(activeTabId)
  const { data: connections } = trpc.connections.list.useQuery()
  const activeConn = connections?.find((c) => c.id === activeConnectionId)

  const executeMutation = trpc.queries.execute.useMutation()
  const explainMutation = trpc.queries.explain.useMutation()
  const cancelMutation = trpc.queries.cancel.useMutation()
  const editMutation = trpc.queries.executeEdit.useMutation()

  const executeQuery = useCallback((sql: string) => {
    if (!activeConnectionId || !sql.trim()) return

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setExecuting(activeTabId, true)
    setError(activeTabId, null)

    executeMutation.mutate(
      { connectionId: activeConnectionId, sql },
      {
        onSuccess: (result) => {
          if (!controller.signal.aborted) {
            setResults(activeTabId, result)
            setExecuting(activeTabId, false)
          }
        },
        onError: (error) => {
          if (!controller.signal.aborted) {
            setError(activeTabId, error.message)
            setExecuting(activeTabId, false)
          }
        },
      }
    )
  }, [activeConnectionId, activeTabId, executeMutation, setResults, setError, setExecuting])

  const handleExecute = useCallback(() => {
    if (!activeTab?.sql.trim()) return
    executeQuery(activeTab.sql)
  }, [activeTab, executeQuery])

  const handleCancel = useCallback(() => {
    if (!activeConnectionId) return
    abortControllerRef.current?.abort()
    cancelMutation.mutate(
      { connectionId: activeConnectionId },
      {
        onSettled: () => {
          setExecuting(activeTabId, false)
          setError(activeTabId, 'Query cancelled')
        },
      }
    )
  }, [activeConnectionId, activeTabId, cancelMutation, setExecuting, setError])

  const handleFormat = useCallback(() => {
    const store = useQueryStore.getState()
    const tab = store.tabs.find((t) => t.id === store.activeTabId)
    if (!tab?.sql.trim()) return
    const formatted = formatSQL(tab.sql)
    updateSql(store.activeTabId, formatted)
  }, [updateSql])

  const handleSaveEdits = useCallback(async () => {
    if (!activeConnectionId || !activeTab?.results) return

    const dbType = activeConn?.dbType ?? 'postgresql'
    const statements = buildEditSql(activeTabId, activeTab.results.rows, dbType)
    if (statements.length === 0) return

    setIsSaving(true)
    try {
      const combinedSql = statements.join(';\n')
      await editMutation.mutateAsync({
        connectionId: activeConnectionId,
        sql: combinedSql,
      })
      clearPendingChanges(activeTabId)
      // Re-execute the original query to refresh results
      if (activeTab.sql.trim()) {
        executeQuery(activeTab.sql)
      }
    } catch (error) {
      setError(activeTabId, error instanceof Error ? error.message : 'Save failed')
    } finally {
      setIsSaving(false)
    }
  }, [activeConnectionId, activeTabId, activeTab, activeConn, buildEditSql, clearPendingChanges, editMutation, executeQuery, setError])

  const handleAddRow = useCallback(() => {
    const context = getEditContext(activeTabId)
    const defaultValues: Record<string, unknown> = {}
    if (context) {
      for (const col of context.columns) {
        defaultValues[col.name] = null
      }
    } else if (activeTab?.results?.fields) {
      for (const field of activeTab.results.fields) {
        defaultValues[field.name] = null
      }
    }
    addNewRow(activeTabId, defaultValues)
  }, [activeTabId, getEditContext, addNewRow, activeTab])

  useEffect(() => {
    function onExecuteEvent() {
      const store = useQueryStore.getState()
      const tab = store.tabs.find((t) => t.id === store.activeTabId)
      if (tab?.sql.trim()) executeQuery(tab.sql)
    }
    function onFormatEvent() {
      handleFormat()
    }
    window.addEventListener('datapeek:execute', onExecuteEvent)
    window.addEventListener('datapeek:format', onFormatEvent)
    return () => {
      window.removeEventListener('datapeek:execute', onExecuteEvent)
      window.removeEventListener('datapeek:format', onFormatEvent)
    }
  }, [executeQuery, handleFormat])

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
            onFormat={handleFormat}
            editorRef={editorRef}
          />
        </div>
        {/* Toolbar BELOW editor — matches desktop layout */}
        <QueryToolbar
          onExecute={handleExecute}
          onExplain={handleExplain}
          onFormat={handleFormat}
          onCancel={handleCancel}
          isExecuting={activeTab?.isExecuting ?? false}
        />
      </div>

      {/* Edit toolbar */}
      {activeTab?.results && (
        <EditToolbar
          tabId={activeTabId}
          onSave={handleSaveEdits}
          onAddRow={handleAddRow}
          isSaving={isSaving}
        />
      )}

      {/* Results section */}
      <div className="flex flex-col flex-1 min-h-0">
        {activeTab?.results ? (
          <ResultsTable rows={activeTab.results.rows} fields={activeTab.results.fields} />
        ) : activeTab?.error ? (
          <div className="flex-1" />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3 max-w-sm">
              <div className="size-10 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
                <Play className="size-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  {activeTab?.sql.trim() ? 'Ready to execute' : 'Write a query to get started'}
                </p>
                <p className="text-xs text-muted-foreground/60">
                  {activeTab?.sql.trim()
                    ? 'Press \u2318/Ctrl+Enter to run your query'
                    : 'Browse the schema explorer to view tables, or type a SQL query above'}
                </p>
              </div>
              <div className="flex items-center justify-center gap-4 pt-1">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                  <kbd className="rounded bg-muted/80 px-1.5 py-0.5 font-mono">\u2318/Ctrl+Enter</kbd>
                  <span>Run</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                  <kbd className="rounded bg-muted/80 px-1.5 py-0.5 font-mono">\u2318K</kbd>
                  <span>Commands</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom status bar */}
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
