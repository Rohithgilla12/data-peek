/**
 * Cross-Tab Query resolver.
 *
 * Given a ParsedSql + a way to look up "name → tab result", produce:
 *   - A final SQL string with each `@name` substituted for the bare
 *     identifier `name` (no `@`).
 *   - A list of CTEs (one per unique reference) prepended in order.
 *
 * The resolver is dialect-aware via the SQLDialect type from
 * @data-peek/shared. Identifier quoting and value serialisation go through
 * the same helpers the edit-store uses, so bigints, dates, JSON, byteas all
 * serialise correctly.
 *
 * Errors are returned (not thrown) — callers want to surface them in the
 * UI with the offending reference name, not in a try/catch.
 */

import { escapeSQLIdentifier, escapeSQLValue, type SQLDialect } from '@data-peek/shared'
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
  /** Display label — used in error chains for circularity. */
  title?: string
  /** Last execution outcome. */
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

/**
 * Resolve a parsed SQL into a runnable string. References are inlined as
 * `VALUES`-backed CTEs in alphabetical order (stable across runs so diffs
 * of the generated SQL are clean).
 */
export function resolveReferences(
  source: string,
  parsed: ParsedSql,
  ctx: ResolveContext
):
  | { ok: true; result: ResolveResult }
  | { ok: false; error: ResolveErrorKind } {
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

  // Validate + collect per-name plans. Resolve in alphabetical order so the
  // emitted SQL is stable.
  const namesSorted = Array.from(parsed.referencedNames).sort()
  const plans: Array<{
    name: string
    tab: ResolvableTab
    rows: ReadonlyArray<Record<string, unknown>>
    fields: ReadonlyArray<{ name: string; dataType: string }>
  }> = []

  for (const name of namesSorted) {
    const tab = ctx.lookup(name)
    if (!tab) {
      return { ok: false, error: { kind: 'unknown_reference', name } }
    }

    // Self-reference is the simplest "circular" case and worth surfacing
    // with a clean error before we get into more elaborate chain detection.
    if (tab.tabId === ctx.currentTabId) {
      return { ok: false, error: { kind: 'circular', chain: [name, name] } }
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
          bytes,
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

  // Substitute `@name` with `name` in the source, walking the references
  // back-to-front so positions stay valid.
  const sortedRefs = [...parsed.references].sort((a, b) => b.start - a.start)
  let rewritten = source
  for (const ref of sortedRefs) {
    rewritten = rewritten.slice(0, ref.start) + ref.name + rewritten.slice(ref.end)
  }

  const finalSql = mergeIntoWith(ctes, rewritten)

  return {
    ok: true,
    result: {
      finalSql,
      prependedCtes: ctes,
      bytesAdded: totalBytes,
      rowsInlined: plans.reduce((acc, p) => acc + p.rows.length, 0),
      references: refSummaries
    }
  }
}

/**
 * Build one CTE for the given name + rows + fields. Uses VALUES with
 * type casts on the first tuple to anchor the column types — Postgres
 * needs this to avoid `text`-typing everything.
 */
function buildCte(
  name: string,
  rows: ReadonlyArray<Record<string, unknown>>,
  fields: ReadonlyArray<{ name: string; dataType: string }>,
  dialect: SQLDialect
): string {
  const cteIdent = escapeSQLIdentifier(name, dialect)
  const colList = fields.map((f) => escapeSQLIdentifier(f.name, dialect)).join(', ')

  if (rows.length === 0) {
    // Empty CTE: emit `WHERE FALSE` over the column list. VALUES requires
    // at least one tuple, so synthesize an all-NULL one and exclude it.
    const allNull = fields.map(() => 'NULL').join(', ')
    return [
      `${cteIdent}(${colList}) AS (`,
      `  SELECT * FROM (VALUES (${allNull})) AS _(${colList}) WHERE FALSE`,
      `)`
    ].join('\n')
  }

  const tupleStrings: string[] = []
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const cells = fields.map((f) => {
      const v = row[f.name]
      const lit = escapeSQLValue(v, f.dataType, dialect)
      // Type-cast only on the first tuple — anchors column types for PG.
      // Subsequent rows don't need it.
      if (r === 0 && dialect === 'postgresql' && v !== null && v !== undefined) {
        return `${lit}::${normalizeTypeForCast(f.dataType)}`
      }
      // The first tuple's NULLs still need cast info or PG infers 'text'.
      if (r === 0 && dialect === 'postgresql' && (v === null || v === undefined)) {
        return `CAST(NULL AS ${normalizeTypeForCast(f.dataType)})`
      }
      return lit
    })
    tupleStrings.push(`  (${cells.join(', ')})`)
  }

  return [
    `${cteIdent}(${colList}) AS (`,
    `  VALUES`,
    tupleStrings.join(',\n'),
    `)`
  ].join('\n')
}

/**
 * Merge generated CTEs into the source SQL. If the source already begins
 * with a top-level WITH, we splice the new CTEs in between `WITH` and the
 * user's first CTE. Otherwise we prepend a fresh WITH clause.
 *
 * The detection is intentionally simple — look at the first non-whitespace,
 * non-comment token. Sufficient for the common cases. A user with truly
 * gnarly leading WITH RECURSIVE / WITH a AS MATERIALIZED can still write
 * around it; the resolver will fall through to prepend.
 */
function mergeIntoWith(ctes: string[], sql: string): string {
  if (ctes.length === 0) return sql

  const leadingWith = startsWithBareWith(sql)
  if (leadingWith.matches) {
    const before = sql.slice(0, leadingWith.afterWithIndex)
    const after = sql.slice(leadingWith.afterWithIndex)
    return `${before}\n${ctes.join(',\n')},${after}`
  }
  return `WITH\n${ctes.join(',\n')}\n${sql.trimStart()}`
}

function startsWithBareWith(sql: string): { matches: boolean; afterWithIndex: number } {
  let i = 0
  const n = sql.length
  // Skip whitespace + simple line comments at the top.
  while (i < n) {
    const c = sql[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i++
      continue
    }
    break
  }
  // Peek the keyword WITH (case-insensitive) followed by whitespace.
  const head = sql.slice(i, i + 4).toUpperCase()
  if (head === 'WITH' && /\s/.test(sql[i + 4] ?? '')) {
    return { matches: true, afterWithIndex: i + 4 }
  }
  return { matches: false, afterWithIndex: -1 }
}

/**
 * Strip parens/precision from a type string so it's a clean cast target.
 * `character varying(255)` → `character varying`, `numeric(10,2)` →
 * `numeric`. Common dialect-y noise like trailing `[]` arrays is kept.
 */
function normalizeTypeForCast(dataType: string): string {
  const trimmed = dataType.trim()
  // Strip parenthesised precision/scale — but keep `int4[]` etc intact.
  const noParen = trimmed.replace(/\([^)]*\)/g, '')
  return noParen.trim() || 'text'
}

function byteLengthUtf8(s: string): number {
  // Cheap UTF-8 byte length without pulling Buffer (renderer-safe).
  let bytes = 0
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate of a pair — counts 4 with its low surrogate.
      bytes += 4
      i++
    } else bytes += 3
  }
  return bytes
}

/** Re-export TabReference for callers building reference summaries. */
export type { TabReference }
