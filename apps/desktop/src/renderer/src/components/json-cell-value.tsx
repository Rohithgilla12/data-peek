'use client'

import * as React from 'react'
import { Braces, ChevronDown, ChevronRight as ChevronRightIcon, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useSettingsStore } from '@/stores/settings-store'

// Recursive JSON tree viewer component
function JsonTreeNode({
  keyName,
  value,
  depth = 0,
  isLast = true,
  expandAll = false
}: {
  keyName?: string
  value: unknown
  depth?: number
  isLast?: boolean
  expandAll?: boolean
}) {
  const [isExpanded, setIsExpanded] = React.useState(expandAll || depth < 2)

  const isObject = value !== null && typeof value === 'object'
  const isArray = Array.isArray(value)
  const hasChildren = isObject && Object.keys(value as object).length > 0

  const getValueDisplay = () => {
    if (value === null) return <span className="text-orange-400">null</span>
    if (value === undefined) return <span className="text-muted-foreground">undefined</span>
    if (typeof value === 'boolean')
      return <span className="text-yellow-400">{value ? 'true' : 'false'}</span>
    if (typeof value === 'number') return <span className="text-blue-400">{value}</span>
    if (typeof value === 'string') {
      const truncated = value.length > 100 ? value.slice(0, 100) + '...' : value
      return <span className="text-green-400">&quot;{truncated}&quot;</span>
    }
    return null
  }

  if (!isObject) {
    return (
      <div className="flex items-start gap-1 py-0.5">
        {keyName !== undefined && (
          <>
            <span className="text-purple-400 shrink-0">&quot;{keyName}&quot;</span>
            <span className="text-muted-foreground shrink-0">:</span>
          </>
        )}
        {getValueDisplay()}
        {!isLast && <span className="text-muted-foreground">,</span>}
      </div>
    )
  }

  const entries = Object.entries(value as object)
  const bracketOpen = isArray ? '[' : '{'
  const bracketClose = isArray ? ']' : '}'

  return (
    <div className="py-0.5">
      <div className="flex items-center gap-1">
        {hasChildren && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-0.5 hover:bg-accent/50 rounded shrink-0"
          >
            {isExpanded ? (
              <ChevronDown className="size-3 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="size-3 text-muted-foreground" />
            )}
          </button>
        )}
        {!hasChildren && <span className="w-4" />}
        {keyName !== undefined && (
          <>
            <span className="text-purple-400">&quot;{keyName}&quot;</span>
            <span className="text-muted-foreground">:</span>
          </>
        )}
        <span className="text-muted-foreground">{bracketOpen}</span>
        {!isExpanded && hasChildren && (
          <>
            <span className="text-muted-foreground/50 text-xs">
              {entries.length} {isArray ? 'items' : 'keys'}
            </span>
            <span className="text-muted-foreground">{bracketClose}</span>
          </>
        )}
        {!hasChildren && <span className="text-muted-foreground">{bracketClose}</span>}
        {!isLast && !isExpanded && <span className="text-muted-foreground">,</span>}
      </div>
      {isExpanded && hasChildren && (
        <div className="ml-4 border-l border-border/30 pl-2">
          {entries.map(([k, v], idx) => (
            <JsonTreeNode
              key={k}
              keyName={isArray ? undefined : k}
              value={v}
              depth={depth + 1}
              isLast={idx === entries.length - 1}
              expandAll={expandAll}
            />
          ))}
        </div>
      )}
      {isExpanded && hasChildren && (
        <div className="flex items-center gap-1">
          <span className="w-4" />
          <span className="text-muted-foreground">{bracketClose}</span>
          {!isLast && <span className="text-muted-foreground">,</span>}
        </div>
      )}
    </div>
  )
}

// Helper to generate JSON preview text with partial content
function generateJsonPreview(value: unknown, maxLength = 50): string {
  if (value === null) return 'null'
  if (typeof value !== 'object') return String(value).slice(0, maxLength)

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const itemsStr = value
      .slice(0, 3)
      .map((v) => {
        if (v === null) return 'null'
        if (typeof v === 'string') return `"${v.slice(0, 15)}${v.length > 15 ? '...' : ''}"`
        if (typeof v === 'object') return Array.isArray(v) ? '[...]' : '{...}'
        return String(v)
      })
      .join(', ')
    const suffix = value.length > 3 ? `, ... (${value.length} items)` : ''
    return `[${itemsStr}${suffix}]`
  }

  const keys = Object.keys(value as object)
  if (keys.length === 0) return '{}'
  const previewKeys = keys.slice(0, 2)
  const entries = previewKeys.map((k) => {
    const v = (value as Record<string, unknown>)[k]
    let valStr: string
    if (v === null) valStr = 'null'
    else if (typeof v === 'string') valStr = `"${v.slice(0, 10)}${v.length > 10 ? '...' : ''}"`
    else if (typeof v === 'object') valStr = Array.isArray(v) ? '[...]' : '{...}'
    else valStr = String(v)
    return `${k}: ${valStr}`
  })
  const suffix = keys.length > 2 ? `, ... (${keys.length} keys)` : ''
  return `{${entries.join(', ')}${suffix}}`
}

// Editable JSON editor component for edit mode
export function JsonCellEditor({
  value,
  columnName,
  onSave,
  onCancel
}: {
  value: unknown
  columnName?: string
  onSave: (value: unknown) => void
  onCancel: () => void
}) {
  const expandJsonByDefault = useSettingsStore((s) => s.expandJsonByDefault)
  const [editValue, setEditValue] = React.useState(() => {
    if (typeof value === 'string') return value
    return JSON.stringify(value, null, 2)
  })
  const [error, setError] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(editValue)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSave = () => {
    if (editValue.trim() === '') {
      onSave(null)
      return
    }
    try {
      const parsed = JSON.parse(editValue)
      setError(null)
      onSave(parsed)
    } catch (e) {
      setError('Invalid JSON: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  // Parse for preview
  let parsedValue: unknown = null
  try {
    parsedValue = JSON.parse(editValue)
  } catch {
    // Keep parsedValue as null
  }

  return (
    <Sheet open={true} onOpenChange={(open) => !open && onCancel()}>
      <SheetContent side="right" className="w-[500px] sm:max-w-[500px] flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Braces className="size-4 text-amber-500" />
            Edit {columnName || 'JSON'} Data
          </SheetTitle>
          <SheetDescription>Edit JSON content in the editor below</SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-3">
          {/* Toolbar */}
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5 h-7" onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="size-3 text-green-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="size-3" />
                  Copy
                </>
              )}
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" className="h-7" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 gap-1.5" onClick={handleSave}>
              <Check className="size-3" />
              Save
            </Button>
          </div>

          {error && (
            <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {/* JSON Editor */}
          <div className="flex-1 min-h-0 overflow-auto bg-muted/30 rounded-lg border border-border/50 p-3">
            <textarea
              value={editValue}
              onChange={(e) => {
                setEditValue(e.target.value)
                setError(null)
              }}
              className="w-full h-full min-h-[200px] bg-transparent font-mono text-xs leading-relaxed resize-none focus:outline-none"
              placeholder="Enter JSON here..."
              spellCheck={false}
            />
          </div>

          {/* Live Preview */}
          {parsedValue !== null && (
            <div className="shrink-0">
              <p className="text-xs text-muted-foreground mb-1.5">Preview</p>
              <div className="max-h-32 overflow-auto bg-muted/30 rounded-lg border border-border/50 p-2">
                <div className="font-mono text-[10px]">
                  <JsonTreeNode value={parsedValue} depth={0} expandAll={expandJsonByDefault} />
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// JSON cell viewer with sheet popup
export function JsonCellValue({ value, columnName }: { value: unknown; columnName?: string }) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const expandJsonByDefault = useSettingsStore((s) => s.expandJsonByDefault)

  const handleCopy = () => {
    const jsonStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    navigator.clipboard.writeText(jsonStr)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/50 italic">NULL</span>
  }

  // Parse JSON if it's a string
  let parsedValue = value
  if (typeof value === 'string') {
    try {
      parsedValue = JSON.parse(value)
    } catch {
      parsedValue = value
    }
  }

  const isObject = parsedValue !== null && typeof parsedValue === 'object'
  const preview = isObject ? generateJsonPreview(parsedValue) : String(parsedValue)
  const fullPreview = typeof value === 'string' ? value : JSON.stringify(parsedValue, null, 2)

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsOpen(true)
              }}
              className="flex items-center gap-1.5 text-left hover:bg-accent/50 px-1.5 py-0.5 -mx-1 rounded transition-colors group"
            >
              <Braces className="size-3.5 text-amber-500 shrink-0" />
              <span className="font-mono text-xs text-muted-foreground group-hover:text-foreground truncate max-w-[200px]">
                {preview}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-md max-h-48 overflow-auto">
            <pre className="font-mono text-[10px] whitespace-pre-wrap">
              {fullPreview.length > 500 ? fullPreview.slice(0, 500) + '\n...' : fullPreview}
            </pre>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="right" className="w-[500px] sm:max-w-[500px] flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <Braces className="size-4 text-amber-500" />
              {columnName || 'JSON'} Data
            </SheetTitle>
            <SheetDescription>View and copy JSON content</SheetDescription>
          </SheetHeader>

          <div className="flex-1 min-h-0 flex flex-col gap-3">
            {/* Toolbar */}
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="gap-1.5 h-7" onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check className="size-3 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="size-3" />
                    Copy JSON
                  </>
                )}
              </Button>
            </div>

            {/* JSON Tree View */}
            <div className="flex-1 min-h-0 overflow-auto bg-muted/30 rounded-lg border border-border/50 p-3">
              <div className="font-mono text-xs leading-relaxed">
                <JsonTreeNode value={parsedValue} expandAll={expandJsonByDefault} />
              </div>
            </div>

            {/* Raw JSON */}
            <div className="shrink-0">
              <p className="text-xs text-muted-foreground mb-1.5">Raw JSON</p>
              <div className="max-h-32 overflow-auto bg-muted/30 rounded-lg border border-border/50 p-2">
                <pre className="font-mono text-[10px] text-muted-foreground whitespace-pre-wrap break-all">
                  {typeof value === 'string' ? value : JSON.stringify(parsedValue, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
