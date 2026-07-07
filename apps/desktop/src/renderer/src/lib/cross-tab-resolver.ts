/**
 * Cross-Tab Query resolver.
 *
 * Given a ParsedSql + a way to look up "name → tab result", produce:
 *   - A final SQL string with each `@name` substituted for a properly
 *     quoted identifier (no `@`).
 *   - A list of CTEs (one per unique reference) prepended in order.
 *
 * The resolver is dialect-aware. The shape of the inlined CTE varies:
 *
 *   - Postgres: `name(cols) AS (VALUES (v1::t1, v2::t2), (v3, v4))`.
 *     First tuple carries explicit type casts so the optimizer doesn't
 *     default everything to `text`. Empty results emit a `WHERE FALSE`
 *     defence over a synthesized all-NULL row.
 *
 *   - MySQL: `name(cols) AS (VALUES ROW(v1, v2), ROW(v3, v4))`. MySQL
 *     8.0.19+ requires the explicit `ROW(...)` constructor; a bare
 *     `VALUES (...)` body is rejected.
 *
 *   - MSSQL: `name(cols) AS (SELECT * FROM (VALUES (v1, v2)) AS _(cols))`.
 *     T-SQL requires a `SELECT` body for a CTE; a bare `VALUES` clause
 *     must be wrapped in a derived table. The empty-CTE branch uses
 *     `WHERE 1 = 0` (T-SQL has no `FALSE` literal).
 *
 *   - SQLite: same shape as Postgres (no type casts emitted — SQLite's
 *     dynamic typing makes them unnecessary and `::type` syntax invalid).
 *
 * NaN/Infinity guard: `escapeSQLValue` from `@data-peek/shared` already
 * appends `::float` casts to non-finite numerics. The resolver detects
 * that and skips its own `::<column-type>` wrap, otherwise we'd end up
 * with `'NaN'::float::integer` which PG rejects at execution time.
 */

import {
  escapeSQLIdentifier,
  escapeSQLValue,
  isSQLKeyword,
  type SQLDialect
} from '@data-peek/shared'
import type {
  ParsedSql,
  ResolveCaps,
  ResolveErrorKind,
  ResolveResult,
  TabReference
} from './cross-tab-types'
import { DEFAULT_RESOLVE_CAPS } from './cross-tab-types'

/**
 * A tab's result as the resolver sees it. We only need the shape, not the
 * full QueryResult — keeps this module unit-testable without dragging the
 * tab store in.
 */
export interface ResolvableTab {
  tabId: string
  name: string
  title?: string
  result:
    | {
        kind: 'success'
        rows: ReadonlyArray<Record<string, unknown>>
        fields: ReadonlyArray<{ name: string; dataType: string }>
      }
    | { kind: 'error'; message: string }
    | { kind: 'none' }
}

export interface ResolveContext {
  /** Lookup a tab by reference name. Returns null when unknown. */
  lookup: (name: string) => ResolvableTab | null
  /** The tab issuing the SQL — referenced to detect self-reference. */
  currentTabId: string
  /** Database dialect — drives identifier quoting + value serialisation. */
  dialect: SQLDialect
  /** Caps; merged onto DEFAULT_RESOLVE_CAPS when partial. */
  caps?: Partial<ResolveCaps>
}

export function resolveReferences(
  source: string,
  parsed: ParsedSql,
  ctx: ResolveContext
): { ok: true; result: ResolveResult } | { ok: false; error: ResolveErrorKind } {
  const caps: ResolveCaps = { ...DEFAULT_RESOLVE_CAPS, ...(ctx.caps ?? {}) }

  if (parsed.references.length === 0) {
    return {
      ok: true,
      result: {
        finalSql: source,
        prependedCtes: [],
        bytesAdded: 0,
        rowsInlined: 0,
        references: []
      }
    }
  }

  const namesSorted = Array.from(parsed.referencedNames).sort()
  const plans: Array<{
    name: string
    tab: ResolvableTab
    rows: ReadonlyArray<Record<string, unknown>>
    fields: ReadonlyArray<{ name: string; dataType: string }>
  }> = []

  for (const name of namesSorted) {
    // Refuse to inline as a CTE if the name collides with a reserved SQL
    // keyword. escapeSQLIdentifier would quote the CTE-position identifier,
    // but the substitution site in the user's SQL is the bare name —
    // `WITH "table" (...) ... FROM table` is invalid. Reject early so the
    // user renames.
    if (isSQLKeyword(name)) {
      return { ok: false, error: { kind: 'unknown_reference', name } }
    }

    const tab = ctx.lookup(name)
    if (!tab) {
      return { ok: false, error: { kind: 'unknown_reference', name } }
    }

    // Self-reference. The resolver only inlines the result (not the SQL)
    // so transitive A→B→A cycles don't actually loop at runtime, but a
    // tab referencing itself is always a mistake.
    if (tab.tabId === ctx.currentTabId) {
      return { ok: false, error: { kind: 'circular', chain: [name] } }
    }

    if (tab.result.kind === 'none') {
      return { ok: false, error: { kind: 'no_result', name } }
    }
    if (tab.result.kind === 'error') {
      return {
        ok: false,
        error: { kind: 'errored_result', name, error: tab.result.message }
      }
    }

    const { rows, fields } = tab.result
    if (fields.length > caps.maxColumnsPerRef) {
      return {
        ok: false,
        error: {
          kind: 'too_many_columns',
          name,
          columns: fields.length,
          cap: caps.maxColumnsPerRef
        }
      }
    }
    if (rows.length > caps.maxRowsPerRef) {
      return {
        ok: false,
        error: {
          kind: 'too_large',
          name,
          rows: rows.length,
          bytes: 0,
          cap: { rows: caps.maxRowsPerRef, bytes: caps.maxBytesTotal }
        }
      }
    }

    plans.push({ name, tab, rows, fields })
  }

  // Build CTEs.
  const ctes: string[] = []
  const refSummaries: ResolveResult['references'] = []
  let totalBytes = 0

  for (const plan of plans) {
    const cte = buildCte(plan.name, plan.rows, plan.fields, ctx.dialect)
    const bytes = byteLengthUtf8(cte)
    totalBytes += bytes
    if (totalBytes > caps.maxBytesTotal) {
      return {
        ok: false,
        error: {
          kind: 'too_large',
          name: plan.name,
          rows: plan.rows.length,
          // Report the running total — gives the user a true picture of
          // how close they are to the cap, not just this CTE's slice.
          bytes: totalBytes,
          cap: { rows: caps.maxRowsPerRef, bytes: caps.maxBytesTotal }
        }
      }
    }
    ctes.push(cte)
    refSummaries.push({
      name: plan.name,
      tabId: plan.tab.tabId,
      rows: plan.rows.length,
      bytes
    })
  }

  // Substitute `@name` with a properly quoted identifier in the source,
  // walking the references back-to-front so positions stay valid. Quoting
  // through escapeSQLIdentifier handles any name that happens to need it
  // (capitals / mixed case / future relaxation of the reserved-word
  // check above).
  const sortedRefs = [...parsed.references].sort((a, b) => b.start - a.start)
  let rewritten = source
  for (const ref of sortedRefs) {
    rewritten =
      rewritten.slice(0, ref.start) +
      escapeSQLIdentifier(ref.name, ctx.dialect) +
      rewritten.slice(ref.end)
  }

  const merged = mergeIntoWith(
    ctes,
    rewritten,
    plans.map((p) => p.name)
  )
  if (!merged.ok) {
    return { ok: false, error: merged.error }
  }

  return {
    ok: true,
    result: {
      finalSql: merged.sql,
      prependedCtes: ctes,
      bytesAdded: totalBytes,
      rowsInlined: plans.reduce((acc, p) => acc + p.rows.length, 0),
      references: refSummaries
    }
  }
}

function buildCte(
  name: string,
  rows: ReadonlyArray<Record<string, unknown>>,
  fields: ReadonlyArray<{ name: string; dataType: string }>,
  dialect: SQLDialect
): string {
  const cteIdent = escapeSQLIdentifier(name, dialect)
  const quotedCols = fields.map((f) => escapeSQLIdentifier(f.name, dialect))
  const colList = quotedCols.join(', ')

  if (rows.length === 0) {
    return buildEmptyCte(cteIdent, colList, dialect, fields.length)
  }

  const tuples = rows.map((row, r) => buildTuple(row, fields, dialect, r === 0))
  return formatCte(cteIdent, colList, tuples, dialect)
}

function buildEmptyCte(
  cteIdent: string,
  colList: string,
  dialect: SQLDialect,
  columnCount: number
): string {
  // VALUES requires at least one tuple in every dialect, so we synthesize
  // an all-NULL row and exclude it via WHERE FALSE / WHERE 1 = 0.
  const nullsList = new Array(columnCount).fill('NULL').join(', ')

  if (dialect === 'mssql') {
    return [
      `${cteIdent}(${colList}) AS (`,
      `  SELECT * FROM (VALUES (${nullsList})) AS _(${colList}) WHERE 1 = 0`,
      `)`
    ].join('\n')
  }
  if (dialect === 'mysql') {
    // MySQL's `VALUES ROW(...)` is awkward inside a guarded empty CTE.
    // Use a SELECT subquery instead — universally accepted.
    return [
      `${cteIdent}(${colList}) AS (`,
      `  SELECT * FROM (SELECT ${nullsList}) AS _(${colList}) WHERE FALSE`,
      `)`
    ].join('\n')
  }
  // PG / SQLite: bare VALUES in the derived-table wrapper, WHERE FALSE.
  return [
    `${cteIdent}(${colList}) AS (`,
    `  SELECT * FROM (VALUES (${nullsList})) AS _(${colList}) WHERE FALSE`,
    `)`
  ].join('\n')
}

function buildTuple(
  row: Record<string, unknown>,
  fields: ReadonlyArray<{ name: string; dataType: string }>,
  dialect: SQLDialect,
  isFirstTuple: boolean
): string {
  const cells = fields.map((f) => {
    const v = row[f.name]
    const lit = escapeSQLValue(v, f.dataType, dialect)

    if (isFirstTuple && dialect === 'postgresql') {
      // Skip the wrapper cast when the literal already has one (NaN /
      // Infinity → `'NaN'::float`, jsonb → `'…'::jsonb`). Adding our cast
      // on top produces `'NaN'::float::integer` which PG rejects.
      if (lit === 'NULL') {
        return `CAST(NULL AS ${normalizeTypeForCast(f.dataType)})`
      }
      if (!literalAlreadyHasCast(lit)) {
        return `${lit}::${normalizeTypeForCast(f.dataType)}`
      }
    }
    return lit
  })
  return `  (${cells.join(', ')})`
}

function formatCte(
  cteIdent: string,
  colList: string,
  tuples: string[],
  dialect: SQLDialect
): string {
  if (dialect === 'mysql') {
    // MySQL 8.0.19+ requires `VALUES ROW(...)` — the bare `(v1, v2)`
    // tuples from buildTuple get reshaped to `ROW(v1, v2)`.
    const rowTuples = tuples.map((t) => t.replace(/^\s*\(/, '  ROW('))
    return [`${cteIdent}(${colList}) AS (`, `  VALUES`, rowTuples.join(',\n'), `)`].join('\n')
  }
  if (dialect === 'mssql') {
    return [
      `${cteIdent}(${colList}) AS (`,
      `  SELECT * FROM (VALUES`,
      tuples.join(',\n'),
      `  ) AS _(${colList})`,
      `)`
    ].join('\n')
  }
  // Postgres / SQLite.
  return [`${cteIdent}(${colList}) AS (`, `  VALUES`, tuples.join(',\n'), `)`].join('\n')
}

/**
 * Merge generated CTEs into the source SQL. Handles:
 *   - Plain SQL with no leading WITH → prepend a fresh WITH clause.
 *   - SQL leading with `WITH <user_ctes>` → splice ours ahead of the
 *     user's so they can reference ours.
 *   - SQL leading with `WITH RECURSIVE <user_ctes>` → keep the modifier
 *     and splice ours ahead. The RECURSIVE modifier applies to the
 *     whole CTE list per PG; non-recursive CTEs are legal inside a
 *     `WITH RECURSIVE` list.
 *   - Leading line/block comments → skipped during detection so a
 *     comment before WITH doesn't cause us to emit two WITH keywords.
 *
 * Returns `duplicate_cte_name` when one of our generated names collides
 * with a CTE name already in the user's WITH clause.
 */
function mergeIntoWith(
  ctes: string[],
  sql: string,
  generatedNames: string[]
): { ok: true; sql: string } | { ok: false; error: ResolveErrorKind } {
  if (ctes.length === 0) return { ok: true, sql }

  const headInfo = analyzeLeadingWith(sql)
  if (headInfo.matches) {
    const userNames = extractCteNames(sql, headInfo.userCtesStartIndex)
    for (const ours of generatedNames) {
      if (userNames.has(ours.toLowerCase())) {
        return { ok: false, error: { kind: 'duplicate_cte_name', name: ours } }
      }
    }
    const before = sql.slice(0, headInfo.userCtesStartIndex)
    const after = sql.slice(headInfo.userCtesStartIndex)
    return { ok: true, sql: `${before}\n${ctes.join(',\n')},${after}` }
  }
  return { ok: true, sql: `WITH\n${ctes.join(',\n')}\n${sql.trimStart()}` }
}

interface LeadingWithInfo {
  matches: boolean
  /** Position where the user's CTE list begins (after WITH or WITH RECURSIVE). */
  userCtesStartIndex: number
}

/**
 * Scan past whitespace, line comments, and block comments to find a
 * leading `WITH` (optionally followed by `RECURSIVE`).
 */
function analyzeLeadingWith(sql: string): LeadingWithInfo {
  let i = 0
  const n = sql.length

  while (i < n) {
    const c = sql[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n' && sql[i] !== '\r') i++
      continue
    }
    if (c === '/' && sql[i + 1] === '*') {
      i += 2
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++
      if (i < n) i += 2
      continue
    }
    break
  }

  const head = sql.slice(i, i + 4).toUpperCase()
  if (head !== 'WITH' || !/\s/.test(sql[i + 4] ?? '')) {
    return { matches: false, userCtesStartIndex: -1 }
  }
  let j = i + 4
  while (j < n && /\s/.test(sql[j])) j++

  const recHead = sql.slice(j, j + 9).toUpperCase()
  if (recHead === 'RECURSIVE' && /\s/.test(sql[j + 9] ?? '')) {
    j += 9
    while (j < n && /\s/.test(sql[j])) j++
  }
  return { matches: true, userCtesStartIndex: j }
}

/**
 * Extract the names of CTEs declared at the top level of a WITH clause
 * starting at `from`. Returns lowercase identifiers.
 *
 * Cheap and approximate: at parenthesis depth 0, any identifier-shaped
 * token followed by whitespace + `AS` (case-insensitive) is a CTE name.
 * Handles string/comment state so SQL like `WITH x AS (SELECT '@foo AS')`
 * doesn't falsely produce `foo` as a name.
 */
function extractCteNames(sql: string, from: number): Set<string> {
  const names = new Set<string>()
  let i = from
  const n = sql.length
  let inSingle = false
  let inDouble = false
  let inLine = false
  let blockDepth = 0
  let depth = 0

  while (i < n) {
    const c = sql[i]
    const nx = sql[i + 1]
    if (inLine) {
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
    if (c === '(') {
      depth++
      i++
      continue
    }
    if (c === ')') {
      depth--
      i++
      continue
    }
    if (depth === 0 && /[A-Za-z_]/.test(c)) {
      let j = i + 1
      while (j < n && /[A-Za-z0-9_]/.test(sql[j])) j++
      const ident = sql.slice(i, j)
      let k = j
      while (k < n && /\s/.test(sql[k])) k++
      const next = sql.slice(k, k + 2).toUpperCase()
      if (next === 'AS' && /[\s(]/.test(sql[k + 2] ?? '')) {
        names.add(ident.toLowerCase())
      }
      i = j
      continue
    }
    i++
  }
  return names
}

function literalAlreadyHasCast(lit: string): boolean {
  return /::[\w[\]"`. ]+\s*$/.test(lit.trim())
}

/**
 * Strip parens/precision from a type string so it's a clean cast target.
 * `character varying(255)` → `character varying`, `numeric(10,2)` →
 * `numeric`. Trailing `[]` arrays are kept intact.
 */
function normalizeTypeForCast(dataType: string): string {
  const trimmed = dataType.trim()
  const noParen = trimmed.replace(/\([^)]*\)/g, '')
  return noParen.trim() || 'text'
}

/**
 * Cheap UTF-8 byte length without pulling Buffer (renderer-safe). Handles
 * surrogate pairs correctly — the original implementation unconditionally
 * incremented `i` after a high surrogate, under-counting bytes on lone
 * high surrogates and skipping the following (unrelated) code unit.
 */
function byteLengthUtf8(s: string): number {
  let bytes = 0
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = s.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        i++
      } else {
        // Lone high surrogate — U+FFFD replacement is 3 bytes.
        bytes += 3
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      bytes += 3
    } else {
      bytes += 3
    }
  }
  return bytes
}

export type { TabReference }
