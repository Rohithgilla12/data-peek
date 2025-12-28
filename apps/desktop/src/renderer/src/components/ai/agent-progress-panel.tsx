import {
  Bot,
  CheckCircle2,
  XCircle,
  Loader2,
  Database,
  Table2,
  BarChart3,
  Gauge,
  LayoutDashboard,
  Clock,
  AlertTriangle
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AgentSession, AgentStep, AgentToolName } from '@shared/index'

interface AgentProgressPanelProps {
  session: AgentSession
  streamingText: string
}

const TOOL_ICONS: Record<AgentToolName, React.ElementType> = {
  execute_query: Database,
  get_schema: Table2,
  sample_data: Table2,
  create_chart_widget: BarChart3,
  create_kpi_widget: Gauge,
  create_table_widget: Table2,
  save_dashboard: LayoutDashboard
}

const TOOL_LABELS: Record<AgentToolName, string> = {
  execute_query: 'Execute Query',
  get_schema: 'Get Schema',
  sample_data: 'Sample Data',
  create_chart_widget: 'Create Chart',
  create_kpi_widget: 'Create KPI',
  create_table_widget: 'Create Table',
  save_dashboard: 'Save Dashboard'
}

function StepIcon({ step }: { step: AgentStep }) {
  const Icon = TOOL_ICONS[step.toolName] || Database

  switch (step.status) {
    case 'completed':
      return <CheckCircle2 className="size-4 text-green-500" />
    case 'error':
      return <XCircle className="size-4 text-red-500" />
    case 'running':
      return <Loader2 className="size-4 text-blue-500 animate-spin" />
    case 'requires_approval':
      return <AlertTriangle className="size-4 text-amber-500" />
    default:
      return <Icon className="size-4 text-muted-foreground" />
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function SqlPreview({ sql }: { sql: string }) {
  const truncated = sql.slice(0, 80)
  const needsEllipsis = sql.length > 80

  return (
    <pre className="mt-1 text-xs text-muted-foreground font-mono truncate max-w-full">
      {truncated}
      {needsEllipsis ? '...' : ''}
    </pre>
  )
}

function StepResult({ step }: { step: AgentStep }) {
  const result = step.result as Record<string, unknown> | null

  if (!result) return null

  if (step.toolName === 'execute_query' && typeof result.rowCount === 'number') {
    return (
      <div className="mt-1 text-xs text-muted-foreground">
        <span>{result.rowCount} rows returned</span>
      </div>
    )
  }

  if (
    (step.toolName === 'create_chart_widget' ||
      step.toolName === 'create_kpi_widget' ||
      step.toolName === 'create_table_widget') &&
    typeof result.message === 'string'
  ) {
    return <div className="mt-1 text-xs text-green-600">{result.message}</div>
  }

  return null
}

function StepCard({ step }: { step: AgentStep }) {
  const duration = step.completedAt ? step.completedAt - step.startedAt : null

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border transition-all',
        step.status === 'running' && 'border-blue-500/30 bg-blue-500/5',
        step.status === 'completed' && 'border-green-500/30 bg-green-500/5',
        step.status === 'error' && 'border-red-500/30 bg-red-500/5',
        step.status === 'requires_approval' && 'border-amber-500/30 bg-amber-500/5',
        step.status === 'pending' && 'border-border bg-muted/20'
      )}
    >
      <StepIcon step={step} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{TOOL_LABELS[step.toolName] || step.toolName}</span>
          {duration !== null && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="size-3" />
              {formatDuration(duration)}
            </span>
          )}
        </div>

        {step.toolName === 'execute_query' && step.args?.sql != null ? (
          <SqlPreview sql={String(step.args.sql)} />
        ) : null}

        {step.status === 'completed' && step.result != null ? <StepResult step={step} /> : null}

        {step.status === 'error' && step.error && (
          <p className="mt-1 text-xs text-red-500">{step.error}</p>
        )}

        {step.status === 'requires_approval' && (
          <Badge variant="outline" className="mt-1 text-amber-600 border-amber-500/30">
            Waiting for approval
          </Badge>
        )}
      </div>
    </div>
  )
}

export function AgentProgressPanel({ session, streamingText }: AgentProgressPanelProps) {
  const isRunning = session.status === 'running'
  const isWaiting = session.status === 'waiting_approval'
  const isComplete = session.status === 'completed'
  const isError = session.status === 'error'
  const isCancelled = session.status === 'cancelled'

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30 bg-muted/20">
        <Bot className="size-4 text-blue-400" />
        <span className="text-xs font-medium">Agent Progress</span>
        <div className="flex-1" />
        {isRunning && (
          <Badge variant="outline" className="text-blue-500 border-blue-500/30 gap-1">
            <Loader2 className="size-3 animate-spin" />
            Running
          </Badge>
        )}
        {isWaiting && (
          <Badge variant="outline" className="text-amber-500 border-amber-500/30 gap-1">
            <AlertTriangle className="size-3" />
            Waiting
          </Badge>
        )}
        {isComplete && (
          <Badge variant="outline" className="text-green-500 border-green-500/30 gap-1">
            <CheckCircle2 className="size-3" />
            Complete
          </Badge>
        )}
        {isError && (
          <Badge variant="outline" className="text-red-500 border-red-500/30 gap-1">
            <XCircle className="size-3" />
            Error
          </Badge>
        )}
        {isCancelled && (
          <Badge variant="outline" className="text-muted-foreground border-border gap-1">
            Cancelled
          </Badge>
        )}
      </div>

      <ScrollArea className="flex-1 px-4 py-3">
        <div className="space-y-3">
          {session.steps.map((step) => (
            <StepCard key={step.id} step={step} />
          ))}

          {session.steps.length === 0 && isRunning && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Loader2 className="size-8 text-blue-400 animate-spin mb-3" />
              <p className="text-sm text-muted-foreground">Analyzing your request...</p>
            </div>
          )}
        </div>

        {streamingText && (
          <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-sm whitespace-pre-wrap">{streamingText}</p>
          </div>
        )}

        {session.finalMessage && isComplete && (
          <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
            <p className="text-sm whitespace-pre-wrap">{session.finalMessage}</p>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
