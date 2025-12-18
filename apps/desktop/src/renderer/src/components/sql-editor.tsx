import * as React from 'react'
import Editor, { loader, type Monaco, type OnMount } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { formatSQL } from '@/lib/sql-formatter'
import { cn } from '@/lib/utils'
import { useTheme } from '@/components/theme-provider'
import type { SchemaInfo, TableInfo } from '@data-peek/shared'

// Configure Monaco workers for Vite + Electron (avoids CSP issues)
self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker()
  }
}

// Configure Monaco to use local files instead of CDN (required for Electron CSP)
loader.config({ monaco })

type EditorType = monaco.editor.IStandaloneCodeEditor

// SQL Keywords for autocomplete
const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'AND',
  'OR',
  'NOT',
  'IN',
  'LIKE',
  'BETWEEN',
  'IS',
  'NULL',
  'TRUE',
  'FALSE',
  'AS',
  'ON',
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'OUTER',
  'FULL',
  'CROSS',
  'NATURAL',
  'USING',
  'ORDER',
  'BY',
  'ASC',
  'DESC',
  'NULLS',
  'FIRST',
  'LAST',
  'GROUP',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'UNION',
  'ALL',
  'INTERSECT',
  'EXCEPT',
  'DISTINCT',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'CAST',
  'INSERT',
  'INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE',
  'CREATE',
  'TABLE',
  'INDEX',
  'VIEW',
  'DROP',
  'ALTER',
  'ADD',
  'COLUMN',
  'PRIMARY',
  'KEY',
  'FOREIGN',
  'REFERENCES',
  'CONSTRAINT',
  'UNIQUE',
  'CHECK',
  'DEFAULT',
  'CASCADE',
  'RESTRICT',
  'TRUNCATE',
  'EXISTS',
  'WITH',
  'RECURSIVE',
  'RETURNING',
  'EXPLAIN',
  'ANALYZE',
  'VACUUM',
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
  'TRANSACTION',
  'SAVEPOINT',
  'RELEASE',
  'TEMPORARY',
  'TEMP',
  'IF',
  'REPLACE',
  'IGNORE'
]

// SQL Functions for autocomplete
const SQL_FUNCTIONS = [
  // Aggregate functions
  { name: 'COUNT', signature: 'COUNT(expression)', description: 'Returns the number of rows' },
  { name: 'SUM', signature: 'SUM(expression)', description: 'Returns the sum of values' },
  { name: 'AVG', signature: 'AVG(expression)', description: 'Returns the average value' },
  { name: 'MIN', signature: 'MIN(expression)', description: 'Returns the minimum value' },
  { name: 'MAX', signature: 'MAX(expression)', description: 'Returns the maximum value' },
  {
    name: 'GROUP_CONCAT',
    signature: 'GROUP_CONCAT(expression)',
    description: 'Concatenates values from a group'
  },
  // String functions
  { name: 'CONCAT', signature: 'CONCAT(str1, str2, ...)', description: 'Concatenates strings' },
  {
    name: 'SUBSTRING',
    signature: 'SUBSTRING(str, start, length)',
    description: 'Extracts a substring'
  },
  { name: 'UPPER', signature: 'UPPER(str)', description: 'Converts to uppercase' },
  { name: 'LOWER', signature: 'LOWER(str)', description: 'Converts to lowercase' },
  { name: 'TRIM', signature: 'TRIM(str)', description: 'Removes leading/trailing whitespace' },
  { name: 'LENGTH', signature: 'LENGTH(str)', description: 'Returns string length' },
  { name: 'REPLACE', signature: 'REPLACE(str, from, to)', description: 'Replaces occurrences' },
  {
    name: 'COALESCE',
    signature: 'COALESCE(val1, val2, ...)',
    description: 'Returns first non-null value'
  },
  {
    name: 'NULLIF',
    signature: 'NULLIF(val1, val2)',
    description: 'Returns null if values are equal'
  },
  { name: 'IFNULL', signature: 'IFNULL(val, default)', description: 'Returns default if null' },
  // Date functions
  { name: 'NOW', signature: 'NOW()', description: 'Returns current timestamp' },
  { name: 'DATE', signature: 'DATE(expression)', description: 'Extracts date part' },
  { name: 'TIME', signature: 'TIME(expression)', description: 'Extracts time part' },
  { name: 'DATETIME', signature: 'DATETIME(expression)', description: 'Creates datetime value' },
  { name: 'STRFTIME', signature: 'STRFTIME(format, datetime)', description: 'Formats datetime' },
  // Math functions
  { name: 'ABS', signature: 'ABS(number)', description: 'Returns absolute value' },
  { name: 'ROUND', signature: 'ROUND(number, decimals)', description: 'Rounds a number' },
  { name: 'CEIL', signature: 'CEIL(number)', description: 'Rounds up to nearest integer' },
  { name: 'FLOOR', signature: 'FLOOR(number)', description: 'Rounds down to nearest integer' },
  { name: 'RANDOM', signature: 'RANDOM()', description: 'Returns random number' },
  // Type functions
  { name: 'TYPEOF', signature: 'TYPEOF(expression)', description: 'Returns the type of value' },
  {
    name: 'CAST',
    signature: 'CAST(expression AS type)',
    description: 'Converts to specified type'
  },
  // SQLite specific
  { name: 'PRINTF', signature: 'PRINTF(format, ...)', description: 'Formatted string output' },
  { name: 'INSTR', signature: 'INSTR(str, substr)', description: 'Returns position of substring' },
  { name: 'GLOB', signature: 'GLOB(pattern, str)', description: 'Pattern matching with glob' },
  { name: 'HEX', signature: 'HEX(value)', description: 'Returns hex representation' },
  { name: 'QUOTE', signature: 'QUOTE(value)', description: 'Returns SQL literal' },
  { name: 'ZEROBLOB', signature: 'ZEROBLOB(n)', description: 'Returns n-byte blob of zeros' },
  { name: 'JSON', signature: 'JSON(value)', description: 'Validates and minifies JSON' },
  {
    name: 'JSON_EXTRACT',
    signature: 'JSON_EXTRACT(json, path)',
    description: 'Extracts value from JSON'
  },
  { name: 'JSON_ARRAY', signature: 'JSON_ARRAY(...)', description: 'Creates JSON array' },
  { name: 'JSON_OBJECT', signature: 'JSON_OBJECT(...)', description: 'Creates JSON object' }
]

// SQL Data types
const SQL_TYPES = [
  'INTEGER',
  'INT',
  'SMALLINT',
  'BIGINT',
  'TINYINT',
  'REAL',
  'FLOAT',
  'DOUBLE',
  'DECIMAL',
  'NUMERIC',
  'TEXT',
  'VARCHAR',
  'CHAR',
  'CLOB',
  'STRING',
  'BLOB',
  'BINARY',
  'VARBINARY',
  'BOOLEAN',
  'BOOL',
  'DATE',
  'TIME',
  'DATETIME',
  'TIMESTAMP',
  'JSON',
  'UUID'
]

// Singleton state for the completion provider
// This prevents duplicate suggestions when multiple editor instances exist
let globalCompletionProvider: monaco.IDisposable | null = null
let currentSchemas: SchemaInfo[] = []

// Update schemas for the global completion provider
const updateCompletionSchemas = (schemas: SchemaInfo[]) => {
  currentSchemas = schemas
}

// SQL reserved keywords that should not be treated as table aliases
const SQL_RESERVED_KEYWORDS = new Set([
  'on',
  'where',
  'and',
  'or',
  'not',
  'in',
  'is',
  'null',
  'like',
  'between',
  'exists',
  'case',
  'when',
  'then',
  'else',
  'end',
  'left',
  'right',
  'inner',
  'outer',
  'full',
  'cross',
  'join',
  'natural',
  'using',
  'order',
  'group',
  'by',
  'having',
  'limit',
  'offset',
  'union',
  'intersect',
  'except',
  'all',
  'distinct',
  'as',
  'set',
  'values',
  'into',
  'returning',
  'with',
  'recursive'
])

/**
 * Extract table aliases from SQL query text
 * Parses FROM and JOIN clauses to build a map of alias -> table name
 * Note: Does not support quoted identifiers (e.g., "schema"."table")
 * @param queryText - The full SQL query text
 * @returns Map of alias (lowercase) to table name (with schema if present)
 */
const extractTableAliases = (queryText: string): Map<string, string> => {
  const aliases = new Map<string, string>()

  // Normalize whitespace for matching
  const normalized = queryText.replace(/\s+/g, ' ').trim()

  // Pattern to match: FROM/JOIN [schema.]table [AS] alias
  // Handles:
  // - FROM table_name alias
  // - FROM table_name AS alias
  // - FROM schema.table_name alias
  // - FROM schema.table_name AS alias
  // - JOIN table_name alias
  // - JOIN table_name AS alias
  // - JOIN schema.table_name alias
  // - JOIN schema.table_name AS alias
  // Also handles LEFT/RIGHT/INNER/OUTER/FULL/CROSS JOIN variants
  const fromJoinPattern =
    /\b(?:FROM|JOIN|LEFT\s+(?:OUTER\s+)?JOIN|RIGHT\s+(?:OUTER\s+)?JOIN|INNER\s+JOIN|FULL\s+(?:OUTER\s+)?JOIN|CROSS\s+JOIN)\s+([\w.]+)\s+(?:AS\s+)?(\w+)\b/gi

  let match: string[] | null
  while ((match = fromJoinPattern.exec(normalized)) !== null) {
    const tableRef = match[1]
    const alias = match[2].toLowerCase()

    // Only add if alias is a valid identifier and not a SQL keyword
    if (alias && /^[a-zA-Z_]\w*$/.test(alias) && !SQL_RESERVED_KEYWORDS.has(alias)) {
      aliases.set(alias, tableRef)
    }
  }

  return aliases
}

// Register SQL completion provider once globally
const ensureCompletionProvider = (monacoInstance: Monaco): void => {
  // Only register once
  if (globalCompletionProvider) {
    return
  }

  globalCompletionProvider = monacoInstance.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: [' ', '.', '(', ','],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }

      // Get the text before cursor to detect context (e.g., after ".")
      const lineContent = model.getLineContent(position.lineNumber)
      const textBeforeCursor = lineContent.substring(0, position.column - 1)
      const dotMatch = textBeforeCursor.match(/(\w+)\.\s*$/)

      const suggestions: monaco.languages.CompletionItem[] = []

      // If after a dot, suggest columns for that table
      if (dotMatch) {
        const tableOrSchemaName = dotMatch[1].toLowerCase()

        // Check if it's a schema name - suggest tables
        const matchingSchema = currentSchemas.find(
          (s) => s.name.toLowerCase() === tableOrSchemaName
        )
        if (matchingSchema) {
          matchingSchema.tables.forEach((table) => {
            suggestions.push({
              label: table.name,
              kind:
                table.type === 'view'
                  ? monacoInstance.languages.CompletionItemKind.Interface
                  : monacoInstance.languages.CompletionItemKind.Class,
              insertText: table.name,
              range,
              detail: `${table.type} (${table.columns.length} columns)`,
              documentation: table.columns.map((c) => `${c.name}: ${c.dataType}`).join('\n'),
              sortText: '0' + table.name
            })
          })
          return { suggestions }
        }

        // Check if it's a table name - suggest columns
        for (const schema of currentSchemas) {
          const matchingTable = schema.tables.find(
            (t) => t.name.toLowerCase() === tableOrSchemaName
          )
          if (matchingTable) {
            matchingTable.columns.forEach((column) => {
              const pkIndicator = column.isPrimaryKey ? ' 🔑' : ''
              suggestions.push({
                label: column.name,
                kind: monacoInstance.languages.CompletionItemKind.Field,
                insertText: column.name,
                range,
                detail: `${column.dataType}${column.isNullable ? '' : ' NOT NULL'}${pkIndicator}`,
                documentation: `Column in ${matchingTable.name}\nType: ${column.dataType}\nNullable: ${column.isNullable}\nPrimary Key: ${column.isPrimaryKey}`,
                sortText: String(column.ordinalPosition).padStart(3, '0')
              })
            })
            return { suggestions }
          }
        }

        // Check if it's a table alias - extract aliases from the full query
        const fullQueryText = model.getValue()
        const aliases = extractTableAliases(fullQueryText)

        if (aliases.has(tableOrSchemaName)) {
          const tableRef = aliases.get(tableOrSchemaName)!
          // Extract table name (remove schema prefix if present)
          const tableNameParts = tableRef.split('.')
          const tableName = tableNameParts[tableNameParts.length - 1].toLowerCase()
          const schemaName = tableNameParts.length > 1 ? tableNameParts[0].toLowerCase() : null

          // Helper to build column suggestions for a matched table
          const buildColumnSuggestions = (
            table: TableInfo,
            displayPath: string
          ): monaco.languages.CompletionItem[] => {
            return table.columns.map((column) => {
              const pkIndicator = column.isPrimaryKey ? ' 🔑' : ''
              return {
                label: column.name,
                kind: monacoInstance.languages.CompletionItemKind.Field,
                insertText: column.name,
                range,
                detail: `${column.dataType}${column.isNullable ? '' : ' NOT NULL'}${pkIndicator}`,
                documentation: `Column in ${displayPath} (via alias ${tableOrSchemaName})\nType: ${column.dataType}\nNullable: ${column.isNullable}\nPrimary Key: ${column.isPrimaryKey}`,
                sortText: String(column.ordinalPosition).padStart(3, '0')
              }
            })
          }

          // Search for the table - prioritize schema-qualified match if schema was specified
          for (const schema of currentSchemas) {
            // If schema was specified in the alias reference, only match that schema
            if (schemaName && schema.name.toLowerCase() !== schemaName) {
              continue
            }

            const matchingTable = schema.tables.find((t) => t.name.toLowerCase() === tableName)
            if (matchingTable) {
              const displayPath = schemaName
                ? `${schema.name}.${matchingTable.name}`
                : matchingTable.name
              suggestions.push(...buildColumnSuggestions(matchingTable, displayPath))
              return { suggestions }
            }
          }
        }
      }

      // Add keywords
      SQL_KEYWORDS.forEach((keyword) => {
        suggestions.push({
          label: keyword,
          kind: monacoInstance.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          range,
          detail: 'Keyword',
          sortText: '1' + keyword
        })
      })

      // Add functions with snippets
      SQL_FUNCTIONS.forEach((fn) => {
        suggestions.push({
          label: fn.name,
          kind: monacoInstance.languages.CompletionItemKind.Function,
          insertText: fn.name + '($0)',
          insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          detail: fn.signature,
          documentation: fn.description,
          sortText: '2' + fn.name
        })
      })

      // Add data types
      SQL_TYPES.forEach((type) => {
        suggestions.push({
          label: type,
          kind: monacoInstance.languages.CompletionItemKind.TypeParameter,
          insertText: type,
          range,
          detail: 'Data Type',
          sortText: '3' + type
        })
      })

      // Add schema names
      currentSchemas.forEach((schema) => {
        suggestions.push({
          label: schema.name,
          kind: monacoInstance.languages.CompletionItemKind.Module,
          insertText: schema.name,
          range,
          detail: `Schema (${schema.tables.length} tables)`,
          sortText: '0a' + schema.name
        })
      })

      // Add table names (with schema prefix for non-public)
      currentSchemas.forEach((schema) => {
        schema.tables.forEach((table) => {
          const isPublic = schema.name === 'public'
          const insertText = isPublic ? table.name : `${schema.name}.${table.name}`
          const labelSuffix = isPublic ? '' : ` (${schema.name})`

          suggestions.push({
            label: table.name + labelSuffix,
            kind:
              table.type === 'view'
                ? monacoInstance.languages.CompletionItemKind.Interface
                : monacoInstance.languages.CompletionItemKind.Class,
            insertText: insertText,
            range,
            detail: `${table.type} (${table.columns.length} columns)`,
            documentation:
              table.columns
                .slice(0, 10)
                .map((c) => `${c.isPrimaryKey ? '🔑 ' : ''}${c.name}: ${c.dataType}`)
                .join('\n') +
              (table.columns.length > 10 ? `\n... and ${table.columns.length - 10} more` : ''),
            sortText: '0b' + table.name
          })
        })
      })

      return { suggestions }
    }
  })
}

export interface SQLEditorProps {
  value: string
  onChange?: (value: string) => void
  onRun?: () => void
  onFormat?: () => void
  readOnly?: boolean
  height?: string | number
  minHeight?: string | number
  className?: string
  placeholder?: string
  compact?: boolean
  /** Database schemas for autocomplete (tables, columns) */
  schemas?: SchemaInfo[]
}

// Custom dark theme inspired by the app's aesthetic
const defineCustomTheme = (monaco: Monaco) => {
  monaco.editor.defineTheme('data-peek-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '60a5fa', fontStyle: 'bold' }, // blue-400
      { token: 'keyword.sql', foreground: '60a5fa', fontStyle: 'bold' },
      { token: 'operator.sql', foreground: 'c084fc' }, // purple-400
      { token: 'string', foreground: '4ade80' }, // green-400
      { token: 'string.sql', foreground: '4ade80' },
      { token: 'number', foreground: 'fb923c' }, // orange-400
      { token: 'number.sql', foreground: 'fb923c' },
      { token: 'comment', foreground: '6b7280', fontStyle: 'italic' }, // gray-500
      { token: 'comment.sql', foreground: '6b7280', fontStyle: 'italic' },
      { token: 'identifier', foreground: 'e5e7eb' }, // gray-200
      { token: 'predefined.sql', foreground: 'f472b6' }, // pink-400
      { token: 'type', foreground: 'fbbf24' } // amber-400
    ],
    colors: {
      'editor.background': '#0a0a0a',
      'editor.foreground': '#e5e7eb',
      'editor.lineHighlightBackground': '#1f1f2310',
      'editor.selectionBackground': '#3b82f640',
      'editor.inactiveSelectionBackground': '#3b82f620',
      'editorCursor.foreground': '#60a5fa',
      'editorLineNumber.foreground': '#4b5563',
      'editorLineNumber.activeForeground': '#9ca3af',
      'editor.selectionHighlightBackground': '#3b82f620',
      'editorIndentGuide.background': '#27272a',
      'editorIndentGuide.activeBackground': '#3f3f46',
      'editorBracketMatch.background': '#3b82f630',
      'editorBracketMatch.border': '#3b82f6',
      'scrollbarSlider.background': '#27272a80',
      'scrollbarSlider.hoverBackground': '#3f3f4680',
      'scrollbarSlider.activeBackground': '#52525b80'
    }
  })

  monaco.editor.defineTheme('data-peek-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '2563eb', fontStyle: 'bold' }, // blue-600
      { token: 'keyword.sql', foreground: '2563eb', fontStyle: 'bold' },
      { token: 'operator.sql', foreground: '9333ea' }, // purple-600
      { token: 'string', foreground: '16a34a' }, // green-600
      { token: 'string.sql', foreground: '16a34a' },
      { token: 'number', foreground: 'ea580c' }, // orange-600
      { token: 'number.sql', foreground: 'ea580c' },
      { token: 'comment', foreground: '9ca3af', fontStyle: 'italic' }, // gray-400
      { token: 'comment.sql', foreground: '9ca3af', fontStyle: 'italic' },
      { token: 'identifier', foreground: '1f2937' }, // gray-800
      { token: 'predefined.sql', foreground: 'db2777' }, // pink-600
      { token: 'type', foreground: 'd97706' } // amber-600
    ],
    colors: {
      'editor.background': '#fafafa',
      'editor.foreground': '#1f2937',
      'editor.lineHighlightBackground': '#f4f4f510',
      'editor.selectionBackground': '#3b82f630',
      'editor.inactiveSelectionBackground': '#3b82f615',
      'editorCursor.foreground': '#2563eb',
      'editorLineNumber.foreground': '#d1d5db',
      'editorLineNumber.activeForeground': '#6b7280',
      'editor.selectionHighlightBackground': '#3b82f615',
      'editorIndentGuide.background': '#e5e7eb',
      'editorIndentGuide.activeBackground': '#d1d5db',
      'editorBracketMatch.background': '#3b82f620',
      'editorBracketMatch.border': '#3b82f6',
      'scrollbarSlider.background': '#e5e7eb80',
      'scrollbarSlider.hoverBackground': '#d1d5db80',
      'scrollbarSlider.activeBackground': '#9ca3af80'
    }
  })
}

export function SQLEditor({
  value,
  onChange,
  onRun,
  onFormat,
  readOnly = false,
  height = 200,
  minHeight,
  className,
  placeholder = 'SELECT * FROM your_table LIMIT 100;',
  compact = false,
  schemas = []
}: SQLEditorProps) {
  const { theme } = useTheme()
  const editorRef = React.useRef<EditorType | null>(null)
  const monacoRef = React.useRef<Monaco | null>(null)

  // Use refs to always hold the latest callbacks to avoid stale closures
  const onRunRef = React.useRef(onRun)
  const onFormatRef = React.useRef(onFormat)

  // Resolve system theme
  const resolvedTheme = React.useMemo(() => {
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return theme
  }, [theme])

  // Keep refs updated when callbacks change
  React.useEffect(() => {
    onRunRef.current = onRun
  }, [onRun])

  React.useEffect(() => {
    onFormatRef.current = onFormat
  }, [onFormat])

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Define custom themes
    defineCustomTheme(monaco)

    // Register SQL autocomplete provider (singleton - only registers once globally)
    updateCompletionSchemas(schemas)
    ensureCompletionProvider(monaco)

    // Set the theme based on current app theme
    const editorTheme = resolvedTheme === 'dark' ? 'data-peek-dark' : 'data-peek-light'
    monaco.editor.setTheme(editorTheme)

    // Add keyboard shortcuts
    // Use refs to avoid stale closures - callbacks may change but Monaco commands are registered once
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRunRef.current?.()
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
      if (onFormatRef.current) {
        onFormatRef.current()
      } else {
        // Format in place
        const currentValue = editor.getValue()
        const formatted = formatSQL(currentValue)
        editor.setValue(formatted)
        onChange?.(formatted)
      }
    })

    // Configure editor for SQL
    editor.updateOptions({
      fontSize: compact ? 12 : 13,
      lineHeight: compact ? 18 : 22,
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', Monaco, Consolas, monospace",
      fontLigatures: true,
      minimap: { enabled: !compact && typeof height === 'number' && height > 150 },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      lineNumbers: compact ? 'off' : 'on',
      glyphMargin: false,
      folding: !compact,
      lineDecorationsWidth: compact ? 0 : 10,
      lineNumbersMinChars: compact ? 0 : 3,
      renderLineHighlight: 'line',
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto',
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8
      },
      padding: {
        top: compact ? 8 : 12,
        bottom: compact ? 8 : 12
      },
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      roundedSelection: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      contextmenu: true,
      quickSuggestions: true,
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      tabCompletion: 'on',
      wordBasedSuggestions: 'off',
      bracketPairColorization: {
        enabled: true
      }
    })

    // Show placeholder when empty
    if (!value) {
      editor.setValue('')
    }
  }

  // Update theme when it changes
  React.useEffect(() => {
    if (monacoRef.current) {
      const editorTheme = resolvedTheme === 'dark' ? 'data-peek-dark' : 'data-peek-light'
      monacoRef.current.editor.setTheme(editorTheme)
    }
  }, [resolvedTheme])

  // Update completion schemas when they change
  React.useEffect(() => {
    updateCompletionSchemas(schemas)
  }, [schemas])

  const handleChange = (newValue: string | undefined) => {
    onChange?.(newValue ?? '')
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-border/50',
        'bg-background/50 backdrop-blur-sm',
        'transition-all duration-200',
        'focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20',
        className
      )}
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        minHeight: minHeight
          ? typeof minHeight === 'number'
            ? `${minHeight}px`
            : minHeight
          : undefined
      }}
    >
      <Editor
        height="100%"
        defaultLanguage="sql"
        value={value}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        theme={resolvedTheme === 'dark' ? 'data-peek-dark' : 'data-peek-light'}
        loading={
          <div className="flex h-full items-center justify-center">
            <div className="text-sm text-muted-foreground">Loading editor...</div>
          </div>
        }
        options={{
          readOnly,
          domReadOnly: readOnly
        }}
      />
      {!value && (
        <div
          className={cn(
            'pointer-events-none absolute font-mono text-muted-foreground/50',
            compact ? 'left-2 top-2 text-xs' : 'left-[52px] top-3 text-sm'
          )}
        >
          {placeholder}
        </div>
      )}
    </div>
  )
}

export default SQLEditor
