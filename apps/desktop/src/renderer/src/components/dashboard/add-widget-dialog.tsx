import { useReducer, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useConnectionStore, useSavedQueryStore, useDashboardStore } from '@/stores'
import type {
  CreateWidgetInput,
  WidgetDataSource,
  ChartWidgetConfig,
  KPIWidgetConfig,
  TableWidgetConfig
} from '@shared/index'
import { dialogReducer, initialDialogState } from './add-widget-dialog-reducer'
import { TypeStep, SourceStep, ConfigStep } from './add-widget-steps'
import type { WidgetSuggestion } from './ai-widget-suggestion'

interface AddWidgetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dashboardId: string
}

export function AddWidgetDialog({ open, onOpenChange, dashboardId }: AddWidgetDialogProps) {
  const connections = useConnectionStore((s) => s.connections)
  const savedQueries = useSavedQueryStore((s) => s.savedQueries)
  const initializeSavedQueries = useSavedQueryStore((s) => s.initializeSavedQueries)
  const addWidget = useDashboardStore((s) => s.addWidget)

  const [state, dispatch] = useReducer(dialogReducer, initialDialogState)

  const {
    step,
    isSubmitting,
    error,
    widgetName,
    widgetType,
    sourceType,
    selectedQueryId,
    inlineSql,
    connectionId,
    querySearch,
    chartType,
    xKey,
    yKeys,
    kpiFormat,
    kpiLabel,
    valueKey,
    prefix,
    suffix,
    maxRows,
    widgetWidth,
    previewData,
    isLoadingPreview
  } = state

  useEffect(() => {
    if (open) {
      initializeSavedQueries()
      const defaultConnectionId =
        connections.find((c) => c.isConnected)?.id || connections[0]?.id || ''
      dispatch({ type: 'RESET', payload: { defaultConnectionId } })
    }
  }, [open, connections, initializeSavedQueries])

  useEffect(() => {
    if (sourceType === 'saved-query' && selectedQueryId) {
      const query = savedQueries.find((q) => q.id === selectedQueryId)
      if (query && !widgetName) {
        dispatch({ type: 'SET_WIDGET_NAME', payload: query.name })
        if (query.connectionId) {
          dispatch({ type: 'SET_CONNECTION_ID', payload: query.connectionId })
        }
      }
    }
  }, [selectedQueryId, savedQueries, sourceType, widgetName])

  const filteredQueries = savedQueries.filter(
    (q) =>
      q.name.toLowerCase().includes(querySearch.toLowerCase()) ||
      q.query.toLowerCase().includes(querySearch.toLowerCase())
  )

  const canProceed = (): boolean => {
    switch (step) {
      case 'type':
        return true
      case 'source':
        if (sourceType === 'saved-query') {
          return !!selectedQueryId && !!connectionId
        }
        return !!inlineSql.trim() && !!connectionId
      case 'config':
        if (!widgetName.trim()) return false
        if (widgetType === 'chart') {
          return !!xKey && !!yKeys
        }
        if (widgetType === 'kpi') {
          return !!valueKey && !!kpiLabel
        }
        return true
      default:
        return false
    }
  }

  const handleNext = () => {
    if (step === 'type') dispatch({ type: 'SET_STEP', payload: 'source' })
    else if (step === 'source') dispatch({ type: 'SET_STEP', payload: 'config' })
  }

  const handleBack = () => {
    if (step === 'source') dispatch({ type: 'SET_STEP', payload: 'type' })
    else if (step === 'config') dispatch({ type: 'SET_STEP', payload: 'source' })
  }

  const handlePreviewQuery = async () => {
    let sql =
      sourceType === 'saved-query'
        ? savedQueries.find((q) => q.id === selectedQueryId)?.query
        : inlineSql

    const connection = connections.find((c) => c.id === connectionId)
    if (!sql || !connection) return

    sql = sql.trim().replace(/;+$/, '')
    const previewSql = `${sql} LIMIT 100`

    dispatch({ type: 'SET_LOADING_PREVIEW', payload: true })
    try {
      const result = await window.api.db.query(connection, previewSql)
      if (result.success && result.data) {
        const data = result.data as { rows?: Record<string, unknown>[] }
        dispatch({ type: 'SET_PREVIEW_DATA', payload: data.rows || null })
      } else {
        dispatch({ type: 'SET_PREVIEW_DATA', payload: null })
      }
    } catch (err) {
      console.error('Preview query failed:', err)
      dispatch({ type: 'SET_PREVIEW_DATA', payload: null })
    } finally {
      dispatch({ type: 'SET_LOADING_PREVIEW', payload: false })
    }
  }

  const handleSuggestionSelect = (suggestion: WidgetSuggestion) => {
    dispatch({ type: 'APPLY_SUGGESTION', payload: suggestion })
  }

  const handleSubmit = async () => {
    if (!canProceed()) return

    dispatch({ type: 'SET_SUBMITTING', payload: true })
    dispatch({ type: 'SET_ERROR', payload: null })

    try {
      const dataSource: WidgetDataSource = {
        type: sourceType,
        connectionId,
        ...(sourceType === 'saved-query' ? { savedQueryId: selectedQueryId } : { sql: inlineSql })
      }

      let config: ChartWidgetConfig | KPIWidgetConfig | TableWidgetConfig

      if (widgetType === 'chart') {
        config = {
          widgetType: 'chart',
          chartType,
          xKey,
          yKeys: yKeys.split(',').map((k) => k.trim()),
          showLegend: true,
          showGrid: true
        }
      } else if (widgetType === 'kpi') {
        config = {
          widgetType: 'kpi',
          format: kpiFormat,
          label: kpiLabel,
          valueKey,
          prefix: prefix || undefined,
          suffix: suffix || undefined
        }
      } else {
        config = {
          widgetType: 'table',
          maxRows
        }
      }

      const getWidgetWidth = (): number => {
        if (widgetWidth === 'full') return 12
        if (widgetWidth === 'half') return 6
        return widgetType === 'table' ? 6 : 4
      }

      const input: CreateWidgetInput = {
        name: widgetName.trim(),
        dataSource,
        config,
        layout: {
          x: 0,
          y: 0,
          w: getWidgetWidth(),
          h: widgetType === 'kpi' ? 2 : widgetWidth === 'full' ? 4 : 3,
          minW: 2,
          minH: 2
        }
      }

      await addWidget(dashboardId, input)
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add widget'
      console.error('Failed to add widget:', err)
      dispatch({ type: 'SET_ERROR', payload: message })
    } finally {
      dispatch({ type: 'SET_SUBMITTING', payload: false })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add Widget</DialogTitle>
          <DialogDescription>
            {step === 'type' && 'Choose what type of widget you want to add'}
            {step === 'source' && 'Select the data source for your widget'}
            {step === 'config' && 'Configure your widget settings'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {step === 'type' && <TypeStep widgetType={widgetType} dispatch={dispatch} />}

          {step === 'source' && (
            <SourceStep
              sourceType={sourceType}
              querySearch={querySearch}
              selectedQueryId={selectedQueryId}
              connectionId={connectionId}
              inlineSql={inlineSql}
              connections={connections}
              filteredQueries={filteredQueries}
              dispatch={dispatch}
            />
          )}

          {step === 'config' && (
            <ConfigStep
              state={state}
              connections={connections}
              previewData={previewData}
              isLoadingPreview={isLoadingPreview}
              onPreviewQuery={handlePreviewQuery}
              onSuggestionSelect={handleSuggestionSelect}
              dispatch={dispatch}
            />
          )}
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <div>
            {step !== 'type' && (
              <Button variant="ghost" onClick={handleBack}>
                <ChevronLeft className="size-4 mr-1" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {step === 'config' ? (
              <Button onClick={handleSubmit} disabled={!canProceed() || isSubmitting}>
                {isSubmitting ? 'Adding...' : 'Add Widget'}
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Next
                <ChevronRight className="size-4 ml-1" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
