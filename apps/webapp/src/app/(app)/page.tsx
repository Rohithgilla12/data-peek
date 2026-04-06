'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import type { editor } from 'monaco-editor'
import type { QueryField } from '@shared/index'
import { trpc } from '@/lib/trpc-client'
import { useConnectionStore } from '@/stores/connection-store'
import { useQueryTabs } from '@/hooks/use-query-tabs'
import { useQueryHistory } from '@/hooks/use-query-history'
import { useEditStore } from '@/stores/edit-store'
import { formatSQL } from '@/lib/sql-formatter'
import { SqlEditor } from '@/components/query/sql-editor'
import { QueryToolbar } from '@/components/query/query-toolbar'
import { ResultsTable } from '@/components/query/results-table'
import { ResultsStatus } from '@/components/query/results-status'
import { TabContainer } from '@/components/query/tab-container'
import { EditToolbar } from '@/components/query/edit-toolbar'

type QueryResult = {
  rows: Record<string, unknown>[]
  fields: QueryField[]
  rowCount: number
  durationMs: number
}

export default function QueryPage() {
  const { activeConnectionId } = useConnectionStore()
  const { tabs, activeTabId, updateSql } = useQueryTabs()
  const { addEntry: addHistoryEntry } = useQueryHistory()
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [tabResults, setTabResults] = useState<Record<string, QueryResult | null>>({})
  const [tabErrors, setTabErrors] = useState<Record<string, string | null>>({})
  const [tabExecuting, setTabExecuting] = useState<Record<string, boolean>>({})

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const activeResults = tabResults[activeTabId] ?? null
  const activeError = tabErrors[activeTabId] ?? null
  const activeIsExecuting = tabExecuting[activeTabId] ?? false

  const { isInEditMode, buildEditSql, clearPendingChanges, addNewRow, getEditContext } = useEditStore()
  const isEditing = isInEditMode(activeTabId)
  const { data: connections } = trpc.connections.list.useQuery()
  const activeConn = connections?.find((c) => c.id === activeConnectionId)

  const executeMutation = trpc.queries.execute.useMutation()
  const explainMutation = trpc.queries.explain.useMutation()
  const cancelMutation = trpc.queries.cancel.useMutation()
  const editMutation = trpc.queries.executeEdit.useMutation()

  const executeQuery = useCallback(
    (sql: string) => {
      if (!activeConnectionId || !sql.trim()) return

      abortControllerRef.current?.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller

      setTabExecuting((prev) => ({ ...prev, [activeTabId]: true }))
      setTabErrors((prev) => ({ ...prev, [activeTabId]: null }))

      executeMutation.mutate(
        { connectionId: activeConnectionId, sql },
        {
          onSuccess: (result) => {
            if (!controller.signal.aborted) {
              setTabResults((prev) => ({ ...prev, [activeTabId]: result }))
              setTabExecuting((prev) => ({ ...prev, [activeTabId]: false }))
              addHistoryEntry({
                connectionId: activeConnectionId,
                query: sql,
                status: 'success',
                durationMs: result.durationMs,
                rowCount: result.rowCount,
              })
            }
          },
          onError: (error) => {
            if (!controller.signal.aborted) {
              setTabErrors((prev) => ({ ...prev, [activeTabId]: error.message }))
              setTabExecuting((prev) => ({ ...prev, [activeTabId]: false }))
              addHistoryEntry({
                connectionId: activeConnectionId,
                query: sql,
                status: 'error',
                errorMessage: error.message,
              })
            }
          },
        }
      )
    },
    [activeConnectionId, activeTabId, executeMutation, addHistoryEntry]
  )

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
          setTabExecuting((prev) => ({ ...prev, [activeTabId]: false }))
          setTabErrors((prev) => ({ ...prev, [activeTabId]: 'Query cancelled' }))
        },
      }
    )
  }, [activeConnectionId, activeTabId, cancelMutation])

  const handleFormat = useCallback(() => {
    const tab = tabs.find((t) => t.id === activeTabId)
    if (!tab?.sql.trim()) return
    const formatted = formatSQL(tab.sql)
    updateSql(activeTabId, formatted)
  }, [tabs, activeTabId, updateSql])

  const handleSaveEdits = useCallback(async () => {
    if (!activeConnectionId || !activeResults) return

    const dbType = activeConn?.dbType ?? 'postgresql'
    const statements = buildEditSql(activeTabId, activeResults.rows, dbType)
    if (statements.length === 0) return

    setIsSaving(true)
    try {
      const combinedSql = statements.join(';\n')
      await editMutation.mutateAsync({
        connectionId: activeConnectionId,
        sql: combinedSql,
      })
      clearPendingChanges(activeTabId)
      if (activeTab?.sql.trim()) {
        executeQuery(activeTab.sql)
      }
    } catch (error) {
      setTabErrors((prev) => ({
        ...prev,
        [activeTabId]: error instanceof Error ? error.message : 'Save failed',
      }))
    } finally {
      setIsSaving(false)
    }
  }, [
    activeConnectionId,
    activeTabId,
    activeTab,
    activeConn,
    activeResults,
    buildEditSql,
    clearPendingChanges,
    editMutation,
    executeQuery,
  ])

  const handleAddRow = useCallback(() => {
    const context = getEditContext(activeTabId)
    const defaultValues: Record<string, unknown> = {}
    if (context) {
      for (const col of context.columns) {
        defaultValues[col.name] = null
      }
    } else if (activeResults?.fields) {
      for (const field of activeResults.fields) {
        defaultValues[field.name] = null
      }
    }
    addNewRow(activeTabId, defaultValues)
  }, [activeTabId, getEditContext, addNewRow, activeResults])

  useEffect(() => {
    function onExecuteEvent() {
      const tab = tabs.find((t) => t.id === activeTabId)
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
  }, [tabs, activeTabId, executeQuery, handleFormat])

  const handleExplain = useCallback(() => {
    if (!activeConnectionId || !activeTab?.sql.trim()) return

    setTabExecuting((prev) => ({ ...prev, [activeTabId]: true }))
    setTabErrors((prev) => ({ ...prev, [activeTabId]: null }))

    explainMutation.mutate(
      { connectionId: activeConnectionId, sql: activeTab.sql, analyze: false },
      {
        onSuccess: (result) => {
          setTabResults((prev) => ({
            ...prev,
            [activeTabId]: {
              rows: Array.isArray(result.plan) ? result.plan : [result.plan],
              fields: [{ name: 'QUERY PLAN', dataType: 'json' }],
              rowCount: 1,
              durationMs: result.durationMs,
            },
          }))
          setTabExecuting((prev) => ({ ...prev, [activeTabId]: false }))
        },
        onError: (error) => {
          setTabErrors((prev) => ({ ...prev, [activeTabId]: error.message }))
          setTabExecuting((prev) => ({ ...prev, [activeTabId]: false }))
        },
      }
    )
  }, [activeConnectionId, activeTab, activeTabId, explainMutation])

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
      <TabContainer />

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
        <QueryToolbar
          onExecute={handleExecute}
          onExplain={handleExplain}
          onFormat={handleFormat}
          onCancel={handleCancel}
          isExecuting={activeIsExecuting}
        />
      </div>

      {activeResults && (
        <EditToolbar
          tabId={activeTabId}
          onSave={handleSaveEdits}
          onAddRow={handleAddRow}
          isSaving={isSaving}
        />
      )}

      <div className="flex flex-col flex-1 min-h-0">
        {activeResults ? (
          <ResultsTable rows={activeResults.rows} fields={activeResults.fields} />
        ) : activeError ? (
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
                  <kbd className="rounded bg-muted/80 px-1.5 py-0.5 font-mono">
                    \u2318/Ctrl+Enter
                  </kbd>
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

      <ResultsStatus
        rowCount={activeResults?.rowCount ?? null}
        durationMs={activeResults?.durationMs ?? null}
        error={activeError}
        isExecuting={activeIsExecuting}
        rows={activeResults?.rows}
        fields={activeResults?.fields}
      />
    </div>
  )
}
