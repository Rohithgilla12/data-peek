import { useState } from 'react'
import {
  AiIcon,
  CaretRightIcon,
  ChartBarIcon,
  CloseIcon,
  CopyIcon,
  EditIcon,
  ExternalLinkIcon,
  PlayIcon,
  RefreshIcon,
  ShieldCheckIcon,
  StopIcon,
  TableIcon,
  WandIcon,
  WarningIcon
} from '@/components/icons'
import { Button, cn } from '@data-peek/ui'
import { AIChart } from '@/components/ai/ai-chart'
import { highlightSQL } from '@/components/ai/ai-sql-preview'
import {
  fixPrompt,
  type AskBlock as Block,
  type AskResult,
  type AskVisual
} from '@/lib/ask-session'
import { AskGrid } from './ask-grid'
import { AskProse } from './ask-prose'

export interface AskBlockActions {
  run: () => void
  cancel: () => void
  stop: () => void
  editSql: (sql: string) => void
  remove: () => void
  ask: (prompt: string, context?: string) => void
  openInEditor: (sql: string) => void
  /** Adds a SQL block below; it goes through the same read-only gate as typed SQL. */
  runSql: (sql: string, flagged: boolean) => void
  /** False when no AI is connected, which hides AI-only actions. */
  canAsk: boolean
}

const COLLAPSED_LINES = 6

function toNumber(value: unknown): unknown {
  if (typeof value !== 'string' || value.trim() === '') return value
  const n = Number(value)
  return Number.isFinite(n) ? n : value
}

function formatMetric(value: unknown, format: string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  switch (format) {
    case 'currency':
      return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
    case 'percent':
      return `${(Math.abs(n) <= 1 ? n * 100 : n).toFixed(1)}%`
    case 'duration':
      return `${n.toLocaleString()}s`
    default:
      return n.toLocaleString()
  }
}

function IconButton({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  )
}

function SqlPane({
  sql,
  onSave,
  onRun
}: {
  sql: string
  onSave: (sql: string) => void
  onRun: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  if (draft !== null) {
    return (
      <div className="border-b border-border/50">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setDraft(null)
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              onSave(draft)
              setDraft(null)
              onRun()
            }
          }}
          rows={Math.min(14, draft.split('\n').length + 1)}
          className="block w-full resize-none bg-transparent px-3 py-2 font-mono text-xs leading-5 text-foreground outline-none"
        />
        <div className="flex items-center justify-end gap-2 px-3 pb-2 text-2xs text-muted-foreground">
          <span>esc to cancel</span>
          <Button
            size="sm"
            className="h-6 gap-1 px-2 text-2xs"
            onClick={() => {
              onSave(draft)
              setDraft(null)
              onRun()
            }}
          >
            <PlayIcon className="size-3" /> Run
          </Button>
        </div>
      </div>
    )
  }
  const lines = sql.split('\n')
  const long = lines.length > COLLAPSED_LINES + 2
  const shown = long && !expanded ? lines.slice(0, COLLAPSED_LINES).join('\n') : sql
  return (
    <div className="group/sql relative border-b border-border/50">
      <pre className="overflow-x-auto whitespace-pre-wrap px-3 py-2 font-mono text-xs leading-5 text-foreground/90">
        {highlightSQL(shown)}
      </pre>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full border-t border-border/40 px-3 py-1 text-left text-2xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          {expanded ? 'Show less' : `Show all ${lines.length} lines`}
        </button>
      )}
      <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover/sql:opacity-100">
        <IconButton label="Edit SQL" onClick={() => setDraft(sql)}>
          <EditIcon className="size-3" />
        </IconButton>
        <IconButton label="Copy SQL" onClick={() => void navigator.clipboard.writeText(sql)}>
          <CopyIcon className="size-3" />
        </IconButton>
      </div>
    </div>
  )
}

function Metric({ result, visual }: { result: AskResult; visual: AskVisual & { kind: 'metric' } }) {
  const row = result.rows[0] ?? {}
  const column =
    result.columns.find((c) => Number.isFinite(Number(row[c.name])))?.name ??
    result.columns[0]?.name
  return (
    <div className="px-4 py-4">
      <div className="text-2xs uppercase tracking-wider text-muted-foreground">{visual.label}</div>
      <div className="mt-1 font-mono text-3xl font-semibold tabular-nums text-foreground">
        {column ? formatMetric(row[column], visual.format) : '—'}
      </div>
    </div>
  )
}

function ResultPane({
  result,
  visual,
  sql,
  onOpen
}: {
  result: AskResult
  visual: AskVisual | null
  sql: string
  onOpen: (sql: string) => void
}) {
  const canChart = visual?.kind === 'chart' && result.rows.length > 0
  const [view, setView] = useState<'visual' | 'table'>(
    visual && result.rows.length > 0 ? 'visual' : 'table'
  )
  const showVisual = view === 'visual' && visual && result.rows.length > 0
  return (
    <div>
      <div className="flex h-7 items-center gap-3 border-b border-border/50 px-3 text-2xs text-muted-foreground">
        <span className="tabular-nums">
          {result.rowCount.toLocaleString()} row{result.rowCount === 1 ? '' : 's'}
          {result.columns.length === 0 && ' affected'}
        </span>
        <span className="tabular-nums">{result.durationMs} ms</span>
        <div className="ml-auto flex items-center gap-0.5">
          {visual && result.rows.length > 0 && (
            <div className="mr-1 flex rounded border border-border/60 p-px">
              <button
                type="button"
                onClick={() => setView('visual')}
                className={cn(
                  'flex items-center gap-1 rounded-sm px-1.5 py-0.5',
                  view === 'visual' && 'bg-muted text-foreground'
                )}
              >
                {canChart ? <ChartBarIcon className="size-3" /> : <AiIcon className="size-3" />}
                {canChart ? 'Chart' : 'Metric'}
              </button>
              <button
                type="button"
                onClick={() => setView('table')}
                className={cn(
                  'flex items-center gap-1 rounded-sm px-1.5 py-0.5',
                  view === 'table' && 'bg-muted text-foreground'
                )}
              >
                <TableIcon className="size-3" /> Table
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => onOpen(sql)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
          >
            <ExternalLinkIcon className="size-3" /> Open in editor
          </button>
        </div>
      </div>
      {showVisual && visual.kind === 'chart' ? (
        <AIChart
          className="border-0 bg-transparent"
          chartData={{
            title: visual.title,
            chartType: visual.chartType,
            data: result.rows.map((row) => {
              const out = { ...row }
              for (const key of visual.yKeys) out[key] = toNumber(row[key])
              return out
            }),
            xKey: visual.xKey,
            yKeys: visual.yKeys
          }}
        />
      ) : showVisual && visual.kind === 'metric' ? (
        <Metric result={result} visual={visual} />
      ) : (
        <AskGrid result={result} />
      )}
    </div>
  )
}

export function AskBlockView({ block, actions }: { block: Block; actions: AskBlockActions }) {
  const { ai, run, sql } = block
  const isAsk = block.mode === 'ask'
  const visual = ai?.status === 'done' ? ai.visual : null
  const time = new Date(block.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })

  return (
    <article className="group/block animate-in fade-in-0 slide-in-from-bottom-1 duration-150">
      <header className="flex items-start gap-2.5 py-1.5">
        <span
          className={cn(
            'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded',
            isAsk ? 'bg-primary/15 text-primary' : 'bg-success/10 text-success'
          )}
        >
          {isAsk ? <AiIcon className="size-3" /> : <CaretRightIcon className="size-3.5" />}
        </span>
        <p
          className={cn(
            'min-w-0 flex-1 whitespace-pre-wrap break-words pt-px text-sm leading-5',
            isAsk ? 'font-sans font-medium text-foreground' : 'font-mono text-foreground/90'
          )}
        >
          {isAsk ? block.prompt : highlightSQL(block.prompt)}
        </p>
        <div className="flex shrink-0 items-center gap-0.5">
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/block:opacity-100">
            {sql && (run.status === 'done' || run.status === 'error') && (
              <IconButton label="Run again" onClick={actions.run}>
                <RefreshIcon className="size-3" />
              </IconButton>
            )}
            {sql && (
              <IconButton label="Open in editor" onClick={() => actions.openInEditor(sql)}>
                <ExternalLinkIcon className="size-3" />
              </IconButton>
            )}
            <IconButton label="Remove" onClick={actions.remove}>
              <CloseIcon className="size-3" />
            </IconButton>
          </div>
          <span className="whitespace-nowrap pl-1 text-right text-2xs tabular-nums text-muted-foreground/50">
            {time}
          </span>
        </div>
      </header>

      <div className="ml-[30px] space-y-2 pb-1">
        {ai?.status === 'thinking' && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
              </span>
              {ai.activity ?? 'Thinking'}
              <button
                type="button"
                onClick={actions.stop}
                className="ml-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs hover:bg-muted hover:text-foreground"
              >
                <StopIcon className="size-2.5" /> Stop
              </button>
            </div>
            {ai.narration && <AskProse text={ai.narration} muted />}
          </div>
        )}

        {ai?.status === 'error' && (
          <p
            className={cn(
              'flex items-start gap-2 text-xs',
              ai.message === 'Stopped' ? 'text-muted-foreground' : 'text-destructive'
            )}
          >
            <WarningIcon className="mt-px size-3.5 shrink-0" />
            {ai.message}
          </p>
        )}

        {ai?.status === 'done' && (
          <div className="space-y-1.5">
            {ai.narration && <AskProse text={ai.narration} />}
            {ai.grounded && (
              <span className="inline-flex items-center gap-1 text-2xs text-success/80">
                <ShieldCheckIcon className="size-3" /> Checked against live data
              </span>
            )}
            {ai.warning && (
              <p className="flex items-start gap-1.5 text-xs text-warning">
                <WarningIcon className="mt-px size-3 shrink-0" />
                {ai.warning}
              </p>
            )}
          </div>
        )}

        {sql && (isAsk || run.status !== 'idle') && (
          <div className="overflow-hidden rounded-md border border-border/60 bg-card/60">
            {isAsk && <SqlPane sql={sql} onSave={actions.editSql} onRun={actions.run} />}

            {run.status === 'needs-approval' && (
              <div className="flex items-center gap-3 bg-warning/5 px-3 py-2 text-xs">
                <WarningIcon className="size-3.5 shrink-0 text-warning" />
                <span className="flex-1 text-foreground/90">{run.reason} Nothing has run yet.</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 gap-1 border-warning/40 px-2 text-2xs"
                  onClick={actions.run}
                >
                  <PlayIcon className="size-3" /> Run it
                </Button>
              </div>
            )}

            {run.status === 'idle' && isAsk && (
              <div className="flex items-center justify-end px-3 py-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 px-2 text-2xs"
                  onClick={actions.run}
                >
                  <PlayIcon className="size-3" /> Run
                </Button>
              </div>
            )}

            {run.status === 'running' && (
              <div className="flex h-8 items-center gap-2 px-3 text-xs text-muted-foreground">
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                Running
                <button
                  type="button"
                  onClick={actions.cancel}
                  className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
                >
                  <StopIcon className="size-2.5" /> Cancel
                </button>
              </div>
            )}

            {run.status === 'error' && (
              <div className="flex items-start gap-2 px-3 py-2 text-xs">
                <WarningIcon className="mt-px size-3.5 shrink-0 text-destructive" />
                <span className="flex-1 whitespace-pre-wrap font-mono text-destructive/90">
                  {run.message}
                </span>
                {actions.canAsk && run.message !== 'Cancelled' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 shrink-0 gap-1 px-2 text-2xs"
                    onClick={() =>
                      actions.ask(`Fix: ${run.message.split('\n')[0]}`, fixPrompt(sql, run.message))
                    }
                  >
                    <WandIcon className="size-3" /> Fix with AI
                  </Button>
                )}
              </div>
            )}

            {run.status === 'done' && (
              <ResultPane
                result={run.result}
                visual={visual}
                sql={sql}
                onOpen={actions.openInEditor}
              />
            )}
          </div>
        )}

        {ai?.status === 'done' && ai.more.length > 0 && (
          <div className="space-y-0.5">
            <div className="text-2xs text-muted-foreground/70">More from this answer</div>
            {ai.more.map((m) => (
              <button
                key={m.sql}
                type="button"
                onClick={() => actions.runSql(m.sql, ai.flagged)}
                title={m.sql}
                className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <PlayIcon className="size-3 text-success/70" />
                {m.title}
              </button>
            ))}
          </div>
        )}

        {actions.canAsk && ai?.status === 'done' && ai.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {ai.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => actions.ask(s)}
                className="rounded-full border border-border/60 px-2.5 py-0.5 font-sans text-2xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
