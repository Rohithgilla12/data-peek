import { useState, useRef, useCallback, useEffect } from 'react'
import { toBlob } from 'html-to-image'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Copy, Download, Check, Loader2 } from 'lucide-react'
import { DatabaseIcon } from '@/components/database-icons'
import type { DatabaseType } from '@shared/index'
import { cn } from '@/lib/utils'
import { SQL_KEYWORDS as SQL_KEYWORDS_ARRAY } from '@/constants/sql-keywords'

// Additional keywords not in the shared list (window functions, MSSQL, etc.)
const EXTRA_KEYWORDS = [
  'OVER',
  'PARTITION',
  'ROWS',
  'RANGE',
  'UNBOUNDED',
  'PRECEDING',
  'FOLLOWING',
  'CURRENT',
  'ROW',
  'FETCH',
  'NEXT',
  'ONLY',
  'TOP',
  'LATERAL',
  'APPLY'
]

const SQL_KEYWORDS = new Set([...SQL_KEYWORDS_ARRAY, ...EXTRA_KEYWORDS])

const SQL_FUNCTIONS = new Set([
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'COALESCE',
  'NULLIF',
  'CAST',
  'CONVERT',
  'SUBSTRING',
  'UPPER',
  'LOWER',
  'TRIM',
  'LTRIM',
  'RTRIM',
  'LENGTH',
  'REPLACE',
  'CONCAT',
  'NOW',
  'DATE',
  'TIME',
  'DATETIME',
  'TIMESTAMP',
  'EXTRACT',
  'DATEPART',
  'DATEDIFF',
  'DATEADD',
  'ABS',
  'ROUND',
  'CEIL',
  'CEILING',
  'FLOOR',
  'RANDOM',
  'ROW_NUMBER',
  'RANK',
  'DENSE_RANK',
  'NTILE',
  'LAG',
  'LEAD',
  'FIRST_VALUE',
  'LAST_VALUE',
  'NTH_VALUE',
  'ARRAY_AGG',
  'STRING_AGG',
  'JSON_AGG',
  'JSON_BUILD_OBJECT',
  'JSON_EXTRACT',
  'JSON_ARRAY',
  'JSON_OBJECT',
  'STRFTIME',
  'PRINTF',
  'INSTR',
  'TYPEOF',
  'IIF',
  'ISNULL',
  'IFNULL',
  'GROUP_CONCAT',
  'LISTAGG'
])

type TokenType =
  | 'keyword'
  | 'function'
  | 'string'
  | 'number'
  | 'comment'
  | 'operator'
  | 'identifier'
  | 'whitespace'

interface Token {
  type: TokenType
  value: string
}

function tokenizeSQL(sql: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < sql.length) {
    // Whitespace
    if (/\s/.test(sql[i])) {
      let value = ''
      while (i < sql.length && /\s/.test(sql[i])) {
        value += sql[i]
        i++
      }
      tokens.push({ type: 'whitespace', value })
      continue
    }

    // Single-line comment
    if (sql.slice(i, i + 2) === '--') {
      let value = ''
      while (i < sql.length && sql[i] !== '\n') {
        value += sql[i]
        i++
      }
      tokens.push({ type: 'comment', value })
      continue
    }

    // Multi-line comment
    if (sql.slice(i, i + 2) === '/*') {
      let value = '/*'
      i += 2
      while (i < sql.length && sql.slice(i, i + 2) !== '*/') {
        value += sql[i]
        i++
      }
      if (i < sql.length) {
        value += '*/'
        i += 2
      }
      tokens.push({ type: 'comment', value })
      continue
    }

    // String (single or double quoted)
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i]
      let value = quote
      i++
      while (i < sql.length) {
        if (sql[i] === quote) {
          value += sql[i]
          i++
          if (sql[i] === quote) {
            // Escaped quote
            value += sql[i]
            i++
          } else {
            break
          }
        } else {
          value += sql[i]
          i++
        }
      }
      tokens.push({ type: 'string', value })
      continue
    }

    // Number
    if (/\d/.test(sql[i]) || (sql[i] === '.' && /\d/.test(sql[i + 1]))) {
      let value = ''
      while (i < sql.length && /[\d.]/.test(sql[i])) {
        value += sql[i]
        i++
      }
      tokens.push({ type: 'number', value })
      continue
    }

    // Operators and punctuation
    if (/[+\-*/%=<>!&|^~,;()[\]{}.]/.test(sql[i])) {
      let value = sql[i]
      i++
      // Handle multi-char operators
      if (i < sql.length) {
        const twoChar = value + sql[i]
        if (['<=', '>=', '<>', '!=', '||', '&&', '::'].includes(twoChar)) {
          value = twoChar
          i++
        }
      }
      tokens.push({ type: 'operator', value })
      continue
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(sql[i])) {
      let value = ''
      while (i < sql.length && /[a-zA-Z0-9_]/.test(sql[i])) {
        value += sql[i]
        i++
      }
      const upper = value.toUpperCase()
      if (SQL_KEYWORDS.has(upper)) {
        tokens.push({ type: 'keyword', value })
      } else if (SQL_FUNCTIONS.has(upper)) {
        tokens.push({ type: 'function', value })
      } else {
        tokens.push({ type: 'identifier', value })
      }
      continue
    }

    // Anything else
    tokens.push({ type: 'identifier', value: sql[i] })
    i++
  }

  return tokens
}

function HighlightedSQL({ sql, theme }: { sql: string; theme: 'dark' | 'light' }) {
  const tokens = tokenizeSQL(sql)

  const getColor = (type: Token['type']) => {
    if (theme === 'dark') {
      switch (type) {
        case 'keyword':
          return '#60a5fa' // blue-400
        case 'function':
          return '#f472b6' // pink-400
        case 'string':
          return '#4ade80' // green-400
        case 'number':
          return '#fb923c' // orange-400
        case 'comment':
          return '#6b7280' // gray-500
        case 'operator':
          return '#c084fc' // purple-400
        default:
          return '#e5e7eb' // gray-200
      }
    } else {
      switch (type) {
        case 'keyword':
          return '#2563eb' // blue-600
        case 'function':
          return '#db2777' // pink-600
        case 'string':
          return '#16a34a' // green-600
        case 'number':
          return '#ea580c' // orange-600
        case 'comment':
          return '#9ca3af' // gray-400
        case 'operator':
          return '#9333ea' // purple-600
        default:
          return '#1f2937' // gray-800
      }
    }
  }

  return (
    <code className="font-mono text-sm leading-relaxed">
      {tokens.map((token, i) => (
        <span
          key={i}
          style={{
            color: getColor(token.type),
            fontWeight: token.type === 'keyword' ? 600 : 400,
            fontStyle: token.type === 'comment' ? 'italic' : 'normal'
          }}
        >
          {token.value}
        </span>
      ))}
    </code>
  )
}

type BackgroundStyle =
  | 'gradient-blue'
  | 'gradient-purple'
  | 'gradient-green'
  | 'solid-dark'
  | 'solid-light'

interface ShareQueryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  query: string
  connectionType?: DatabaseType
  connectionName?: string
}

export function ShareQueryDialog({
  open,
  onOpenChange,
  query,
  connectionType,
  connectionName
}: ShareQueryDialogProps) {
  const renderRef = useRef<HTMLDivElement>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isCopied, setIsCopied] = useState(false)

  // Customization options
  const [showBadge, setShowBadge] = useState(true)
  const [showBranding, setShowBranding] = useState(true)
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>('gradient-blue')
  const [padding, setPadding] = useState<'compact' | 'normal' | 'spacious'>('normal')

  // Reset copy state when dialog closes
  useEffect(() => {
    if (!open) {
      setIsCopied(false)
    }
  }, [open])

  const getBackgroundClass = (style: BackgroundStyle) => {
    switch (style) {
      case 'gradient-blue':
        return 'bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800'
      case 'gradient-purple':
        return 'bg-gradient-to-br from-purple-600 via-violet-700 to-indigo-800'
      case 'gradient-green':
        return 'bg-gradient-to-br from-emerald-600 via-teal-700 to-cyan-800'
      case 'solid-dark':
        return 'bg-zinc-900'
      case 'solid-light':
        return 'bg-zinc-100'
    }
  }

  const getCodeBackgroundClass = (style: BackgroundStyle) => {
    if (style === 'solid-light') {
      return 'bg-white/90'
    }
    return 'bg-black/40'
  }

  const getPaddingClass = (p: typeof padding) => {
    switch (p) {
      case 'compact':
        return 'p-4'
      case 'normal':
        return 'p-6'
      case 'spacious':
        return 'p-10'
    }
  }

  const getCodePaddingClass = (p: typeof padding) => {
    switch (p) {
      case 'compact':
        return 'p-4'
      case 'normal':
        return 'p-6'
      case 'spacious':
        return 'p-8'
    }
  }

  const theme = backgroundStyle === 'solid-light' ? 'light' : 'dark'

  const generateImage = useCallback(async (): Promise<Blob | null> => {
    if (!renderRef.current) return null

    try {
      setIsGenerating(true)

      const blob = await toBlob(renderRef.current, {
        pixelRatio: 2 // Higher quality
      })

      return blob
    } catch (error) {
      console.error('Failed to generate image:', error)
      return null
    } finally {
      setIsGenerating(false)
    }
  }, [])

  const downloadBlob = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob)
    try {
      const a = document.createElement('a')
      a.href = url
      a.download = `query-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } finally {
      URL.revokeObjectURL(url)
    }
  }, [])

  const handleDownload = useCallback(async () => {
    const blob = await generateImage()
    if (!blob) return
    downloadBlob(blob)
  }, [generateImage, downloadBlob])

  const handleCopyToClipboard = useCallback(async () => {
    const blob = await generateImage()
    if (!blob) return

    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
      // Fallback: download the already-generated blob instead
      downloadBlob(blob)
    }
  }, [generateImage, downloadBlob])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share Query</DialogTitle>
          <DialogDescription>
            Generate a beautiful image of your SQL query to share
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Preview */}
          <div className="rounded-lg overflow-hidden border border-border/50">
            <div
              ref={renderRef}
              className={cn(
                'transition-all duration-200',
                getBackgroundClass(backgroundStyle),
                getPaddingClass(padding)
              )}
            >
              {/* Connection badge */}
              {showBadge && connectionType && (
                <div className="flex items-center gap-2 mb-4">
                  <Badge
                    variant="secondary"
                    className={cn(
                      'gap-1.5 px-2.5 py-1',
                      theme === 'light'
                        ? 'bg-zinc-200 text-zinc-700'
                        : 'bg-white/20 text-white'
                    )}
                  >
                    <DatabaseIcon dbType={connectionType} className="size-3.5" />
                    {connectionName || connectionType}
                  </Badge>
                </div>
              )}

              {/* Code block - removed backdrop-blur-sm for image export compatibility */}
              <div
                className={cn(
                  'rounded-lg',
                  getCodeBackgroundClass(backgroundStyle),
                  getCodePaddingClass(padding)
                )}
              >
                <pre className="whitespace-pre-wrap break-words">
                  <HighlightedSQL sql={query} theme={theme} />
                </pre>
              </div>

              {/* Branding */}
              {showBranding && (
                <div
                  className={cn(
                    'mt-4 flex items-center justify-end gap-2 text-xs',
                    theme === 'light' ? 'text-zinc-500' : 'text-white/60'
                  )}
                >
                  <span>Made with</span>
                  <span className="font-semibold">data-peek</span>
                </div>
              )}
            </div>
          </div>

          {/* Options */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Background</Label>
                <Select
                  value={backgroundStyle}
                  onValueChange={(v) => setBackgroundStyle(v as BackgroundStyle)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gradient-blue">Blue Gradient</SelectItem>
                    <SelectItem value="gradient-purple">Purple Gradient</SelectItem>
                    <SelectItem value="gradient-green">Green Gradient</SelectItem>
                    <SelectItem value="solid-dark">Solid Dark</SelectItem>
                    <SelectItem value="solid-light">Solid Light</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Padding</Label>
                <Select
                  value={padding}
                  onValueChange={(v) => setPadding(v as typeof padding)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="spacious">Spacious</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="show-badge">Show Database Badge</Label>
                <Switch id="show-badge" checked={showBadge} onCheckedChange={setShowBadge} />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="show-branding">Show Branding</Label>
                <Switch
                  id="show-branding"
                  checked={showBranding}
                  onCheckedChange={setShowBranding}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={handleDownload}
              disabled={isGenerating}
              className="gap-2"
            >
              {isGenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Save as PNG
            </Button>
            <Button onClick={handleCopyToClipboard} disabled={isGenerating} className="gap-2">
              {isGenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : isCopied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
              {isCopied ? 'Copied!' : 'Copy to Clipboard'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
