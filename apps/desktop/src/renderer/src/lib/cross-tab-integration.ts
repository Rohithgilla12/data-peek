/**
 * Cross-Tab integration layer.
 *
 * The seam between the renderer (tab store, query execution, Monaco) and the
 * pure parser/resolver shipped in #184. Everything here is pure and unit-
 * tested; React/store wiring lives in the components that call resolveForRun.
 */

import type { DatabaseType, SQLDialect } from '@data-peek/shared'
import { parseTabReferences } from './cross-tab-parser'
import { resolveReferences, type ResolvableTab } from './cross-tab-resolver'
import type { ResolveErrorKind, ResolveResult } from './cross-tab-types'
import type { QueryTab, Tab } from '../stores/tab-store'

/**
 * Map a connection's DatabaseType to the escaper's SQLDialect.
 * DatabaseType has 'sqlite' (no escaper dialect) — 'standard' gives bare
 * VALUES and no ::type casts, which SQLite accepts.
 */
export function toSQLDialect(dbType: DatabaseType): SQLDialect {
  switch (dbType) {
    case 'postgresql':
      return 'postgresql'
    case 'mysql':
      return 'mysql'
    case 'mssql':
      return 'mssql'
    case 'sqlite':
      return 'standard'
  }
}

/** The active result set of a query tab: prefer the active multi-statement, else legacy result. */
function activeResultOf(tab: QueryTab): {
  rows: ReadonlyArray<Record<string, unknown>>
  fields: ReadonlyArray<{ name: string; dataType: string }>
} | null {
  const statements = tab.multiResult?.statements
  if (statements && statements.length > 0) {
    // Out-of-bounds activeResultIndex (e.g. a re-run produced fewer statements)
    // → treat as no usable result rather than silently inlining the wrong one.
    const s = tab.activeResultIndex < statements.length ? statements[tab.activeResultIndex] : null
    return s ? { rows: s.rows, fields: s.fields } : null
  }
  if (tab.result) return { rows: tab.result.rows, fields: tab.result.columns }
  return null
}

/** Shape a query tab's current state into the resolver's ResolvableTab. */
export function mapTabToResolvable(tab: QueryTab): ResolvableTab {
  const name = tab.name ?? ''
  if (tab.error) {
    return { tabId: tab.id, name, result: { kind: 'error', message: tab.error } }
  }
  const active = activeResultOf(tab)
  if (!active) {
    return { tabId: tab.id, name, result: { kind: 'none' } }
  }
  return {
    tabId: tab.id,
    name,
    result: { kind: 'success', rows: active.rows, fields: active.fields }
  }
}

function namedQueryTabs(
  tabs: Tab[],
  connectionId: string | null,
  currentTabId: string
): Array<QueryTab & { name: string }> {
  return tabs.filter(
    (t): t is QueryTab & { name: string } =>
      t.type === 'query' &&
      typeof t.name === 'string' &&
      t.name !== '' &&
      t.connectionId === connectionId &&
      t.id !== currentTabId
  )
}

/**
 * Build the resolver's lookup: name → ResolvableTab, scoped to the
 * connection, excluding the current tab.
 */
export function buildTabLookup(
  tabs: Tab[],
  connectionId: string | null,
  currentTabId: string
): (name: string) => ResolvableTab | null {
  const byName = new Map<string, QueryTab>()
  for (const t of namedQueryTabs(tabs, connectionId, currentTabId)) {
    byName.set(t.name, t)
  }
  return (name) => {
    const tab = byName.get(name)
    return tab ? mapTabToResolvable(tab) : null
  }
}

export interface ResolveForRunSummary {
  refCount: number
  rowsInlined: number
  bytesAdded: number
  references: ResolveResult['references']
}

export type ResolveForRunResult =
  | { ok: true; finalSql: string; summary: ResolveForRunSummary }
  | { ok: false; error: ResolveErrorKind }

export interface ResolveForRunContext {
  dbType: DatabaseType
  connectionId: string | null
  currentTabId: string
  tabs: Tab[]
}

/** Parse + resolve a query's @name references into a runnable SQL string. Pure. */
export function resolveForRun(sql: string, ctx: ResolveForRunContext): ResolveForRunResult {
  const knownNames =
    ctx.dbType === 'mysql' || ctx.dbType === 'mssql'
      ? new Set(namedQueryTabs(ctx.tabs, ctx.connectionId, ctx.currentTabId).map((t) => t.name))
      : undefined

  const parsed = parseTabReferences(sql, { dialect: ctx.dbType, knownNames })
  if (parsed.references.length === 0) {
    return {
      ok: true,
      finalSql: sql,
      summary: { refCount: 0, rowsInlined: 0, bytesAdded: 0, references: [] }
    }
  }

  const lookup = buildTabLookup(ctx.tabs, ctx.connectionId, ctx.currentTabId)
  const resolved = resolveReferences(sql, parsed, {
    lookup,
    currentTabId: ctx.currentTabId,
    dialect: toSQLDialect(ctx.dbType)
  })
  if (!resolved.ok) return { ok: false, error: resolved.error }

  return {
    ok: true,
    finalSql: resolved.result.finalSql,
    summary: {
      refCount: resolved.result.references.length,
      rowsInlined: resolved.result.rowsInlined,
      bytesAdded: resolved.result.bytesAdded,
      references: resolved.result.references
    }
  }
}

/** A named tab summarized for the Monaco editor (autocomplete/hover/markers). */
export interface CrossTabRef {
  name: string
  tabTitle: string
  rowCount: number
  colCount: number
  hasResult: boolean
}

/** Summarize the named tabs available to the current editor for the Monaco providers. */
export function buildCrossTabRefs(
  tabs: Tab[],
  connectionId: string | null,
  currentTabId: string
): CrossTabRef[] {
  return namedQueryTabs(tabs, connectionId, currentTabId).map((t) => {
    const active = activeResultOf(t)
    return {
      name: t.name,
      tabTitle: t.title,
      rowCount: active?.rows.length ?? 0,
      colCount: active?.fields.length ?? 0,
      // error beats any stale result — same priority as mapTabToResolvable
      hasResult: !!active && !t.error
    }
  })
}

/** Map a resolve error to a user-facing message shown in the tab error banner. */
export function crossTabErrorMessage(error: ResolveErrorKind): string {
  switch (error.kind) {
    case 'unknown_reference':
      return `No tab named @${error.name} on this connection.`
    case 'no_result':
      return `@${error.name} hasn't been run yet — run it first.`
    case 'errored_result':
      return `@${error.name}'s last run errored: ${error.error}`
    case 'circular':
      return `@${error.chain.join(' → @')} can't reference itself.`
    case 'too_large':
      return (
        `@${error.name} has ${error.rows} rows (cap ${error.cap.rows}). ` +
        'Add a LIMIT to the referenced query.'
      )
    case 'too_many_columns':
      return `@${error.name} has ${error.columns} columns (cap ${error.cap}).`
    case 'duplicate_cte_name':
      return `@${error.name} collides with a CTE already named in your query — rename one.`
  }
}
