import { useMemo } from 'react'
import { Play, SkipForward, FastForward, Square, RefreshCw } from 'lucide-react'
import { Button, cn } from '@data-peek/ui'
import type { SessionState } from '@shared/index'
import { useStepStore } from '@/stores/step-store'

interface StepRibbonProps {
  tabId: string
}

export function StepRibbon({ tabId }: StepRibbonProps) {
  const session = useStepStore((s) => s.sessions.get(tabId))
  const nextStep = useStepStore((s) => s.nextStep)
  const skipStep = useStepStore((s) => s.skipStep)
  const continueStep = useStepStore((s) => s.continueStep)
  const retryStep = useStepStore((s) => s.retryStep)
  const stopStep = useStepStore((s) => s.stopStep)

  const progressPct = useMemo(() => {
    if (!session) return 0
    if (session.statements.length === 0) return 0
    return Math.round((session.cursorIndex / session.statements.length) * 100)
  }, [session])

  const currentStmt = useMemo(() => {
    if (!session) return null
    return session.statements[session.cursorIndex] ?? null
  }, [session])

  if (!session) return null

  const canNext = session.state === 'paused'
  const canRetry = session.state === 'errored' && !session.inTransaction
  const isRunning = session.state === 'running'

  return (
    <div
      className={cn(
        'relative flex items-center gap-3 px-4 py-2 bg-card/80 backdrop-blur border-t border-primary/30',
        'animate-in slide-in-from-bottom-2 duration-200'
      )}
      style={{
        boxShadow: '0 -4px 24px rgba(107, 140, 245, 0.1)'
      }}
    >
      {/* Top-edge progress bar */}
      <div className="absolute inset-x-0 top-0 h-[2px] bg-border/40">
        <div
          className="h-full bg-gradient-to-r from-primary to-cyan-400 transition-[width] duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Status dot */}
      <StatusDot state={session.state} />

      {/* Counter */}
      <div className="text-xs font-mono tabular-nums text-muted-foreground whitespace-nowrap">
        <span className="font-semibold text-foreground">{session.cursorIndex}</span>
        <span> / {session.statements.length}</span>
        <span className="ml-2 text-muted-foreground/70">{progressPct}%</span>
      </div>

      <div className="h-5 w-px bg-border" />

      {/* Statement preview */}
      <div className="flex-1 text-xs font-mono text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
        {session.state === 'done' ? (
          <span className="text-green-500">
            Complete — {session.statements.length} statements executed
          </span>
        ) : session.state === 'errored' && session.lastError ? (
          <span className="text-destructive">
            Error at #{session.lastError.statementIndex + 1}: {session.lastError.message}
          </span>
        ) : currentStmt ? (
          <span>{truncate(currentStmt.sql, 120)}</span>
        ) : (
          <span>Done</span>
        )}
      </div>

      <div className="h-5 w-px bg-border" />

      {/* Controls */}
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="default"
          onClick={() => nextStep(tabId)}
          disabled={!canNext}
          className="h-7 text-xs"
        >
          <Play className="size-3 mr-1" />
          Next
          <kbd className="ml-2 opacity-60 text-[10px]">⇧↵</kbd>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => skipStep(tabId)}
          disabled={!canNext}
          className="h-7 text-xs"
        >
          <SkipForward className="size-3 mr-1" />
          Skip
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => continueStep(tabId)}
          disabled={!canNext}
          className="h-7 text-xs"
        >
          <FastForward className="size-3 mr-1" />
          Continue
        </Button>
        {canRetry && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => retryStep(tabId)}
            className="h-7 text-xs text-amber-500 hover:text-amber-400"
          >
            <RefreshCw className="size-3 mr-1" />
            Retry
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => stopStep(tabId)}
          disabled={isRunning}
          className="h-7 text-xs text-destructive hover:text-destructive"
        >
          <Square className="size-3 mr-1" />
          Stop
        </Button>
      </div>
    </div>
  )
}

function StatusDot({ state }: { state: SessionState }) {
  const color =
    state === 'running'
      ? 'bg-amber-500 animate-pulse'
      : state === 'paused' || state === 'idle'
      ? 'bg-primary'
      : state === 'errored'
      ? 'bg-destructive'
      : 'bg-green-500'
  return <div className={cn('size-2 rounded-full', color)} />
}

function truncate(s: string, max: number): string {
  const oneLine = s.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= max) return oneLine
  return oneLine.slice(0, max - 1) + '…'
}
