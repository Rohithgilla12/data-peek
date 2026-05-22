/**
 * Cross-Tab Query parser.
 *
 * Scans a SQL string for `@name` reference tokens, ignoring matches inside:
 *   - single-quoted string literals (with doubled-quote escapes)
 *   - double-quoted identifiers (`"foo@bar"`)
 *   - line comments (`-- …`)
 *   - block comments (`/* … *‍/`, with nesting for Postgres)
 *   - dollar-quoted strings (`$tag$ … $tag$`)
 *   - email-like sequences (`foo@bar.com`) — `@` preceded by a non-whitespace
 *     non-operator character is treated as a literal `@`, not a ref boundary
 *
 * The output is the list of TabReference instances + a deduplicated name
 * set. The resolver consumes both — names for lookup, references for
 * source-position-aware error messages.
 *
 * This is intentionally a hand-written single-pass scanner. The full SQL
 * tokenizer in `editable-select.ts` is overkill for this lookup and would
 * require us to thread dialect-specific quoting all the way through.
 */

import { REF_NAME_PATTERN, type TabReference, type ParsedSql } from './cross-tab-types'

/**
 * Strict regex for the part *after* the `@`. Same shape as REF_NAME_PATTERN
 * but used directly against the scanner cursor (no normalization needed —
 * the match must already be a valid name shape to be consumed as a ref).
 */
const REF_BODY_RE = /^[a-z][a-z0-9_]*/

/**
 * Characters that, when immediately preceding `@`, indicate the `@` is part
 * of a word (email, identifier) — not a reference boundary. Whitespace,
 * common operators, parens, commas, equality — all "word boundary" — make
 * the `@` a real ref marker.
 */
function isWordContinuation(prev: string | undefined): boolean {
  if (!prev) return false
  // Letters, digits, underscore, dot, dollar, backslash — all "in a word".
  return /[A-Za-z0-9_.$\\]/.test(prev)
}

export function parseTabReferences(sql: string): ParsedSql {
  const references: TabReference[] = []
  const referencedNames = new Set<string>()

  let i = 0
  const n = sql.length

  let inSingle = false
  let inDouble = false
  let inLine = false
  let blockDepth = 0
  let dollarTag: string | null = null

  while (i < n) {
    const c = sql[i]
    const nx = sql[i + 1]

    if (inLine) {
      if (c === '\n') inLine = false
      i++
      continue
    }
    if (blockDepth > 0) {
      if (c === '*' && nx === '/') {
        blockDepth--
        i += 2
        continue
      }
      if (c === '/' && nx === '*') {
        blockDepth++
        i += 2
        continue
      }
      i++
      continue
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        i += dollarTag.length
        dollarTag = null
        continue
      }
      i++
      continue
    }
    if (inSingle) {
      if (c === "'" && sql[i + 1] === "'") {
        i += 2
        continue
      }
      if (c === "'") inSingle = false
      i++
      continue
    }
    if (inDouble) {
      if (c === '"' && sql[i + 1] === '"') {
        i += 2
        continue
      }
      if (c === '"') inDouble = false
      i++
      continue
    }

    // Comment starts
    if (c === '-' && nx === '-') {
      inLine = true
      i += 2
      continue
    }
    if (c === '/' && nx === '*') {
      blockDepth = 1
      i += 2
      continue
    }

    // Dollar-quoted string start
    if (c === '$') {
      let j = i + 1
      while (j < n && /[A-Za-z0-9_]/.test(sql[j])) j++
      if (sql[j] === '$') {
        dollarTag = sql.slice(i, j + 1)
        i = j + 1
        continue
      }
    }

    if (c === "'") {
      inSingle = true
      i++
      continue
    }
    if (c === '"') {
      inDouble = true
      i++
      continue
    }

    // The interesting case.
    if (c === '@') {
      const prev = i > 0 ? sql[i - 1] : undefined
      if (isWordContinuation(prev)) {
        // foo@bar style — not a reference. Skip the @, the next iteration
        // will continue scanning normally.
        i++
        continue
      }
      const rest = sql.slice(i + 1)
      const match = rest.match(REF_BODY_RE)
      if (!match) {
        i++
        continue
      }
      const name = match[0]
      const start = i
      const end = i + 1 + name.length
      references.push({
        raw: '@' + name,
        start,
        end,
        name,
        status: 'unknown'
      })
      referencedNames.add(name)
      i = end
      continue
    }

    i++
  }

  return { references, referencedNames }
}

/** True iff the candidate looks like a valid ref name. Exported for the resolver. */
export function isValidRefNameShape(name: string): boolean {
  return REF_NAME_PATTERN.test(name)
}
