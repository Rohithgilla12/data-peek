'use client'

import * as React from 'react'
import {
  Play,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Code2,
  Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'

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
function highlightSQL(sql: string): React.ReactNode[] {
  const keywords =
    /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|LIKE|BETWEEN|IS|NULL|AS|ON|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ORDER|BY|ASC|DESC|GROUP|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|CASE|WHEN|THEN|ELSE|END|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|DROP|ALTER|WITH|RETURNING|NOW|INTERVAL|COUNT|SUM|AVG|MIN|MAX|COALESCE)\b/gi
  const operators = /([=<>!]+|[-+*/%])/g
  const comments = /(--.*$|\/\*[\s\S]*?\*\/)/gm

  // Split by comments first to preserve them
  const parts = sql.split(comments)

  return parts.map((part, partIndex) => {
    if (part.match(/^--/) || part.match(/^\/\*/)) {
      return (
        <span key={partIndex} className="text-zinc-500 italic">
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
          <span key={`${partIndex}-${match.index}`} className="text-blue-400 font-semibold">
            {fullMatch}
          </span>
        )
      } else if (fullMatch.startsWith("'")) {
        tokens.push(
          <span key={`${partIndex}-${match.index}`} className="text-emerald-400">
            {fullMatch}
          </span>
        )
      } else if (fullMatch.match(/^\d+$/)) {
        tokens.push(
          <span key={`${partIndex}-${match.index}`} className="text-amber-400">
            {fullMatch}
          </span>
        )
      } else if (fullMatch.match(operators)) {
        tokens.push(
          <span key={`${partIndex}-${match.index}`} className="text-purple-400">
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
        'bg-gradient-to-b from-zinc-900/80 to-zinc-900/60',
        'border border-zinc-800/80',
        'shadow-lg shadow-black/10'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/50 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <Code2 className="size-3.5 text-blue-400" />
          <span className="text-[11px] font-medium text-zinc-400">Generated SQL</span>
          {lines.length > 3 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="size-3" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="size-3" />
                  Expand ({lines.length} lines)
                </>
              )}
            </button>
          )}
        </div>

        <button
          onClick={() => copy(sql)}
          className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {copied ? (
            <>
              <Check className="size-3 text-green-500" />
              <span className="text-green-500">Copied</span>
            </>
          ) : (
            <>
              <Copy className="size-3" />
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
        <pre className="font-mono text-xs leading-relaxed text-zinc-300 whitespace-pre-wrap">
          {highlightSQL(sql)}
        </pre>

        {/* Gradient fade when collapsed */}
        {!isExpanded && lines.length > 3 && (
          <div className="absolute bottom-12 left-0 right-0 h-8 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none" />
        )}
      </div>

      {/* Explanation */}
      {explanation && (
        <div className="px-3 py-2 border-t border-zinc-800/30 bg-zinc-900/30">
          <p className="text-[11px] text-zinc-400 leading-relaxed">{explanation}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-zinc-800/50 bg-zinc-900/30">
        {!requiresConfirmation && (
          <Button
            size="sm"
            className={cn(
              'h-7 gap-1.5 text-xs font-medium',
              'bg-gradient-to-r from-blue-500 to-blue-600',
              'hover:from-blue-600 hover:to-blue-700',
              'shadow-md shadow-blue-500/20',
              'transition-all duration-200'
            )}
            onClick={onExecute}
            disabled={isExecuting}
          >
            {isExecuting ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="size-3" />
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
              ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-medium'
              : 'text-zinc-400 hover:text-zinc-200'
          )}
          onClick={onOpenInTab}
        >
          <ExternalLink className="size-3" />
          {requiresConfirmation ? 'Review in Tab' : 'Open in Tab'}
        </Button>
      </div>
    </div>
  )
}
