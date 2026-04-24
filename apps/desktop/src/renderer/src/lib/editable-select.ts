import type { DatabaseType } from '@data-peek/shared'

export type ProjectionShape = { type: 'star' } | { type: 'columns'; names: string[] }

export interface EditableSelectInfo {
  schema: string | null
  table: string
  alias: string | null
  projection: ProjectionShape
}

interface DialectConfig {
  dollarQuotes: boolean
  nestedBlockComments: boolean
  backtickIdentifiers: boolean
  backslashEscape: boolean
  hashLineComment: boolean
  bracketIdentifiers: boolean
}

const DIALECTS: Record<DatabaseType, DialectConfig> = {
  postgresql: {
    dollarQuotes: true,
    nestedBlockComments: true,
    backtickIdentifiers: false,
    backslashEscape: false,
    hashLineComment: false,
    bracketIdentifiers: false
  },
  mysql: {
    dollarQuotes: false,
    nestedBlockComments: false,
    backtickIdentifiers: true,
    backslashEscape: true,
    hashLineComment: true,
    bracketIdentifiers: false
  },
  mssql: {
    dollarQuotes: false,
    nestedBlockComments: false,
    backtickIdentifiers: false,
    backslashEscape: false,
    hashLineComment: false,
    bracketIdentifiers: true
  },
  sqlite: {
    dollarQuotes: false,
    nestedBlockComments: false,
    backtickIdentifiers: true,
    backslashEscape: false,
    hashLineComment: false,
    bracketIdentifiers: true
  }
}

const KEYWORDS = new Set([
  'SELECT',
  'FROM',
  'AS',
  'WHERE',
  'JOIN',
  'INNER',
  'LEFT',
  'RIGHT',
  'FULL',
  'CROSS',
  'NATURAL',
  'OUTER',
  'UNION',
  'INTERSECT',
  'EXCEPT',
  'DISTINCT',
  'GROUP',
  'HAVING',
  'ORDER',
  'WINDOW',
  'LIMIT',
  'OFFSET',
  'FETCH',
  'FOR',
  'INTO',
  'TOP',
  'WITH',
  'ALL',
  'BY',
  'ON',
  'USING',
  'AND',
  'OR',
  'NOT'
])

type Tok =
  | { type: 'KEYWORD'; value: string }
  | { type: 'IDENT'; value: string }
  | { type: 'QIDENT'; value: string }
  | { type: 'STRING' }
  | { type: 'NUMBER' }
  | { type: 'STAR' }
  | { type: 'COMMA' }
  | { type: 'DOT' }
  | { type: 'LPAREN' }
  | { type: 'RPAREN' }
  | { type: 'SEMICOLON' }
  | { type: 'OP' }

function tokenize(sql: string, dbType: DatabaseType): Tok[] {
  const cfg = DIALECTS[dbType]
  const toks: Tok[] = []
  let i = 0
  const n = sql.length

  while (i < n) {
    const c = sql[i]

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }

    // Line comments
    if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i++
      continue
    }
    if (cfg.hashLineComment && c === '#') {
      while (i < n && sql[i] !== '\n') i++
      continue
    }

    // Block comments
    if (c === '/' && sql[i + 1] === '*') {
      i += 2
      let depth = 1
      while (i < n && depth > 0) {
        if (cfg.nestedBlockComments && sql[i] === '/' && sql[i + 1] === '*') {
          depth++
          i += 2
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--
          i += 2
        } else {
          i++
        }
      }
      continue
    }

    // Single-quoted string
    if (c === "'") {
      i++
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2
        } else if (cfg.backslashEscape && sql[i] === '\\' && i + 1 < n) {
          i += 2
        } else if (sql[i] === "'") {
          i++
          break
        } else {
          i++
        }
      }
      toks.push({ type: 'STRING' })
      continue
    }

    // Dollar-quoted (Postgres)
    if (cfg.dollarQuotes && c === '$') {
      const m = /^\$([a-zA-Z0-9_]*)\$/.exec(sql.substring(i))
      if (m) {
        const tag = m[0]
        i += tag.length
        const close = sql.indexOf(tag, i)
        i = close === -1 ? n : close + tag.length
        toks.push({ type: 'STRING' })
        continue
      }
    }

    // Quoted identifiers
    if (c === '"') {
      let v = ''
      i++
      while (i < n) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          v += '"'
          i += 2
        } else if (sql[i] === '"') {
          i++
          break
        } else {
          v += sql[i]
          i++
        }
      }
      toks.push({ type: 'QIDENT', value: v })
      continue
    }
    if (cfg.backtickIdentifiers && c === '`') {
      let v = ''
      i++
      while (i < n) {
        if (sql[i] === '`' && sql[i + 1] === '`') {
          v += '`'
          i += 2
        } else if (sql[i] === '`') {
          i++
          break
        } else {
          v += sql[i]
          i++
        }
      }
      toks.push({ type: 'QIDENT', value: v })
      continue
    }
    if (cfg.bracketIdentifiers && c === '[') {
      let v = ''
      i++
      while (i < n) {
        if (sql[i] === ']' && sql[i + 1] === ']') {
          v += ']'
          i += 2
        } else if (sql[i] === ']') {
          i++
          break
        } else {
          v += sql[i]
          i++
        }
      }
      toks.push({ type: 'QIDENT', value: v })
      continue
    }

    // Numbers
    if (c >= '0' && c <= '9') {
      while (i < n && /[\d.eE+\-]/.test(sql[i])) i++
      toks.push({ type: 'NUMBER' })
      continue
    }

    // Identifiers / keywords
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
      let v = ''
      while (i < n && /[a-zA-Z0-9_$]/.test(sql[i])) {
        v += sql[i]
        i++
      }
      const upper = v.toUpperCase()
      if (KEYWORDS.has(upper)) {
        toks.push({ type: 'KEYWORD', value: upper })
      } else {
        toks.push({ type: 'IDENT', value: v })
      }
      continue
    }

    // Punctuation
    if (c === '*') {
      toks.push({ type: 'STAR' })
      i++
      continue
    }
    if (c === ',') {
      toks.push({ type: 'COMMA' })
      i++
      continue
    }
    if (c === '.') {
      toks.push({ type: 'DOT' })
      i++
      continue
    }
    if (c === '(') {
      toks.push({ type: 'LPAREN' })
      i++
      continue
    }
    if (c === ')') {
      toks.push({ type: 'RPAREN' })
      i++
      continue
    }
    if (c === ';') {
      toks.push({ type: 'SEMICOLON' })
      i++
      continue
    }

    toks.push({ type: 'OP' })
    i++
  }

  return toks
}

const FROM_END_KEYWORDS = new Set([
  'WHERE',
  'ORDER',
  'LIMIT',
  'OFFSET',
  'FETCH',
  'GROUP',
  'HAVING',
  'WINDOW',
  'FOR',
  'UNION',
  'INTERSECT',
  'EXCEPT'
])

const BLOCKING_KEYWORDS = new Set([
  'JOIN',
  'UNION',
  'INTERSECT',
  'EXCEPT',
  'NATURAL',
  'CROSS',
  'GROUP',
  'HAVING',
  'WINDOW',
  'DISTINCT',
  'TOP',
  'INTO'
])

export function analyzeEditableSelect(
  sql: string,
  dbType: DatabaseType
): EditableSelectInfo | null {
  const toks = tokenize(sql, dbType)

  // Strip trailing semicolons
  while (toks.length > 0 && toks[toks.length - 1].type === 'SEMICOLON') toks.pop()
  if (toks.length === 0) return null

  // Reject multiple statements
  if (toks.some((t) => t.type === 'SEMICOLON')) return null

  // Must start with SELECT
  if (toks[0].type !== 'KEYWORD' || toks[0].value !== 'SELECT') return null

  // Reject blocking keywords at depth 0
  let depth = 0
  for (const t of toks) {
    if (t.type === 'LPAREN') depth++
    else if (t.type === 'RPAREN') depth--
    else if (depth === 0 && t.type === 'KEYWORD' && BLOCKING_KEYWORDS.has(t.value)) return null
  }

  // Find FROM at depth 0
  depth = 0
  let fromIdx = -1
  for (let i = 1; i < toks.length; i++) {
    const t = toks[i]
    if (t.type === 'LPAREN') depth++
    else if (t.type === 'RPAREN') depth--
    else if (depth === 0 && t.type === 'KEYWORD' && t.value === 'FROM') {
      fromIdx = i
      break
    }
  }
  if (fromIdx === -1) return null

  // Projection tokens (between SELECT and FROM)
  const projToks = toks.slice(1, fromIdx)
  const projection = parseProjection(projToks)
  if (!projection) return null

  // FROM clause tokens (until end keyword or end of query)
  const afterFrom = toks.slice(fromIdx + 1)
  depth = 0
  let fromEnd = afterFrom.length
  for (let i = 0; i < afterFrom.length; i++) {
    const t = afterFrom[i]
    if (t.type === 'LPAREN') depth++
    else if (t.type === 'RPAREN') depth--
    else if (depth === 0 && t.type === 'KEYWORD' && FROM_END_KEYWORDS.has(t.value)) {
      fromEnd = i
      break
    }
  }
  const fromToks = afterFrom.slice(0, fromEnd)

  const table = parseFromTable(fromToks)
  if (!table) return null

  return {
    schema: table.schema,
    table: table.table,
    alias: table.alias,
    projection
  }
}

function parseProjection(toks: Tok[]): ProjectionShape | null {
  if (toks.length === 0) return null

  // Split by top-level commas
  const items: Tok[][] = []
  let current: Tok[] = []
  let depth = 0
  for (const t of toks) {
    if (t.type === 'LPAREN') {
      depth++
      current.push(t)
    } else if (t.type === 'RPAREN') {
      depth--
      current.push(t)
    } else if (t.type === 'COMMA' && depth === 0) {
      items.push(current)
      current = []
    } else {
      current.push(t)
    }
  }
  if (current.length > 0) items.push(current)
  if (items.length === 0) return null

  // SELECT * or alias.*
  if (items.length === 1) {
    const item = items[0]
    if (item.length === 1 && item[0].type === 'STAR') return { type: 'star' }
    if (
      item.length === 3 &&
      (item[0].type === 'IDENT' || item[0].type === 'QIDENT') &&
      item[1].type === 'DOT' &&
      item[2].type === 'STAR'
    ) {
      return { type: 'star' }
    }
  }

  const names: string[] = []
  for (const item of items) {
    const name = extractSimpleColumnName(item)
    if (name === null) return null
    names.push(name)
  }
  return { type: 'columns', names }
}

function extractSimpleColumnName(toks: Tok[]): string | null {
  if (toks.length === 1) {
    const t = toks[0]
    if (t.type === 'IDENT' || t.type === 'QIDENT') return t.value
    return null
  }
  if (toks.length === 3) {
    const a = toks[0]
    const b = toks[1]
    const c = toks[2]
    if (
      (a.type === 'IDENT' || a.type === 'QIDENT') &&
      b.type === 'DOT' &&
      (c.type === 'IDENT' || c.type === 'QIDENT')
    ) {
      return c.value
    }
  }
  return null
}

function parseFromTable(
  toks: Tok[]
): { schema: string | null; table: string; alias: string | null } | null {
  if (toks.length === 0) return null
  if (toks[0].type === 'LPAREN') return null
  if (toks.some((t) => t.type === 'COMMA')) return null

  let idx = 0
  const first = toks[idx]
  if (first.type !== 'IDENT' && first.type !== 'QIDENT') return null
  let schema: string | null = null
  let table = first.value
  idx++

  if (idx < toks.length && toks[idx].type === 'DOT') {
    idx++
    if (idx >= toks.length) return null
    const second = toks[idx]
    if (second.type !== 'IDENT' && second.type !== 'QIDENT') return null
    schema = table
    table = second.value
    idx++
  }

  let alias: string | null = null
  if (idx < toks.length) {
    const maybeAs = toks[idx]
    if (maybeAs.type === 'KEYWORD' && maybeAs.value === 'AS') idx++
    if (idx < toks.length) {
      const t = toks[idx]
      if (t.type === 'IDENT' || t.type === 'QIDENT') {
        alias = t.value
        idx++
      } else {
        return null
      }
    }
  }

  if (idx < toks.length) return null
  return { schema, table, alias }
}
