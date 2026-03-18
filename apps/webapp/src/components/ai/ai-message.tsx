import * as React from 'react'
import { User, Sparkles, Copy, Check, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AISQLPreview } from './ai-sql-preview'
import { AIChart, type ChartData } from './ai-chart'
import { AIMetricCard, type MetricData } from './ai-metric-card'
import { AISchemaCard } from './ai-schema-card'
import { AIQueryResult } from './ai-query-result'
import type {
  AIChatMessage,
  AIResponseData,
  AIQueryData,
  AIChartData,
  AIMetricData,
  AISchemaData
} from './ai-chat-panel'
import type { ConnectionConfig, SchemaInfo } from '@data-peek/shared'

interface AIMessageProps {
  message: AIChatMessage
  onOpenInTab: (sql: string) => void
  connection?: ConnectionConfig | null
  schemas?: SchemaInfo[]
}

// Query result state type
interface QueryResultState {
  columns: Array<{ name: string; type: string }>
  rows: Record<string, unknown>[]
  totalRows: number
  duration: number
}

export function AIMessage({ message, onOpenInTab, connection, schemas = [] }: AIMessageProps) {
  const [copiedContent, setCopiedContent] = React.useState(false)
  const [chartData, setChartData] = React.useState<Record<string, unknown>[] | null>(null)
  const [chartLoading, setChartLoading] = React.useState(false)
  const [chartError, setChartError] = React.useState<string | null>(null)
  const [metricValue, setMetricValue] = React.useState<number | string | null>(null)
  const [metricLoading, setMetricLoading] = React.useState(false)
  const [metricError, setMetricError] = React.useState<string | null>(null)
  const [queryResult, setQueryResult] = React.useState<QueryResultState | null>(null)
  const [queryExecuting, setQueryExecuting] = React.useState(false)
  const [queryError, setQueryError] = React.useState<string | null>(null)

  const isUser = message.role === 'user'

  const handleCopyContent = () => {
    navigator.clipboard.writeText(message.content)
    setCopiedContent(true)
    setTimeout(() => setCopiedContent(false), 1500)
  }

  // Execute query inline and show results in chat
  const handleExecuteInline = async (sql: string) => {
    if (!connection || queryExecuting) return

    setQueryExecuting(true)
    setQueryError(null)

    const startTime = performance.now()

    try {
      const response = await window.api.db.query(connection, sql)
      const duration = Math.round(performance.now() - startTime)

      if (response.success && response.data) {
        const data = response.data as {
          rows: Record<string, unknown>[]
          fields?: Array<{ name: string; dataTypeID?: number }>
        }

        // Extract column info from fields or first row
        const columns: Array<{ name: string; type: string }> =
          data.fields?.map((f) => ({
            name: f.name,
            type: f.dataTypeID ? `type_${f.dataTypeID}` : 'unknown'
          })) ||
          (data.rows[0]
            ? Object.keys(data.rows[0]).map((key) => ({
                name: key,
                type: typeof data.rows[0][key]
              }))
            : [])

        setQueryResult({
          columns,
          rows: data.rows,
          totalRows: data.rows.length,
          duration
        })
      } else {
        setQueryError(response.error || 'Query failed')
      }
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setQueryExecuting(false)
    }
  }

  // Fetch chart data when chart response is received
  React.useEffect(() => {
    if (
      message.responseData?.type === 'chart' &&
      connection &&
      !chartData &&
      !chartLoading &&
      !chartError
    ) {
      const fetchChartData = async () => {
        setChartLoading(true)
        try {
          const response = await window.api.db.query(
            connection,
            (message.responseData as AIChartData).sql
          )
          if (response.success && response.data) {
            const data = response.data as { rows: Record<string, unknown>[] }
            setChartData(data.rows)
          } else {
            setChartError(response.error || 'Failed to fetch chart data')
          }
        } catch (err) {
          setChartError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
          setChartLoading(false)
        }
      }
      fetchChartData()
    }
  }, [message.responseData, connection, chartData, chartLoading, chartError])

  // Fetch metric value when metric response is received
  React.useEffect(() => {
    if (
      message.responseData?.type === 'metric' &&
      connection &&
      metricValue === null &&
      !metricLoading &&
      !metricError
    ) {
      const fetchMetricData = async () => {
        setMetricLoading(true)
        try {
          const response = await window.api.db.query(
            connection,
            (message.responseData as AIMetricData).sql
          )
          if (response.success && response.data) {
            const data = response.data as { rows: Record<string, unknown>[] }
            const firstRow = data.rows[0]
            const value = firstRow ? Object.values(firstRow)[0] : null
            setMetricValue(value as number | string | null)
          } else {
            setMetricError(response.error || 'Failed to fetch metric')
          }
        } catch (err) {
          setMetricError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
          setMetricLoading(false)
        }
      }
      fetchMetricData()
    }
  }, [message.responseData, connection, metricValue, metricLoading, metricError])

  // Render response data based on type
  const renderResponseData = (data: AIResponseData) => {
    if (!data) return null

    switch (data.type) {
      case 'query': {
        const queryData = data as AIQueryData
        return (
          <div className="space-y-2 mt-3">
            {queryData.warning && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <span className="text-xs">{queryData.warning}</span>
              </div>
            )}
            <AISQLPreview
              sql={queryData.sql}
              explanation={queryData.explanation}
              onExecute={() => handleExecuteInline(queryData.sql)}
              onOpenInTab={() => onOpenInTab(queryData.sql)}
              isExecuting={queryExecuting}
              requiresConfirmation={queryData.requiresConfirmation}
            />

            {/* Query Error */}
            {queryError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                <div className="flex items-start gap-2 text-red-400">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Query failed</p>
                    <p className="text-xs opacity-70 mt-1">{queryError}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Query Results */}
            {queryResult && (
              <AIQueryResult
                columns={queryResult.columns}
                rows={queryResult.rows}
                totalRows={queryResult.totalRows}
                duration={queryResult.duration}
                onOpenInTab={() => onOpenInTab(queryData.sql)}
              />
            )}
          </div>
        )
      }

      case 'chart': {
        const chartResponseData = data as AIChartData

        if (chartLoading) {
          return (
            <div className="rounded-xl border border-border/50 bg-muted/20 p-8 mt-3">
              <div className="flex flex-col items-center justify-center gap-2">
                <Loader2 className="size-6 animate-spin text-blue-400" />
                <span className="text-sm text-muted-foreground">Loading chart data...</span>
              </div>
            </div>
          )
        }

        if (chartError) {
          return (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 mt-3">
              <div className="flex items-start gap-2 text-red-400">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Failed to load chart data</p>
                  <p className="text-xs opacity-70 mt-1">{chartError}</p>
                </div>
              </div>
            </div>
          )
        }

        if (chartData && chartData.length > 0) {
          const chartDataForComponent: ChartData = {
            title: chartResponseData.title,
            description: chartResponseData.description,
            chartType: chartResponseData.chartType,
            data: chartData,
            xKey: chartResponseData.xKey,
            yKeys: chartResponseData.yKeys
          }

          return (
            <div className="mt-3">
              <AIChart chartData={chartDataForComponent} />
            </div>
          )
        }

        return (
          <div className="rounded-xl border border-border/50 bg-muted/20 p-4 mt-3 text-center text-sm text-muted-foreground">
            No data to visualize
          </div>
        )
      }

      case 'metric': {
        const metricResponseData = data as AIMetricData
        const metricDataForCard: MetricData = {
          label: metricResponseData.label,
          value: metricValue,
          format: metricResponseData.format,
          isLoading: metricLoading,
          error: metricError
        }

        return (
          <div className="mt-3 max-w-xs">
            <AIMetricCard metric={metricDataForCard} />
          </div>
        )
      }

      case 'schema': {
        const schemaData = data as AISchemaData

        // Find matching tables in the schemas prop
        const matchedTables = schemaData.tables
          .map((tableName) => {
            for (const schema of schemas) {
              const table = schema.tables.find(
                (t) =>
                  t.name.toLowerCase() === tableName.toLowerCase() ||
                  `${schema.name}.${t.name}`.toLowerCase() === tableName.toLowerCase()
              )
              if (table) {
                return {
                  name: table.name,
                  columns: table.columns.map((c) => ({
                    name: c.name,
                    type: c.dataType,
                    nullable: c.isNullable,
                    isPrimaryKey: c.isPrimaryKey
                  }))
                }
              }
            }
            return null
          })
          .filter(Boolean) as Array<{
          name: string
          columns: Array<{
            name: string
            type: string
            nullable: boolean
            isPrimaryKey: boolean
          }>
        }>

        if (matchedTables.length === 0) {
          return (
            <div className="mt-3 text-sm text-muted-foreground">
              Tables not found: {schemaData.tables.join(', ')}
            </div>
          )
        }

        return (
          <div className="space-y-2 mt-3">
            {matchedTables.map((table) => (
              <AISchemaCard key={table.name} table={table} />
            ))}
          </div>
        )
      }

      default:
        return null
    }
  }

  return (
    <div
      className={cn(
        'group flex items-start gap-3',
        'animate-in fade-in-0 slide-in-from-bottom-2 duration-200'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex items-center justify-center size-7 rounded-full shrink-0',
          isUser
            ? 'bg-muted border border-border'
            : 'bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20'
        )}
      >
        {isUser ? (
          <User className="size-3.5 text-muted-foreground" />
        ) : (
          <Sparkles className="size-3.5 text-blue-400" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Text content */}
        {message.content && (
          <div className="relative group/content">
            <div
              className={cn(
                'text-sm leading-relaxed',
                isUser ? 'text-foreground' : 'text-foreground/90'
              )}
            >
              {/* Simple markdown-like rendering for bold and code */}
              {message.content.split(/(\*\*.*?\*\*|`.*?`)/g).map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  return (
                    <strong key={i} className="font-semibold">
                      {part.slice(2, -2)}
                    </strong>
                  )
                }
                if (part.startsWith('`') && part.endsWith('`')) {
                  return (
                    <code
                      key={i}
                      className="px-1 py-0.5 rounded bg-muted font-mono text-xs text-blue-400"
                    >
                      {part.slice(1, -1)}
                    </code>
                  )
                }
                return part
              })}
            </div>

            {/* Copy button */}
            {!isUser && message.content.length > 20 && (
              <button
                onClick={handleCopyContent}
                className="absolute -right-1 -top-1 opacity-0 group-hover/content:opacity-100 transition-opacity p-1 rounded bg-muted hover:bg-muted/80"
              >
                {copiedContent ? (
                  <Check className="size-3 text-green-500" />
                ) : (
                  <Copy className="size-3 text-muted-foreground" />
                )}
              </button>
            )}
          </div>
        )}

        {/* Response data (query, chart, metric, schema) */}
        {message.responseData && renderResponseData(message.responseData)}

        {/* Timestamp */}
        <p className="text-[10px] text-muted-foreground/50 mt-1">
          {message.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}
