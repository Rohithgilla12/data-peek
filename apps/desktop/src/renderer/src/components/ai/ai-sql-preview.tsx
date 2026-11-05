import * as React from 'react'
import {
  CaretDownIcon,
  CaretUpIcon,
  CheckIcon,
  CodeIcon,
  CopyIcon,
  ExternalLinkIcon,
  PlayIcon,
  SpinnerIcon
} from '@/components/icons'
import { Button, cn } from '@data-peek/ui'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

interface AISQLPreviewProps {
  sql: string
  explanation?: string
  onExecute: () => void
  onOpenInTab: () => void
  isExecuting?: boolean
  /** If true, the Run Query button is hidden - user must open in tab to execute */
  requiresConfirmation?: boolean
}

// Simple SQL syntax highlighting
export function highlightSQL(sql: string): React.ReactNode[] {
  const keywords =
    /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|LIKE|BETWEEN|IS|NULL|AS|ON|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ORDER|BY|ASC|DESC|GROUP|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|CASE|WHEN|THEN|ELSE|END|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|DROP|ALTER|WITH|RETURNING|NOW|INTERVAL|COUNT|SUM|AVG|MIN|MAX|COALESCE)\b/gi
  const operators = /([=<>!]+|[-+*/%])/g
  const comments = /(--.*$|\/\*[\s\S]*?\*\/)/gm

  // Split by comments first to preserve them
  const parts = sql.split(comments)

  return parts.map((part, partIndex) => {
    if (part.match(/^--/) || part.match(/^\/\*/)) {
      return (
        <span key={partIndex} className="text-muted-foreground italic">
          {part}
        </span>
      )
    }

    // Process non-comment parts
    const tokens: React.ReactNode[] = []
    let lastIndex = 0
    const combinedRegex =
      /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|LIKE|BETWEEN|IS|NULL|AS|ON|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ORDER|BY|ASC|DESC|GROUP|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|CASE|WHEN|THEN|ELSE|END|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|DROP|ALTER|WITH|RETURNING|NOW|INTERVAL|COUNT|SUM|AVG|MIN|MAX|COALESCE)\b|('[^']*')|(\b\d+\b)|([=<>!]+|[-+*/%])/gi

    let match
    while ((match = combinedRegex.exec(part)) !== null) {
      // Add text before match
      if (match.index > lastIndex) {
        tokens.push(part.slice(lastIndex, match.index))
      }

      const [fullMatch] = match
      // Determine type and apply styling
      if (fullMatch.match(keywords)) {
        tokens.push(
          <span key={`${partIndex}-${match.index}`} className="text-cat-blue font-semibold">
            {fullMatch}
          </span>
        )
      } else if (fullMatch.startsWith("'")) {
        tokens.push(
          <span key={`${partIndex}-${match.index}`} className="text-cat-green">
            {fullMatch}
          </span>
        )
      } else if (fullMatch.match(/^\d+$/)) {
        tokens.push(
          <span key={`${partIndex}-${match.index}`} className="text-cat-orange">
            {fullMatch}
          </span>
        )
      } else if (fullMatch.match(operators)) {
        tokens.push(
          <span key={`${partIndex}-${match.index}`} className="text-cat-purple">
            {fullMatch}
          </span>
        )
      } else {
        tokens.push(fullMatch)
      }

      lastIndex = match.index + fullMatch.length
    }

    // Add remaining text
    if (lastIndex < part.length) {
      tokens.push(part.slice(lastIndex))
    }

    return <React.Fragment key={partIndex}>{tokens}</React.Fragment>
  })
}

export function AISQLPreview({
  sql,
  explanation,
  onExecute,
  onOpenInTab,
  isExecuting = false,
  requiresConfirmation = false
}: AISQLPreviewProps) {
  const { copied, copy } = useCopyToClipboard({ resetDelay: 1500 })
  const [isExpanded, setIsExpanded] = React.useState(true)

  const lines = sql.split('\n')

  return (
    <div
      className={cn(
        'relative rounded-xl overflow-hidden',
        'bg-card',
        'border border-border',
        'shadow-lg shadow-black/10'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
        <div className="flex items-center gap-2">
          <CodeIcon className="size-3.5 text-primary" />
          <span className="text-2xs font-medium text-muted-foreground">Generated SQL</span>
          {lines.length > 3 && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {isExpanded ? (
                <>
                  <CaretUpIcon className="size-3" />
                  Collapse
                </>
              ) : (
                <>
                  <CaretDownIcon className="size-3" />
                  Expand ({lines.length} lines)
                </>
              )}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => copy(sql)}
          className="flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? (
            <>
              <CheckIcon className="size-3 text-success" />
              <span className="text-success">Copied</span>
            </>
          ) : (
            <>
              <CopyIcon className="size-3" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code */}
      <div
        className={cn(
          'px-3 py-3 overflow-x-auto',
          !isExpanded && lines.length > 3 && 'max-h-[80px] overflow-hidden'
        )}
      >
        <pre className="font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap">
          {highlightSQL(sql)}
        </pre>

        {/* Gradient fade when collapsed */}
        {!isExpanded && lines.length > 3 && (
          <div className="absolute bottom-12 left-0 right-0 h-8 bg-gradient-to-t from-card to-transparent pointer-events-none" />
        )}
      </div>

      {/* Explanation */}
      {explanation && (
        <div className="px-3 py-2 border-t border-border bg-muted/40">
          <p className="font-sans text-2xs text-muted-foreground leading-relaxed">{explanation}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/40">
        {!requiresConfirmation && (
          <Button
            size="sm"
            className={cn(
              'h-7 gap-1.5 text-xs font-medium',
              'bg-primary hover:bg-primary/90',
              'transition-all duration-200'
            )}
            onClick={onExecute}
            disabled={isExecuting}
          >
            {isExecuting ? (
              <>
                <SpinnerIcon className="size-3 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <PlayIcon className="size-3" />
                Run Query
              </>
            )}
          </Button>
        )}

        <Button
          size="sm"
          variant={requiresConfirmation ? 'default' : 'ghost'}
          className={cn(
            'h-7 gap-1.5 text-xs',
            requiresConfirmation
              ? 'bg-warning text-warning-foreground hover:bg-warning/90 font-medium'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={onOpenInTab}
        >
          <ExternalLinkIcon className="size-3" />
          {requiresConfirmation ? 'Review in Tab' : 'Open in Tab'}
        </Button>
      </div>
    </div>
  )
}
