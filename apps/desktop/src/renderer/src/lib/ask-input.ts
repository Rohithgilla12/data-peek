/**
 * Decides whether composer input is SQL to run directly or a question for the
 * AI. A leading SQL verb alone is not enough ("show me…", "delete inactive
 * users"), so each verb also needs the structure that only real SQL has.
 * The composer lets the user lock the mode when this guesses wrong.
 */

export type AskMode = 'sql' | 'ask'

const PROSE_WORDS =
  /\b(me|my|i|we|our|you|your|what|which|who|whom|why|how|please|could|would|should|can|give|tell|list|find|top|chart|graph|plot)\b/i

const SHOW_TARGETS = new Set([
  'tables',
  'databases',
  'schemas',
  'columns',
  'index',
  'indexes',
  'create',
  'grants',
  'status',
  'variables',
  'processlist',
  'all',
  'timezone',
  'transaction',
  'full',
  'triggers',
  'views'
])

const DDL_OBJECT =
  /^(table|index|unique|view|materialized|schema|extension|function|procedure|type|database|role|user|sequence|trigger|policy|or\s+replace|temp|temporary|if)\b/i

const STRUCTURE = /[*(),=;<>]|\bfrom\b|^\s*\d+(\s|$)/i

function stripLiterals(text: string): string {
  return text
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .trim()
}

function isSqlBody(verb: string, rest: string, words: string[]): boolean {
  const prose = PROSE_WORDS.test(rest)
  switch (verb) {
    case 'select':
      return !prose && STRUCTURE.test(rest)
    case 'with':
      return /\bas\s*\(/i.test(rest)
    case 'explain': {
      const target = rest.replace(/^(analyze|verbose|\([^)]*\))\s*/gi, '')
      return classifyInput(target) === 'sql'
    }
    case 'show':
      return words.length >= 2 && (SHOW_TARGETS.has(words[1]) || words[1].includes('_'))
    case 'describe':
    case 'desc':
      return words.length === 2 && !prose
    case 'table':
      return words.length === 2 && !prose
    case 'values':
      return rest.startsWith('(')
    case 'insert':
      return /^into\b/i.test(rest)
    case 'update':
      return /\bset\b[\s\S]*=/i.test(rest)
    case 'delete':
      return /^from\b/i.test(rest)
    case 'create':
    case 'alter':
    case 'drop':
      return DDL_OBJECT.test(rest)
    case 'truncate':
      return words.length <= 3 && !prose
    case 'grant':
    case 'revoke':
      return /\bon\b/i.test(rest) && /\b(to|from)\b/i.test(rest)
    case 'pragma':
      return true
    case 'begin':
    case 'commit':
    case 'rollback':
      return words.length <= 2
    default:
      return false
  }
}

export function classifyInput(text: string): AskMode | null {
  if (!text.trim()) return null
  const raw = text.trimStart()
  if (raw.startsWith('--') || raw.startsWith('/*') || raw.startsWith('\\')) return 'sql'

  const body = stripLiterals(text).replace(/^\(+\s*/, '')
  if (/\?\s*$/.test(body)) return 'ask'

  const words = body.toLowerCase().split(/\s+/).filter(Boolean)
  const verb = words[0] ?? ''
  const rest = body.slice(verb.length).trim()
  return isSqlBody(verb, rest, words) ? 'sql' : 'ask'
}
