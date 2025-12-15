import { useState } from 'react'
import {
  X,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
  Repeat
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PerfIssueCard } from './perf-issue-card'
import type { PerformanceAnalysisResult, NplusOnePattern } from '@data-peek/shared'

interface PerfIndicatorPanelProps {
  analysis: PerformanceAnalysisResult
  onClose: () => void
  onReanalyze: () => void
  isAnalyzing: boolean
  showCritical: boolean
  showWarning: boolean
  showInfo: boolean
  onToggleSeverity: (severity: 'critical' | 'warning' | 'info') => void
}

export function PerfIndicatorPanel({
  analysis,
  onClose,
  onReanalyze,
  isAnalyzing,
  showCritical,
  showWarning,
  showInfo,
  onToggleSeverity
}: PerfIndicatorPanelProps) {
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null)
  const [showNplusOne, setShowNplusOne] = useState(true)

  // Filter issues by selected severity
  const filteredIssues = analysis.issues.filter((issue) => {
    if (issue.severity === 'critical' && !showCritical) return false
    if (issue.severity === 'warning' && !showWarning) return false
    if (issue.severity === 'info' && !showInfo) return false
    return true
  })

  const totalIssues =
    analysis.issueCount.critical + analysis.issueCount.warning + analysis.issueCount.info

  return (
    <div className="border-t border-border/60 bg-gradient-to-b from-card/95 to-muted/30 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Performance Analysis</span>

          {/* Severity filter badges */}
          <div className="flex items-center gap-1.5">
            {analysis.issueCount.critical > 0 && (
              <Badge
                variant="secondary"
                className={cn(
                  'h-5 px-1.5 text-[10px] cursor-pointer transition-opacity',
                  'bg-red-500/20 text-red-500 hover:bg-red-500/30',
                  !showCritical && 'opacity-40'
                )}
                onClick={() => onToggleSeverity('critical')}
              >
                <AlertCircle className="size-3 mr-0.5" />
                {analysis.issueCount.critical}
              </Badge>
            )}
            {analysis.issueCount.warning > 0 && (
              <Badge
                variant="secondary"
                className={cn(
                  'h-5 px-1.5 text-[10px] cursor-pointer transition-opacity',
                  'bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30',
                  !showWarning && 'opacity-40'
                )}
                onClick={() => onToggleSeverity('warning')}
              >
                <AlertTriangle className="size-3 mr-0.5" />
                {analysis.issueCount.warning}
              </Badge>
            )}
            {analysis.issueCount.info > 0 && (
              <Badge
                variant="secondary"
                className={cn(
                  'h-5 px-1.5 text-[10px] cursor-pointer transition-opacity',
                  'bg-blue-500/20 text-blue-500 hover:bg-blue-500/30',
                  !showInfo && 'opacity-40'
                )}
                onClick={() => onToggleSeverity('info')}
              >
                <Info className="size-3 mr-0.5" />
                {analysis.issueCount.info}
              </Badge>
            )}
          </div>

          {totalIssues === 0 && (
            <span className="text-xs text-green-500 font-medium">No issues found</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Analyzed in {analysis.durationMs.toFixed(0)}ms
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5"
            onClick={onReanalyze}
            disabled={isAnalyzing}
          >
            <RefreshCw className={cn('size-3.5', isAnalyzing && 'animate-spin')} />
            Re-analyze
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-h-72 overflow-auto">
        {/* Issues List */}
        {filteredIssues.length > 0 && (
          <div className="px-4 py-3 space-y-2">
            {filteredIssues.map((issue) => (
              <PerfIssueCard
                key={issue.id}
                issue={issue}
                isExpanded={expandedIssueId === issue.id}
                onToggle={() => setExpandedIssueId(expandedIssueId === issue.id ? null : issue.id)}
              />
            ))}
          </div>
        )}

        {/* N+1 Patterns Section */}
        {analysis.nplusOnePatterns.length > 0 && (
          <div className="border-t border-border/40">
            <button
              className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors"
              onClick={() => setShowNplusOne(!showNplusOne)}
            >
              <Repeat className="size-4 text-yellow-500" />
              <span className="text-sm font-medium">N+1 Query Patterns</span>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {analysis.nplusOnePatterns.length}
              </Badge>
              <div className="flex-1" />
              {showNplusOne ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
            </button>

            {showNplusOne && (
              <div className="px-4 pb-3 space-y-2">
                {analysis.nplusOnePatterns.map((pattern, i) => (
                  <NplusOneCard key={i} pattern={pattern} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {totalIssues === 0 && analysis.nplusOnePatterns.length === 0 && (
          <div className="px-4 py-8 text-center">
            <div className="size-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
              <svg
                className="size-6 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-green-500">Query looks good!</p>
            <p className="text-xs text-muted-foreground mt-1">
              No performance issues detected in this query.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

interface NplusOneCardProps {
  pattern: NplusOnePattern
}

function NplusOneCard({ pattern }: NplusOneCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-yellow-500/30 bg-yellow-500/5 rounded-md overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Repeat className="size-4 text-yellow-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{pattern.occurrences} similar queries</span>
            {pattern.tableName && (
              <span className="text-xs text-muted-foreground">on {pattern.tableName}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate font-mono mt-0.5">
            {pattern.queryTemplate}
          </p>
        </div>
        {expanded ? (
          <ChevronDown className="size-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/30">
          <p className="text-xs text-muted-foreground">
            This query pattern was executed {pattern.occurrences} times within{' '}
            {pattern.timeWindowMs}ms. Consider using a JOIN or batch query instead.
          </p>
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Sample Queries</div>
            {pattern.querySamples.map((query, i) => (
              <pre
                key={i}
                className="text-[11px] bg-muted/50 rounded p-1.5 overflow-x-auto font-mono text-muted-foreground"
              >
                {query}
              </pre>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
