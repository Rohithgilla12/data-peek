import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ShareImageDialog, type ShareImageTheme } from '@/components/share-image-dialog'
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
  const [showBadge, setShowBadge] = useState(true)

  return (
    <ShareImageDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share Query"
      description="Generate a beautiful image of your SQL query to share"
      filenamePrefix="query"
      header={
        showBadge && connectionType
          ? (theme: ShareImageTheme) => (
              <div className="flex items-center gap-2 mb-4">
                <Badge
                  variant="secondary"
                  className={cn(
                    'gap-1.5 px-2.5 py-1',
                    theme === 'light' ? 'bg-zinc-200 text-zinc-700' : 'bg-white/20 text-white'
                  )}
                >
                  <DatabaseIcon dbType={connectionType} className="size-3.5" />
                  {connectionName || connectionType}
                </Badge>
              </div>
            )
          : undefined
      }
      extraOptions={
        <div className="flex items-center justify-between">
          <Label htmlFor="show-badge">Show Database Badge</Label>
          <Switch id="show-badge" checked={showBadge} onCheckedChange={setShowBadge} />
        </div>
      }
    >
      {(theme: ShareImageTheme) => (
        <pre className="whitespace-pre-wrap break-words">
          <HighlightedSQL sql={query} theme={theme} />
        </pre>
      )}
    </ShareImageDialog>
  )
}
