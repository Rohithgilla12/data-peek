import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ShareImageDialog, type ShareImageTheme } from '@/components/share-image-dialog'
import { DatabaseIcon } from '@/components/database-icons'
import type { DatabaseType } from '@shared/index'

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
          return 'oklch(0.7 0.15 250)'
        case 'function':
          return 'oklch(0.75 0.12 330)'
        case 'string':
          return 'oklch(0.75 0.14 150)'
        case 'number':
          return 'oklch(0.75 0.13 70)'
        case 'comment':
          return 'oklch(0.5 0.02 250)'
        case 'operator':
          return 'oklch(0.65 0.1 290)'
        default:
          return 'oklch(0.87 0 0)'
      }
    } else {
      switch (type) {
        case 'keyword':
          return 'oklch(0.45 0.15 250)'
        case 'function':
          return 'oklch(0.5 0.15 330)'
        case 'string':
          return 'oklch(0.45 0.15 150)'
        case 'number':
          return 'oklch(0.5 0.13 70)'
        case 'comment':
          return 'oklch(0.6 0.02 250)'
        case 'operator':
          return 'oklch(0.45 0.12 290)'
        default:
          return 'oklch(0.2 0 0)'
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
                  className="gap-1.5 px-2.5 py-1 font-mono text-xs"
                  style={{
                    background:
                      theme === 'light'
                        ? 'oklch(0.92 0.01 250)'
                        : 'oklch(0.25 0.03 250)',
                    color:
                      theme === 'light'
                        ? 'oklch(0.35 0.05 250)'
                        : 'oklch(0.75 0.05 250)'
                  }}
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
