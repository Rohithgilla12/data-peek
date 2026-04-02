import { useState } from 'react'
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

const SYNTAX_COLORS = {
  dark: {
    keyword: 'oklch(0.7 0.15 250)',
    function: 'oklch(0.75 0.12 330)',
    string: 'oklch(0.75 0.14 150)',
    number: 'oklch(0.75 0.13 70)',
    comment: 'oklch(0.5 0.02 250)',
    operator: 'oklch(0.65 0.1 290)',
    default: 'oklch(0.87 0 0)'
  },
  light: {
    keyword: 'oklch(0.45 0.15 250)',
    function: 'oklch(0.5 0.15 330)',
    string: 'oklch(0.45 0.15 150)',
    number: 'oklch(0.5 0.13 70)',
    comment: 'oklch(0.6 0.02 250)',
    operator: 'oklch(0.45 0.12 290)',
    default: 'oklch(0.2 0 0)'
  }
} as const

function HighlightedSQL({ sql, theme }: { sql: string; theme: 'dark' | 'light' }) {
  const tokens = tokenizeSQL(sql)
  const colors = SYNTAX_COLORS[theme]

  const getColor = (type: Token['type']) => {
    return colors[type as keyof typeof colors] ?? colors.default
  }

  const lines = sql.split('\n')
  const lineCount = lines.length

  return (
    <div className="flex font-mono text-[13px] leading-[1.7]">
      <div
        className="shrink-0 select-none pr-4 text-right"
        style={{
          color: theme === 'light' ? 'oklch(0.7 0.01 250)' : 'oklch(0.35 0.02 250)',
          width: lineCount > 99 ? '3.5ch' : '2.5ch'
        }}
        aria-hidden="true"
      >
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <div
        className="shrink-0 mr-4"
        style={{
          width: '1px',
          background: theme === 'light' ? 'oklch(0.88 0.01 250)' : 'oklch(0.25 0.02 250)'
        }}
      />
      <code className="min-w-0 flex-1 whitespace-pre-wrap break-words">
        {tokens.map((token, i) => {
          const color = getColor(token.type)
          const isKeyword = token.type === 'keyword'
          return (
            <span
              key={i}
              style={{
                color,
                fontWeight: isKeyword ? 600 : 400,
                fontStyle: token.type === 'comment' ? 'italic' : 'normal',
                ...(isKeyword && theme === 'dark'
                  ? { textShadow: `0 0 12px oklch(0.5 0.15 250 / 0.4)` }
                  : {})
              }}
            >
              {token.value}
            </span>
          )
        })}
      </code>
    </div>
  )
}

interface ShareQueryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  query: string
  connectionType?: DatabaseType
  connectionName?: string
}

function WindowChrome({
  theme,
  connectionType,
  connectionName,
  showBadge
}: {
  theme: ShareImageTheme
  connectionType?: DatabaseType
  connectionName?: string
  showBadge: boolean
}) {
  const light = theme === 'light'
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5"
      style={{
        background: light ? 'oklch(0.95 0.005 250)' : 'oklch(0.16 0.008 260)',
        borderBottom: `1px solid ${light ? 'oklch(0.88 0.01 250)' : 'oklch(0.22 0.015 250)'}`
      }}
    >
      <div className="flex items-center gap-1.5">
        <div
          className="size-3 rounded-full"
          style={{ background: light ? 'oklch(0.75 0.01 0)' : 'oklch(0.35 0.01 0)' }}
        />
        <div
          className="size-3 rounded-full"
          style={{ background: light ? 'oklch(0.75 0.01 0)' : 'oklch(0.35 0.01 0)' }}
        />
        <div
          className="size-3 rounded-full"
          style={{ background: light ? 'oklch(0.75 0.01 0)' : 'oklch(0.35 0.01 0)' }}
        />
      </div>
      {showBadge && connectionType && (
        <div
          className="flex items-center gap-1.5 font-mono text-[11px]"
          style={{
            color: light ? 'oklch(0.45 0.04 250)' : 'oklch(0.6 0.04 250)'
          }}
        >
          <DatabaseIcon dbType={connectionType} className="size-3" />
          <span>{connectionName || connectionType}</span>
        </div>
      )}
    </div>
  )
}

export function ShareQueryDialog({
  open,
  onOpenChange,
  query,
  connectionType,
  connectionName
}: ShareQueryDialogProps) {
  const [showBadge, setShowBadge] = useState(true)
  const [showLineNumbers, setShowLineNumbers] = useState(true)

  return (
    <ShareImageDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Share Query"
      description="Generate a beautiful image of your SQL query to share"
      filenamePrefix="query"
      extraOptions={
        <>
          <div className="flex items-center justify-between">
            <Label htmlFor="show-badge">Show Database Badge</Label>
            <Switch id="show-badge" checked={showBadge} onCheckedChange={setShowBadge} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="show-lines">Show Line Numbers</Label>
            <Switch
              id="show-lines"
              checked={showLineNumbers}
              onCheckedChange={setShowLineNumbers}
            />
          </div>
        </>
      }
    >
      {(theme: ShareImageTheme) => (
        <div style={{ margin: '-1.5rem', overflow: 'hidden' }}>
          <WindowChrome
            theme={theme}
            connectionType={connectionType}
            connectionName={connectionName}
            showBadge={showBadge}
          />
          <div className="p-5">
            {showLineNumbers ? (
              <HighlightedSQL sql={query} theme={theme} />
            ) : (
              <code className="font-mono text-[13px] leading-[1.7] whitespace-pre-wrap break-words">
                {tokenizeSQL(query).map((token, i) => {
                  const colors = SYNTAX_COLORS[theme]
                  const color =
                    colors[token.type as keyof typeof colors] ?? colors.default
                  const isKeyword = token.type === 'keyword'
                  return (
                    <span
                      key={i}
                      style={{
                        color,
                        fontWeight: isKeyword ? 600 : 400,
                        fontStyle: token.type === 'comment' ? 'italic' : 'normal',
                        ...(isKeyword && theme === 'dark'
                          ? { textShadow: '0 0 12px oklch(0.5 0.15 250 / 0.4)' }
                          : {})
                      }}
                    >
                      {token.value}
                    </span>
                  )
                })}
              </code>
            )}
          </div>
        </div>
      )}
    </ShareImageDialog>
  )
}
