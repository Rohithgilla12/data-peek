/**
 * Cross-Tab Query parser.
 *
 * Scans a SQL string for `@name` reference tokens, ignoring matches inside:
 *   - single-quoted string literals (with `''` standard escape AND `\'`
 *     backslash escape — the latter is on by default in MySQL and inside
 *     Postgres `E'...'` strings)
 *   - double-quoted identifiers (`"foo@bar"`)
 *   - MySQL backtick-quoted identifiers (`` `@col` ``)
 *   - MSSQL bracket-quoted identifiers (`[@col]`, with `]]` escape)
 *   - line comments (terminated by `\n` or `\r`)
 *   - block comments (`/* ... *‍/`, nested only in Postgres)
 *   - Postgres dollar-quoted bodies (`$tag$ ... $tag$`, tag must start
 *     with a letter or underscore — `$1$` is NOT a dollar quote)
 *   - email-like sequences (`foo@bar.com`)
 *   - `@@var` system-variable prefixes (MySQL / MSSQL)
 *
 * The parser is dialect-aware. Dialect-only behaviour:
 *   - `mysql`: backtick identifiers, backslash escape in strings, no nested
 *     block comments, no dollar-quoted strings
 *   - `mssql`: bracket identifiers, backslash NOT an escape, no nested
 *     block comments, no dollar-quoted strings
 *   - `postgresql`: nested block comments, dollar-quoted strings, backslash
 *     escape only inside `E'...'` strings
 *   - `sqlite`: backtick identifiers, no dollar quotes, no nested comments
 *
 * MySQL/MSSQL `@var` collision: in those dialects `@name` is also user-
 * defined-variable syntax. The parser's default is to still emit every
 * `@name` token (the resolver decides what's a real reference). Callers
 * that want to suppress unknown `@var` lookups in those dialects can pass
 * `knownNames` — when present, only `@name` tokens whose name is in the
 * set are emitted as references. The integration layer plumbs the set of
 * registered tab names through for MySQL/MSSQL.
 */

import type { DatabaseType } from '@data-peek/shared'
import { REF_NAME_PATTERN, type TabReference, type ParsedSql } from './cross-tab-types'

export interface ParseOptions {
  dialect: DatabaseType
  /**
   * When provided, only `@name` tokens whose name is in the set are emitted
   * as references. Unrecognised `@name` tokens are silently dropped.
   *
   * Useful in MySQL / MSSQL where `@name` is also user-defined-variable
   * syntax: pass the set of currently registered tab names and the parser
   * won't capture every `@offset` / `@count` in the user's procedure SQL
   * as an unknown reference.
   */
  knownNames?: ReadonlySet<string>
}

/**
 * Strict regex for the part *after* the `@`. Same shape as REF_NAME_PATTERN
 * but used directly against the scanner cursor (no normalization needed —
 * the match must already be a valid name shape to be consumed as a ref).
 *
 * The negative lookahead at the end rejects partial matches: `@fooBar`
 * doesn't silently parse as `@foo`. The whole identifier must be a valid
 * lowercase name, ending at a non-word-character boundary.
 */
const REF_BODY_RE = /^[a-z][a-z0-9_]*(?![A-Za-z0-9_])/

/**
 * Characters that, when immediately preceding `@`, indicate the `@` is part
 * of a word (email, identifier, `@@` system var). Whitespace, common
 * operators, parens, commas, equality — all "word boundary" — make the `@`
 * a real ref marker.
 *
 * The `@` itself is in the set: that handles the `@@version` case — when
 * scanning the second `@` of `@@`, its predecessor is `@`, so it's treated
 * as a word continuation and not as a ref boundary.
 */
function isWordContinuation(prev: string | undefined): boolean {
  if (!prev) return false
  return /[A-Za-z0-9_.$\\@]/.test(prev)
}

interface DialectConfig {
  /** MySQL + SQLite use backticks for quoted identifiers. */
  backtickIdents: boolean
  /** MSSQL uses `[...]` for quoted identifiers (with `]]` escape). */
  bracketIdents: boolean
  /** PG nests block comments; MySQL and MSSQL don't. */
  nestedBlockComments: boolean
  /** PG-only: `$tag$ ... $tag$`. */
  dollarQuotedStrings: boolean
  /**
   * Backslash-escape inside single-quoted strings. MySQL: default ON
   * (unless NO_BACKSLASH_ESCAPES is set; we assume default). MSSQL: never.
   * Postgres: only inside `E'...'` strings — handled separately below.
   */
  backslashEscape: boolean
}

function configFor(dialect: DatabaseType): DialectConfig {
  switch (dialect) {
    case 'mysql':
      return {
        backtickIdents: true,
        bracketIdents: false,
        nestedBlockComments: false,
        dollarQuotedStrings: false,
        backslashEscape: true
      }
    case 'mssql':
      return {
        backtickIdents: false,
        bracketIdents: true,
        nestedBlockComments: false,
        dollarQuotedStrings: false,
        backslashEscape: false
      }
    case 'sqlite':
      return {
        backtickIdents: true,
        bracketIdents: true,
        nestedBlockComments: false,
        dollarQuotedStrings: false,
        backslashEscape: false
      }
    case 'postgresql':
    default:
      return {
        backtickIdents: false,
        bracketIdents: false,
        nestedBlockComments: true,
        dollarQuotedStrings: true,
        backslashEscape: false
      }
  }
}

export function parseTabReferences(sql: string, options: ParseOptions): ParsedSql {
  const cfg = configFor(options.dialect)
  const known = options.knownNames

  const references: TabReference[] = []
  const referencedNames = new Set<string>()

  let i = 0
  const n = sql.length

  let inSingle = false
  let singleAllowsBackslash = false
  let inDouble = false
  let inBacktick = false
  let inBracket = false
  let inLine = false
  let blockDepth = 0
  let dollarTag: string | null = null

  while (i < n) {
    const c = sql[i]
    const nx = sql[i + 1]

    if (inLine) {
      // Both \n and \r terminate line comments — old-Mac CR-only files and
      // some generated SQL otherwise consume the rest as a comment.
      if (c === '\n' || c === '\r') inLine = false
      i++
      continue
    }
    if (blockDepth > 0) {
      if (c === '*' && nx === '/') {
        blockDepth--
        i += 2
        continue
      }
      if (cfg.nestedBlockComments && c === '/' && nx === '*') {
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
      const allowBackslash = singleAllowsBackslash || cfg.backslashEscape
      if (allowBackslash && c === '\\' && i + 1 < n) {
        i += 2
        continue
      }
      if (c === "'") {
        inSingle = false
        singleAllowsBackslash = false
      }
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
    if (inBacktick) {
      if (c === '`' && sql[i + 1] === '`') {
        i += 2
        continue
      }
      if (c === '`') inBacktick = false
      i++
      continue
    }
    if (inBracket) {
      if (c === ']' && sql[i + 1] === ']') {
        i += 2
        continue
      }
      if (c === ']') inBracket = false
      i++
      continue
    }

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

    // Postgres E'...' string — backslash escape applies inside.
    if (
      cfg.dollarQuotedStrings &&
      (c === 'E' || c === 'e') &&
      nx === "'" &&
      !isWordContinuation(i > 0 ? sql[i - 1] : undefined)
    ) {
      inSingle = true
      singleAllowsBackslash = true
      i += 2
      continue
    }

    // PG dollar-quoted body. Tag must start with letter or underscore
    // (`$1$` is positional-parameter syntax, not a dollar-quote open).
    if (cfg.dollarQuotedStrings && c === '$') {
      let j = i + 1
      if (j < n && /[A-Za-z_]/.test(sql[j])) {
        j++
        while (j < n && /[A-Za-z0-9_]/.test(sql[j])) j++
      }
      if (sql[j] === '$') {
        dollarTag = sql.slice(i, j + 1)
        i = j + 1
        continue
      }
    }

    if (c === "'") {
      inSingle = true
      singleAllowsBackslash = false
      i++
      continue
    }
    if (c === '"') {
      inDouble = true
      i++
      continue
    }
    if (cfg.backtickIdents && c === '`') {
      inBacktick = true
      i++
      continue
    }
    if (cfg.bracketIdents && c === '[') {
      inBracket = true
      i++
      continue
    }

    if (c === '@') {
      const prev = i > 0 ? sql[i - 1] : undefined
      if (isWordContinuation(prev)) {
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
      // When the caller supplies a known-names set, suppress refs not in
      // it. Lets MySQL/MSSQL users keep `@count` / `@offset` user-vars
      // without spurious unknown_reference errors on every parameterised
      // query.
      if (known && !known.has(name)) {
        i += 1 + name.length
        continue
      }
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
