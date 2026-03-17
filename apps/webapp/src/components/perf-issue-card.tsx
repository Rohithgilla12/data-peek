import { useState } from 'react'
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Database,
  Clock,
  Repeat
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { PerformanceIssue, PerformanceIssueType } from '@data-peek/shared'

interface PerfIssueCardProps {
  issue: PerformanceIssue
  isExpanded?: boolean
  onToggle?: () => void
}

const ISSUE_TYPE_LABELS: Record<PerformanceIssueType, string> = {
  missing_index: 'Missing Index',
  n_plus_one: 'N+1 Pattern',
  slow_query: 'Slow Query',
  high_filter_ratio: 'High Filter Ratio',
  row_estimate_off: 'Row Estimate Mismatch',
  disk_spill: 'Disk Spill'
}

const ISSUE_TYPE_ICONS: Record<PerformanceIssueType, React.ElementType> = {
  missing_index: Database,
  n_plus_one: Repeat,
  slow_query: Clock,
  high_filter_ratio: AlertTriangle,
  row_estimate_off: Info,
  disk_spill: AlertCircle
}

export function PerfIssueCard({ issue, isExpanded = false, onToggle }: PerfIssueCardProps) {
  const [copied, setCopied] = useState(false)

  const severityClasses = {
    critical: 'border-red-500/30 bg-red-500/5',
    warning: 'border-yellow-500/30 bg-yellow-500/5',
    info: 'border-blue-500/30 bg-blue-500/5'
  }

  const severityIconClasses = {
    critical: 'text-red-500',
    warning: 'text-yellow-500',
    info: 'text-blue-500'
  }

  const SeverityIcon =
    issue.severity === 'critical'
      ? AlertCircle
      : issue.severity === 'warning'
        ? AlertTriangle
        : Info

  const TypeIcon = ISSUE_TYPE_ICONS[issue.type]

  const handleCopyIndex = async () => {
    if (issue.indexSuggestion) {
      await navigator.clipboard.writeText(issue.indexSuggestion)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div
      className={cn(
        'border rounded-md overflow-hidden transition-colors',
        severityClasses[issue.severity]
      )}
    >
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <SeverityIcon className={cn('size-4 shrink-0', severityIconClasses[issue.severity])} />
        <TypeIcon className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{issue.title}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {ISSUE_TYPE_LABELS[issue.type]}
            </span>
          </div>
        </div>
        {isExpanded ? (
          <ChevronDown className="size-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/30">
          <p className="text-sm text-muted-foreground">{issue.message}</p>

          {issue.suggestion && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Suggestion</div>
              <p className="text-sm">{issue.suggestion}</p>
            </div>
          )}

          {issue.tableName && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>
                <span className="font-medium">Table:</span> {issue.tableName}
              </span>
              {issue.columnName && (
                <span>
                  <span className="font-medium">Column:</span> {issue.columnName}
                </span>
              )}
            </div>
          )}

          {issue.indexSuggestion && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Suggested Index</div>
              <div className="relative">
                <pre className="text-xs bg-muted/50 rounded p-2 pr-10 overflow-x-auto font-mono">
                  {issue.indexSuggestion}
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-1 right-1 h-6 w-6 p-0"
                  onClick={handleCopyIndex}
                >
                  {copied ? (
                    <Check className="size-3 text-green-500" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {issue.relatedQueries && issue.relatedQueries.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">
                Sample Queries ({issue.relatedQueries.length})
              </div>
              <div className="space-y-1">
                {issue.relatedQueries.slice(0, 3).map((query, i) => (
                  <pre
                    key={i}
                    className="text-[11px] bg-muted/50 rounded p-1.5 overflow-x-auto font-mono text-muted-foreground truncate"
                  >
                    {query}
                  </pre>
                ))}
              </div>
            </div>
          )}

          {issue.threshold !== undefined && issue.actualValue !== undefined && (
            <div className="flex items-center gap-4 text-xs">
              <span className="text-muted-foreground">
                <span className="font-medium">Threshold:</span> {issue.threshold}ms
              </span>
              <span
                className={cn(
                  'font-medium',
                  issue.actualValue > issue.threshold ? 'text-red-500' : 'text-muted-foreground'
                )}
              >
                <span className="font-medium">Actual:</span> {issue.actualValue.toFixed(2)}ms
              </span>
            </div>
          )}

          {issue.planNodeType && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Plan Node:</span> {issue.planNodeType}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
