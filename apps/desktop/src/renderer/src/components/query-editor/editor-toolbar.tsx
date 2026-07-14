import {
  Play,
  Square,
  StepForward,
  Loader2,
  BarChart3,
  Wand2,
  Bookmark,
  Share2,
  Maximize2,
  PanelTop,
  PanelTopClose,
  CheckCircle2,
  Undo2
} from 'lucide-react'
import {
  Button,
  keys,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@data-peek/ui'
import { BenchmarkButton } from '@/components/benchmark-button'
import { isExecutableTab, type Tab } from '@/stores/tab-store'
import type { StepSessionState } from '@/stores/step-store'
import type { ConnectionWithStatus } from '@/stores/connection-store'
import type { ReactNode } from 'react'

interface EditorToolbarProps {
  tab: Tab
  tabConnection: ConnectionWithStatus | null | undefined
  isEditorCollapsed: boolean
  setIsEditorCollapsed: (v: boolean) => void
  isResultsCollapsed: boolean
  setIsResultsCollapsed: (v: boolean) => void
  handleCancelQuery: () => void
  handleRunQuery: () => void
  handleStartStep: () => void
  inTransactionMode: boolean
  setInTransactionMode: (v: boolean) => void
  stepSession: StepSessionState | null | undefined
  autoCommit: boolean
  setAutoCommit: (v: boolean) => void
  hasActiveTransaction: boolean
  handleCommit: () => void
  handleRollback: () => void
  handleExplainQuery: () => void
  isExplaining: boolean
  handleBenchmark: (runCount: number) => Promise<void>
  isRunningBenchmark: boolean
  handleFormatQuery: () => void
  setSaveDialogOpen: (v: boolean) => void
  setShareDialogOpen: (v: boolean) => void
  /** Slot for the Watch button — rendered between Benchmark and Format. */
  watchSlot?: ReactNode
  /** Slot for the Time Machine button — rendered next to the Watch button. */
  timeMachineSlot?: ReactNode
  /** Slot for the cross-tab inlined-refs pill — rendered next to the Watch button. */
  refsSlot?: ReactNode
}

export function EditorToolbar({
  tab,
  tabConnection,
  isEditorCollapsed,
  setIsEditorCollapsed,
  isResultsCollapsed,
  setIsResultsCollapsed,
  handleCancelQuery,
  handleRunQuery,
  handleStartStep,
  inTransactionMode,
  setInTransactionMode,
  stepSession,
  autoCommit,
  setAutoCommit,
  hasActiveTransaction,
  handleCommit,
  handleRollback,
  handleExplainQuery,
  isExplaining,
  handleBenchmark,
  isRunningBenchmark,
  handleFormatQuery,
  setSaveDialogOpen,
  setShareDialogOpen,
  watchSlot,
  timeMachineSlot,
  refsSlot
}: EditorToolbarProps) {
  const executable = isExecutableTab(tab) ? tab : null
  const query = executable?.query ?? ''
  const isExecuting = executable?.isExecuting ?? false
  const hasQuery = query.trim().length > 0

  return (
    <div className="flex items-center justify-between bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setIsEditorCollapsed(!isEditorCollapsed)}
          title={isEditorCollapsed ? 'Show query editor' : 'Hide query editor'}
        >
          {isEditorCollapsed ? (
            <PanelTop className="size-3.5" />
          ) : (
            <PanelTopClose className="size-3.5" />
          )}
        </Button>
        {isExecuting ? (
          <Button
            size="sm"
            variant="destructive"
            className="gap-1.5 h-7"
            onClick={handleCancelQuery}
          >
            <Square className="size-3.5" />
            Cancel
          </Button>
        ) : (
          <Button
            size="sm"
            className="gap-1.5 h-7"
            disabled={!hasQuery}
            onClick={() => handleRunQuery()}
          >
            <Play className="size-3.5" />
            Run
            <kbd className="ml-1.5 rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
              {keys.mod}
              {keys.enter}
            </kbd>
          </Button>
        )}
        {tab.type === 'query' && tabConnection?.dbType === 'postgresql' && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={handleStartStep}
              disabled={!hasQuery || !!stepSession || isExecuting}
              className="h-7 text-xs"
            >
              <StepForward className="size-3 mr-1" />
              Step
              <kbd className="ml-2 opacity-60 text-[10px]">⇧⌘↵</kbd>
            </Button>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={inTransactionMode}
                onChange={(e) => setInTransactionMode(e.target.checked)}
                disabled={!!stepSession}
                className="size-3"
              />
              <span>Debug in transaction</span>
            </label>
          </>
        )}
        {tab.type === 'query' && tabConnection?.dbType === 'postgresql' && !stepSession && (
          <div className="flex items-center gap-2 border-l border-border/60 pl-2 ml-1">
            <label
              className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer"
              title="Automatically commit queries"
            >
              <input
                type="checkbox"
                checked={autoCommit}
                onChange={(e) => setAutoCommit(e.target.checked)}
                className="size-3"
              />
              <span>Auto-commit</span>
            </label>
            {!autoCommit && (
              <>
                <Button
                  size="sm"
                  variant={hasActiveTransaction ? 'default' : 'outline'}
                  className="h-7 text-xs gap-1.5"
                  disabled={!hasActiveTransaction}
                  onClick={handleCommit}
                >
                  <CheckCircle2 className="size-3" />
                  Commit
                </Button>
                <Button
                  size="sm"
                  variant={hasActiveTransaction ? 'destructive' : 'outline'}
                  className="h-7 text-xs gap-1.5"
                  disabled={!hasActiveTransaction}
                  onClick={handleRollback}
                >
                  <Undo2 className="size-3" />
                  Rollback
                </Button>
              </>
            )}
          </div>
        )}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-7"
                disabled={isExecuting || isExplaining || !hasQuery}
                onClick={handleExplainQuery}
              >
                {isExplaining ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <BarChart3 className="size-3.5" />
                )}
                Explain
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">Analyze query execution plan (EXPLAIN ANALYZE)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <BenchmarkButton
          onBenchmark={handleBenchmark}
          isRunning={isRunningBenchmark}
          disabled={isExecuting || !hasQuery}
        />
        {watchSlot}
        {timeMachineSlot}
        {refsSlot}
        {!isEditorCollapsed && (
          <>
            <div className="mx-1 h-4 w-px bg-border/60" />
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 h-7"
              disabled={!hasQuery}
              onClick={handleFormatQuery}
            >
              <Wand2 className="size-3.5" />
              Format
              <kbd className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                {keys.mod}
                {keys.shift}F
              </kbd>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 h-7"
              disabled={!hasQuery}
              onClick={() => setSaveDialogOpen(true)}
            >
              <Bookmark className="size-3.5" />
              Save
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 h-7"
                    disabled={!hasQuery}
                    onClick={() => setShareDialogOpen(true)}
                  >
                    <Share2 className="size-3.5" />
                    Share
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">Generate a beautiful image of your query to share</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="mx-1 h-4 w-px bg-border/60" />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className={`h-7 w-7 ${isResultsCollapsed ? 'text-primary' : ''}`}
                    onClick={() => setIsResultsCollapsed(!isResultsCollapsed)}
                  >
                    <Maximize2 className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">
                    {isResultsCollapsed
                      ? 'Restore results panel'
                      : 'Collapse results to focus on query writing'}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {isEditorCollapsed && query && (
          <code className="text-[10px] bg-muted/50 px-2 py-0.5 rounded max-w-[300px] truncate">
            {query.replace(/\s+/g, ' ').slice(0, 60)}
            {query.length > 60 ? '...' : ''}
          </code>
        )}
        <span className="flex items-center gap-1.5">
          <span
            className={`size-1.5 rounded-full ${tabConnection?.isConnected ? 'bg-green-500' : 'bg-yellow-500'}`}
          />
          {tabConnection?.name}
        </span>
      </div>
    </div>
  )
}
