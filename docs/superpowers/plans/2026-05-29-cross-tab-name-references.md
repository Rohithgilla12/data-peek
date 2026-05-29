# Cross-Tab `@name` References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user name a query tab's result `@active_users` and reference it from another tab's SQL, where the reference is inlined at run time as a `VALUES`-backed CTE — with editor autocomplete, hover preview, and inline diagnostics.

**Architecture:** Renderer-only. PR #184 already shipped the pure parser/resolver/validation core; this plan adds the integration layer — a `name` field on query tabs, a pure `resolveForRun()` orchestrator that wires the tab store into the resolver, execution wiring in `handleRunQuery`, naming UI, and Monaco providers. The DB only ever sees the final rewritten SQL.

**Tech Stack:** React 19, Zustand (`tab-store`), Monaco (`@monaco-editor/react` + `monaco-editor`), `@data-peek/ui` (shadcn Dialog/ContextMenu), Vitest. Helpers from `@data-peek/shared` (`escapeSQLIdentifier`, `isSQLKeyword`, `DatabaseType`, `SQLDialect`).

**Spec:** `docs/superpowers/specs/2026-05-29-cross-tab-name-references-design.md`
**Foundations (do not rebuild):** `lib/cross-tab-{parser,resolver,name-validation,types}.ts` from PR #184.

---

## Key facts established before planning (read these first)

1. **Tabs are a flat array** `tabs: Tab[]` in `tab-store.ts`. `QueryTab` (exported) extends `BaseTab`; there is **no `name` field yet** anywhere. `Tab` is the discriminated union; `getTab(tabId)` reads one.
2. **`DatabaseType` ≠ `SQLDialect`.** `DatabaseType = 'postgresql' | 'mysql' | 'sqlite' | 'mssql'`. `SQLDialect = 'postgresql' | 'mysql' | 'mssql' | 'standard'`. The **parser** takes `DatabaseType`; the **resolver** takes `SQLDialect`. `sqlite` must map to `'standard'` (bare `VALUES`, no `::` casts — SQLite accepts both).
3. **A query tab's active result:** prefer `tab.multiResult.statements[tab.activeResultIndex]` (`{ rows, fields }`); fall back to legacy `tab.result` (`{ rows, columns }`). `QueryResult.columns` and `StatementResult.fields` are both `{ name, dataType }[]` — a direct shape match for the resolver's `ResolvableTab.fields`.
4. **MySQL/MSSQL `@var` collision:** in those dialects `@name` is also user-variable syntax. The parser's `knownNames` option suppresses non-matching `@name` tokens. Pass `knownNames` **only** for `mysql`/`mssql` (so `@count`/`@offset` aren't hijacked); leave it `undefined` for `postgresql`/`sqlite` so unknown names surface as `unknown_reference` errors.
5. **Persistence:** only **pinned** tabs persist. `partialize` hand-builds `PersistedTab`; `onRehydrateStorage` reconstructs via `{ ...t, <resets> }` — so a field added to `PersistedTab` + written in `partialize` flows back automatically through the `...t` spread.
6. **Run path:** `handleRunQuery` (`tab-query-editor.tsx:313`). `queryToRun` at `:324`; `executionId` + `updateTabExecuting` at `:327-328`; `window.api.db.queryWithTelemetry(tabConnection, queryToRun, executionId, queryTimeoutMs)` at `:344`. Errors are written with `updateTabMultiResult(tabId, null, msg)`. `tabConnection.dbType` is the database type.
7. **Monaco pattern:** `sql-editor.tsx` registers a **singleton** completion provider (`ensureCompletionProvider`) once, reading module-level state (`currentSchemas`) refreshed by the active editor via `useEffect`. We mirror this exactly.
8. **Toolbar slot:** `EditorToolbar` already accepts `watchSlot?: ReactNode` (rendered inline). We add a sibling `refsSlot?: ReactNode`.
9. **Dialog/ContextMenu** come from `@data-peek/ui`. Controlled `open` / `onOpenChange`.

**Scope note (trim vs. spec §5):** v1 ships completion + hover + diagnostic squiggles. The optional accent *token coloring* (a Monaco decoration needing a global CSS class) is deferred as polish — the squiggle + hover already deliver the signal. Everything else in the spec stands.

---

## File structure

```
stores/tab-store.ts                                   (edit) name field, setTabName/clearTabName/getNamedTabs, persistence
stores/__tests__/tab-store-naming.test.ts             (new)  store action tests
lib/cross-tab-integration.ts                          (new)  toSQLDialect, mapTabToResolvable, buildTabLookup, resolveForRun, buildCrossTabRefs, crossTabErrorMessage, CrossTabRef type
lib/__tests__/cross-tab-integration.test.ts           (new)  pure-logic tests
components/cross-tab/cross-tab-editor.ts              (new)  Monaco completion/hover/markers + module state
components/cross-tab/__tests__/cross-tab-editor.test.ts (new) pure-helper tests
components/cross-tab/cross-tab-submit-dialog.tsx     (new)  threshold confirm dialog
components/sql-editor.tsx                              (edit) crossTabRefs/crossTabDialect props + provider registration + markers
components/tab.tsx                                     (edit) @name display + "Name as @…" + inline rename input
components/query-editor/editor-toolbar.tsx            (edit) refsSlot prop
components/tab-query-editor.tsx                        (edit) wire resolveForRun, confirm dialog, refs pill, push editor context
```

---

## Phase A — Naming foundation (store)

### Task 1: `name` field + store actions + selector

**Files:**
- Modify: `apps/desktop/src/renderer/src/stores/tab-store.ts`
- Test: `apps/desktop/src/renderer/src/stores/__tests__/tab-store-naming.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/renderer/src/stores/__tests__/tab-store-naming.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useTabStore, type QueryTab } from '../tab-store'

function queryTab(id: string, connectionId: string | null, overrides: Partial<QueryTab> = {}): QueryTab {
  return {
    id,
    type: 'query',
    title: 'Query',
    isPinned: false,
    connectionId,
    createdAt: 0,
    order: 0,
    query: 'select 1',
    savedQuery: '',
    result: null,
    multiResult: null,
    activeResultIndex: 0,
    error: null,
    isExecuting: false,
    executionId: null,
    currentPage: 1,
    pageSize: 100,
    ...overrides
  }
}

describe('tab-store cross-tab naming', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [], activeTabId: null })
  })

  it('setTabName normalizes and stores a valid name', () => {
    useTabStore.setState({ tabs: [queryTab('a', 'conn1')] })
    const res = useTabStore.getState().setTabName('a', '  Active_Users  ')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.normalized).toBe('active_users')
    expect((useTabStore.getState().getTab('a') as QueryTab).name).toBe('active_users')
  })

  it('rejects a duplicate name on the same connection', () => {
    useTabStore.setState({
      tabs: [queryTab('a', 'conn1', { name: 'recent' }), queryTab('b', 'conn1')]
    })
    const res = useTabStore.getState().setTabName('b', 'recent')
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.kind).toBe('duplicate')
  })

  it('allows the same name on a different connection', () => {
    useTabStore.setState({
      tabs: [queryTab('a', 'conn1', { name: 'recent' }), queryTab('b', 'conn2')]
    })
    const res = useTabStore.getState().setTabName('b', 'recent')
    expect(res.ok).toBe(true)
  })

  it('rejects a reserved word', () => {
    useTabStore.setState({ tabs: [queryTab('a', 'conn1')] })
    const res = useTabStore.getState().setTabName('a', 'select')
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.kind).toBe('reserved_word')
  })

  it('clearTabName removes the name', () => {
    useTabStore.setState({ tabs: [queryTab('a', 'conn1', { name: 'recent' })] })
    useTabStore.getState().clearTabName('a')
    expect((useTabStore.getState().getTab('a') as QueryTab).name).toBeUndefined()
  })

  it('getNamedTabs returns only named query tabs on the connection', () => {
    useTabStore.setState({
      tabs: [
        queryTab('a', 'conn1', { name: 'recent' }),
        queryTab('b', 'conn1'),
        queryTab('c', 'conn2', { name: 'other' })
      ]
    })
    const named = useTabStore.getState().getNamedTabs('conn1')
    expect(named.map((t) => t.id)).toEqual(['a'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @data-peek/desktop test src/renderer/src/stores/__tests__/tab-store-naming.test.ts`
Expected: FAIL — `setTabName is not a function` (and `name` missing from `QueryTab`).

- [ ] **Step 3: Add the `name` field to `QueryTab`**

In `tab-store.ts`, in the `QueryTab` interface (after `pageSize: number`):

```ts
  currentPage: number
  pageSize: number
  /** User-assigned cross-tab reference name (e.g. used as @active_users). Query tabs only. */
  name?: string
```

- [ ] **Step 4: Add imports for validation at the top of `tab-store.ts`**

Add alongside the existing imports:

```ts
import { validateRefName } from '@/lib/cross-tab-name-validation'
import type { RefNameValidationResult } from '@/lib/cross-tab-types'
```

- [ ] **Step 5: Declare the actions in the store interface**

In the `TabState` interface, near `renameTab`, add:

```ts
  setTabName: (tabId: string, name: string) => RefNameValidationResult
  clearTabName: (tabId: string) => void
  getNamedTabs: (connectionId: string | null) => QueryTab[]
```

- [ ] **Step 6: Implement the actions**

In the store implementation, after `renameTab` (lines ~916-920), add:

```ts
      setTabName: (tabId, name) => {
        const tab = get().tabs.find((t) => t.id === tabId)
        if (!tab || tab.type !== 'query') {
          return { ok: false, error: { kind: 'invalid_chars', detail: 'Only query tabs can be named.' } }
        }
        const taken = new Map<string, string>()
        for (const t of get().tabs) {
          if (t.type === 'query' && t.connectionId === tab.connectionId && typeof t.name === 'string' && t.name) {
            taken.set(t.name, t.id)
          }
        }
        const result = validateRefName(name, { takenNames: taken, ownTabId: tabId })
        if (!result.ok) return result
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, name: result.normalized } : t))
        }))
        return result
      },

      clearTabName: (tabId) => {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId && t.type === 'query' ? { ...t, name: undefined } : t
          )
        }))
      },

      getNamedTabs: (connectionId) => {
        return get().tabs.filter(
          (t): t is QueryTab =>
            t.type === 'query' &&
            typeof t.name === 'string' &&
            t.name !== '' &&
            t.connectionId === connectionId
        )
      },
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @data-peek/desktop test src/renderer/src/stores/__tests__/tab-store-naming.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter @data-peek/desktop typecheck:web`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/renderer/src/stores/tab-store.ts apps/desktop/src/renderer/src/stores/__tests__/tab-store-naming.test.ts
git commit -m "feat(cross-tab): tab name field + setTabName/clearTabName/getNamedTabs"
```

---

### Task 2: Persist the name for pinned tabs

**Files:**
- Modify: `apps/desktop/src/renderer/src/stores/tab-store.ts`

This is persistence glue; verified by typecheck + manual reload (no unit test — persistence round-trips through `localStorage` and the rehydrate path).

- [ ] **Step 1: Add `name` to the `PersistedTab` interface**

In `PersistedTab` (lines ~167-180), after `notebookId?: string`:

```ts
  notebookId?: string
  /** Cross-tab reference name (query tabs only). */
  name?: string
```

- [ ] **Step 2: Write `name` in `partialize`**

In the `partialize` query/table-preview branch (the `return { ...base, query: t.query, ... }` near line 1100), add `name`:

```ts
            // query or table-preview tabs
            return {
              ...base,
              query: t.query,
              schemaName: t.type === 'table-preview' ? t.schemaName : undefined,
              tableName: t.type === 'table-preview' ? t.tableName : undefined,
              name: t.type === 'query' ? t.name : undefined
            }
```

(Rehydration is automatic: `onRehydrateStorage` builds `base = { ...t, <resets> }`, so a persisted `name` flows through the `...t` spread into the reconstructed query tab.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @data-peek/desktop typecheck:web`
Expected: no errors.

- [ ] **Step 4: Manual verification**

(Requires the dev server — ask the user before starting it.) Pin a query tab, name it via the context menu (after Task 6), reload the app, confirm the `@name` survives on the pinned tab.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/stores/tab-store.ts
git commit -m "feat(cross-tab): persist tab name for pinned tabs"
```

---

## Phase B — Resolution integration (pure lib)

### Task 3: `cross-tab-integration.ts` — the resolution orchestrator

**Files:**
- Create: `apps/desktop/src/renderer/src/lib/cross-tab-integration.ts`
- Test: `apps/desktop/src/renderer/src/lib/__tests__/cross-tab-integration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/renderer/src/lib/__tests__/cross-tab-integration.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  toSQLDialect,
  mapTabToResolvable,
  buildTabLookup,
  resolveForRun,
  buildCrossTabRefs,
  crossTabErrorMessage
} from '../cross-tab-integration'
import type { QueryTab, Tab } from '../../stores/tab-store'

function qtab(id: string, connectionId: string | null, o: Partial<QueryTab> = {}): QueryTab {
  return {
    id, type: 'query', title: 'Query', isPinned: false, connectionId,
    createdAt: 0, order: 0, query: '', savedQuery: '',
    result: null, multiResult: null, activeResultIndex: 0, error: null,
    isExecuting: false, executionId: null, currentPage: 1, pageSize: 100, ...o
  }
}

const RES = {
  columns: [{ name: 'id', dataType: 'integer' }, { name: 'email', dataType: 'text' }],
  rows: [{ id: 1, email: 'a@x.com' }, { id: 2, email: 'b@x.com' }],
  rowCount: 2,
  durationMs: 1
}

describe('toSQLDialect', () => {
  it('maps database types to escaper dialects (sqlite → standard)', () => {
    expect(toSQLDialect('postgresql')).toBe('postgresql')
    expect(toSQLDialect('mysql')).toBe('mysql')
    expect(toSQLDialect('mssql')).toBe('mssql')
    expect(toSQLDialect('sqlite')).toBe('standard')
  })
})

describe('mapTabToResolvable', () => {
  it('maps a successful legacy result to kind:success with fields from columns', () => {
    const r = mapTabToResolvable(qtab('a', 'c1', { name: 'u', result: RES }))
    expect(r.result.kind).toBe('success')
    if (r.result.kind !== 'success') return
    expect(r.result.rows).toHaveLength(2)
    expect(r.result.fields).toEqual(RES.columns)
  })

  it('prefers the active multiResult statement over legacy result', () => {
    const tab = qtab('a', 'c1', {
      name: 'u',
      result: RES,
      activeResultIndex: 1,
      multiResult: {
        statements: [
          { rows: [], fields: [], rowCount: 0 },
          { rows: [{ x: 9 }], fields: [{ name: 'x', dataType: 'integer' }], rowCount: 1 }
        ],
        totalDurationMs: 1,
        statementCount: 2
      } as QueryTab['multiResult']
    })
    const r = mapTabToResolvable(tab)
    expect(r.result.kind).toBe('success')
    if (r.result.kind !== 'success') return
    expect(r.result.rows).toEqual([{ x: 9 }])
  })

  it('maps an error to kind:error', () => {
    const r = mapTabToResolvable(qtab('a', 'c1', { name: 'u', error: 'boom' }))
    expect(r.result).toEqual({ kind: 'error', message: 'boom' })
  })

  it('maps a never-run tab to kind:none', () => {
    const r = mapTabToResolvable(qtab('a', 'c1', { name: 'u' }))
    expect(r.result).toEqual({ kind: 'none' })
  })
})

describe('buildTabLookup', () => {
  const tabs: Tab[] = [
    qtab('a', 'c1', { name: 'recent', result: RES }),
    qtab('b', 'c1'),
    qtab('c', 'c2', { name: 'recent', result: RES }),
    qtab('self', 'c1', { name: 'me', result: RES })
  ]
  it('finds a named tab on the same connection', () => {
    const lookup = buildTabLookup(tabs, 'c1', 'b')
    expect(lookup('recent')?.tabId).toBe('a')
  })
  it('does not cross connections', () => {
    const lookup = buildTabLookup(tabs, 'c1', 'b')
    // 'recent' on c1 resolves to a, never c (which is c2)
    expect(lookup('recent')?.tabId).toBe('a')
  })
  it('excludes the current tab (no self-reference via lookup)', () => {
    const lookup = buildTabLookup(tabs, 'c1', 'self')
    expect(lookup('me')).toBeNull()
  })
  it('returns null for an unknown name', () => {
    const lookup = buildTabLookup(tabs, 'c1', 'b')
    expect(lookup('nope')).toBeNull()
  })
})

describe('resolveForRun', () => {
  const tabs: Tab[] = [qtab('a', 'c1', { name: 'active_users', result: RES })]

  it('passes through SQL with no references', () => {
    const r = resolveForRun('SELECT 1', { dbType: 'postgresql', connectionId: 'c1', currentTabId: 'b', tabs })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.finalSql).toBe('SELECT 1')
    expect(r.summary.refCount).toBe(0)
  })

  it('resolves a reference into a CTE (postgres)', () => {
    const r = resolveForRun('SELECT * FROM @active_users', { dbType: 'postgresql', connectionId: 'c1', currentTabId: 'b', tabs })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.finalSql).toContain('WITH')
    expect(r.finalSql).toContain('active_users')
    expect(r.finalSql).not.toContain('@active_users')
    expect(r.summary.refCount).toBe(1)
    expect(r.summary.rowsInlined).toBe(2)
  })

  it('resolves across all dialects without throwing', () => {
    for (const dbType of ['postgresql', 'mysql', 'mssql', 'sqlite'] as const) {
      const r = resolveForRun('SELECT * FROM @active_users', { dbType, connectionId: 'c1', currentTabId: 'b', tabs })
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.finalSql).not.toContain('@active_users')
    }
  })

  it('reports unknown_reference on postgres for a missing name', () => {
    const r = resolveForRun('SELECT * FROM @ghost', { dbType: 'postgresql', connectionId: 'c1', currentTabId: 'b', tabs })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('unknown_reference')
  })

  it('on mysql, ignores @vars that are not named tabs (no error)', () => {
    const r = resolveForRun('SELECT @offset, * FROM @active_users', { dbType: 'mysql', connectionId: 'c1', currentTabId: 'b', tabs })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.finalSql).toContain('@offset') // left intact as a user-variable
    expect(r.finalSql).not.toContain('@active_users') // resolved
  })
})

describe('buildCrossTabRefs', () => {
  it('summarizes named query tabs on the connection (excluding current)', () => {
    const tabs: Tab[] = [
      qtab('a', 'c1', { name: 'active_users', title: 'Users', result: RES }),
      qtab('b', 'c1', { name: 'pending' }), // no result yet
      qtab('cur', 'c1', { name: 'self', result: RES })
    ]
    const refs = buildCrossTabRefs(tabs, 'c1', 'cur')
    expect(refs).toEqual([
      { name: 'active_users', tabTitle: 'Users', rowCount: 2, colCount: 2, hasResult: true },
      { name: 'pending', tabTitle: 'Query', rowCount: 0, colCount: 0, hasResult: false }
    ])
  })
})

describe('crossTabErrorMessage', () => {
  it('renders each error kind', () => {
    expect(crossTabErrorMessage({ kind: 'unknown_reference', name: 'x' })).toBe('No tab named @x on this connection.')
    expect(crossTabErrorMessage({ kind: 'no_result', name: 'x' })).toContain("hasn't been run")
    expect(crossTabErrorMessage({ kind: 'circular', chain: ['x'] })).toContain('reference itself')
    expect(crossTabErrorMessage({ kind: 'too_large', name: 'x', rows: 5, bytes: 1, cap: { rows: 4, bytes: 9 } })).toContain('cap 4')
    expect(crossTabErrorMessage({ kind: 'too_many_columns', name: 'x', columns: 200, cap: 100 })).toContain('200 columns')
    expect(crossTabErrorMessage({ kind: 'duplicate_cte_name', name: 'x' })).toContain('collides')
    expect(crossTabErrorMessage({ kind: 'errored_result', name: 'x', error: 'oops' })).toContain('oops')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @data-peek/desktop test src/renderer/src/lib/__tests__/cross-tab-integration.test.ts`
Expected: FAIL — `Cannot find module '../cross-tab-integration'`.

- [ ] **Step 3: Write the implementation**

Create `apps/desktop/src/renderer/src/lib/cross-tab-integration.ts`:

```ts
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
function activeResultOf(
  tab: QueryTab
): { rows: ReadonlyArray<Record<string, unknown>>; fields: ReadonlyArray<{ name: string; dataType: string }> } | null {
  const statements = tab.multiResult?.statements
  if (statements && statements.length > 0) {
    const s = statements[tab.activeResultIndex] ?? statements[0]
    if (s) return { rows: s.rows, fields: s.fields }
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
  return { tabId: tab.id, name, result: { kind: 'success', rows: active.rows, fields: active.fields } }
}

function namedQueryTabs(tabs: Tab[], connectionId: string | null, currentTabId: string): QueryTab[] {
  return tabs.filter(
    (t): t is QueryTab =>
      t.type === 'query' &&
      typeof t.name === 'string' &&
      t.name !== '' &&
      t.connectionId === connectionId &&
      t.id !== currentTabId
  )
}

/** Build the resolver's lookup: name → ResolvableTab, scoped to the connection, excluding the current tab. */
export function buildTabLookup(
  tabs: Tab[],
  connectionId: string | null,
  currentTabId: string
): (name: string) => ResolvableTab | null {
  const byName = new Map<string, QueryTab>()
  for (const t of namedQueryTabs(tabs, connectionId, currentTabId)) {
    byName.set(t.name as string, t)
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
  // MySQL/MSSQL: @name is also user-variable syntax. Restrict references to
  // currently-named tabs so @count/@offset aren't captured. PG/SQLite: leave
  // knownNames undefined so unknown @names surface as unknown_reference.
  const knownNames =
    ctx.dbType === 'mysql' || ctx.dbType === 'mssql'
      ? new Set(namedQueryTabs(ctx.tabs, ctx.connectionId, ctx.currentTabId).map((t) => t.name as string))
      : undefined

  const parsed = parseTabReferences(sql, { dialect: ctx.dbType, knownNames })
  if (parsed.references.length === 0) {
    return { ok: true, finalSql: sql, summary: { refCount: 0, rowsInlined: 0, bytesAdded: 0, references: [] } }
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
export function buildCrossTabRefs(tabs: Tab[], connectionId: string | null, currentTabId: string): CrossTabRef[] {
  return namedQueryTabs(tabs, connectionId, currentTabId).map((t) => {
    const active = activeResultOf(t)
    return {
      name: t.name as string,
      tabTitle: t.title,
      rowCount: active?.rows.length ?? 0,
      colCount: active?.fields.length ?? 0,
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
      return `@${error.name} has ${error.rows} rows (cap ${error.cap.rows}). Add a LIMIT to the referenced query.`
    case 'too_many_columns':
      return `@${error.name} has ${error.columns} columns (cap ${error.cap}).`
    case 'duplicate_cte_name':
      return `@${error.name} collides with a CTE already named in your query — rename one.`
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @data-peek/desktop test src/renderer/src/lib/__tests__/cross-tab-integration.test.ts`
Expected: PASS (all blocks).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @data-peek/desktop typecheck:web`
Expected: no errors. (If `Tab` is not exported from `tab-store.ts`, add `export` to its `type Tab = …` declaration as part of this task.)

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/src/lib/cross-tab-integration.ts apps/desktop/src/renderer/src/lib/__tests__/cross-tab-integration.test.ts
git commit -m "feat(cross-tab): resolveForRun integration layer + error messages"
```

---

## Phase C — Execution wiring

### Task 4: Wire `resolveForRun` into `handleRunQuery`

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/tab-query-editor.tsx`

Verified by typecheck + manual (the pure logic is already covered in Task 3). The confirm dialog is added in Task 5; this task runs every resolved query immediately and shows the error banner on failure.

- [ ] **Step 1: Add the import**

Near the other `@/lib` imports in `tab-query-editor.tsx`:

```ts
import { resolveForRun, crossTabErrorMessage } from '@/lib/cross-tab-integration'
```

- [ ] **Step 2: Resolve references before execution**

In `handleRunQuery`, immediately **after** the `queryToRun` line (`const queryToRun = (selectedSql ?? currentTab.query).trim()` / `if (!queryToRun) return`) and **before** `const executionId = crypto.randomUUID()`:

```ts
      // Resolve @name cross-tab references into VALUES-backed CTEs.
      const resolved = resolveForRun(queryToRun, {
        dbType: tabConnection.dbType,
        connectionId: currentTab.connectionId,
        currentTabId: tabId,
        tabs: useTabStore.getState().tabs
      })
      if (!resolved.ok) {
        updateTabMultiResult(tabId, null, crossTabErrorMessage(resolved.error))
        return
      }
      const sqlToExecute = resolved.finalSql
```

- [ ] **Step 3: Execute the resolved SQL**

Change the telemetry call argument from `queryToRun` to `sqlToExecute`:

```ts
        const response = await window.api.db.queryWithTelemetry(
          tabConnection,
          sqlToExecute,
          executionId,
          queryTimeoutMs
        )
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @data-peek/desktop typecheck:web`
Expected: no errors.

- [ ] **Step 5: Manual verification**

(Ask before starting the dev server.) Name tab A `@active_users` (after Task 6), run `SELECT 1 AS id` in it. In tab B run `SELECT * FROM @active_users` → see the result. In tab B run `SELECT * FROM @ghost` → error banner reads "No tab named @ghost on this connection."

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/src/components/tab-query-editor.tsx
git commit -m "feat(cross-tab): resolve @name references in the run path"
```

---

### Task 5: Threshold confirm dialog + inlined-refs pill

**Files:**
- Create: `apps/desktop/src/renderer/src/components/cross-tab/cross-tab-submit-dialog.tsx`
- Modify: `apps/desktop/src/renderer/src/components/query-editor/editor-toolbar.tsx`
- Modify: `apps/desktop/src/renderer/src/components/tab-query-editor.tsx`

Manual verification (UI). Threshold = `rowsInlined > 1000 || bytesAdded > 256 * 1024`.

- [ ] **Step 1: Create the dialog component**

Create `apps/desktop/src/renderer/src/components/cross-tab/cross-tab-submit-dialog.tsx`:

```tsx
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@data-peek/ui'
import { Layers } from 'lucide-react'
import type { ResolveForRunSummary } from '@/lib/cross-tab-integration'

interface CrossTabSubmitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: ResolveForRunSummary | null
  onConfirm: () => void
}

export function CrossTabSubmitDialog({ open, onOpenChange, summary, onConfirm }: CrossTabSubmitDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="size-4" />
            Running with {summary?.refCount ?? 0} tab {summary?.refCount === 1 ? 'reference' : 'references'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {summary?.references.map((r) => (
            <div key={r.name} className="flex items-center justify-between font-mono text-xs">
              <span className="text-muted-foreground">@{r.name}</span>
              <span>
                {r.rows.toLocaleString()} rows · {(r.bytes / 1024).toFixed(1)}KB
              </span>
            </div>
          ))}
          <div className="border-t border-border/50 pt-2 font-mono text-xs">
            Inlined: {summary?.rowsInlined.toLocaleString()} rows · {((summary?.bytesAdded ?? 0) / 1024).toFixed(1)}KB
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            Run query
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Add a `refsSlot` prop to `EditorToolbar`**

In `editor-toolbar.tsx`, in `EditorToolbarProps`, after `watchSlot?: ReactNode`:

```ts
  /** Slot for the Watch button — rendered between Benchmark and Format. */
  watchSlot?: ReactNode
  /** Slot for the "N refs inlined" cross-tab pill. */
  refsSlot?: ReactNode
```

Destructure `refsSlot` with the other props, and render it just after `{watchSlot}`:

```tsx
        {watchSlot}
        {refsSlot}
```

- [ ] **Step 3: Add confirm + pill state and gate in `tab-query-editor.tsx`**

Add imports:

```ts
import { CrossTabSubmitDialog } from '@/components/cross-tab/cross-tab-submit-dialog'
import type { ResolveForRunSummary } from '@/lib/cross-tab-integration'
```

Add state inside the component (near other `useState`):

```ts
  const [refsSummary, setRefsSummary] = useState<ResolveForRunSummary | null>(null)
  const [pendingHeavyRun, setPendingHeavyRun] = useState<{ summary: ResolveForRunSummary; sql: string } | null>(null)
  const skipHeavyConfirmRef = useRef(false)
  const HEAVY_ROWS = 1000
  const HEAVY_BYTES = 256 * 1024
```

- [ ] **Step 4: Extract the actual execution into a runnable callback**

Refactor the body of `handleRunQuery` that follows resolution so the execution (from `const executionId = crypto.randomUUID()` through the `try/catch/finally`) lives in a helper `executeSql(sqlToExecute: string)`. Then in `handleRunQuery`, after a successful resolve:

```ts
      const summary = resolved.summary
      setRefsSummary(summary.refCount > 0 ? summary : null)

      const isHeavy = summary.rowsInlined > HEAVY_ROWS || summary.bytesAdded > HEAVY_BYTES
      if (isHeavy && !skipHeavyConfirmRef.current) {
        setPendingHeavyRun({ summary, sql: resolved.finalSql })
        return
      }
      await executeSql(resolved.finalSql)
```

`executeSql` keeps the existing `executionId`/`updateTabExecuting`/`queryWithTelemetry`/writeback logic verbatim, taking `sqlToExecute` as its parameter.

- [ ] **Step 5: Render the dialog + pill**

Add the pill to the `EditorToolbar` usage (next to `watchSlot`):

```tsx
          refsSlot={
            refsSummary && refsSummary.refCount > 0 ? (
              <code className="text-[10px] bg-muted/50 px-2 py-0.5 rounded">
                {refsSummary.refCount} {refsSummary.refCount === 1 ? 'ref' : 'refs'} ·{' '}
                {refsSummary.rowsInlined.toLocaleString()} rows inlined
              </code>
            ) : undefined
          }
```

Render the dialog near the other dialogs at the bottom of the component's JSX:

```tsx
      <CrossTabSubmitDialog
        open={pendingHeavyRun !== null}
        onOpenChange={(o) => {
          if (!o) setPendingHeavyRun(null)
        }}
        summary={pendingHeavyRun?.summary ?? null}
        onConfirm={() => {
          const run = pendingHeavyRun
          setPendingHeavyRun(null)
          if (run) void executeSql(run.sql)
        }}
      />
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @data-peek/desktop typecheck:web`
Expected: no errors.

- [ ] **Step 7: Manual verification**

(Ask before starting the dev server.) Reference a small tab → runs immediately, pill shows "1 ref · N rows inlined". Reference a tab whose result is >1000 rows → confirm dialog appears with the per-ref breakdown; Cancel aborts, Run query proceeds.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/renderer/src/components/cross-tab/cross-tab-submit-dialog.tsx apps/desktop/src/renderer/src/components/query-editor/editor-toolbar.tsx apps/desktop/src/renderer/src/components/tab-query-editor.tsx
git commit -m "feat(cross-tab): threshold confirm dialog + inlined-refs pill"
```

---

## Phase D — Naming UI

### Task 6: `@name` display + rename affordance in `tab.tsx`

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/tab.tsx`

Manual verification (UI). `tab.tsx` reads stores directly already (`useWatchStore`); we do the same for naming to avoid threading props through `tab-bar.tsx`.

- [ ] **Step 1: Add imports + local state**

In `tab.tsx`, add:

```ts
import { useState } from 'react'
import { useTabStore } from '@/stores/tab-store'
```

Inside the `Tab` component body, near the existing `watchState` read:

```ts
  const setTabName = useTabStore((s) => s.setTabName)
  const clearTabName = useTabStore((s) => s.clearTabName)
  const isQuery = tab.type === 'query'
  const refName = isQuery ? (tab as { name?: string }).name : undefined
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
```

- [ ] **Step 2: Show the `@name` prefix in the title**

Replace the title span (`<span className="truncate text-sm">{tab.title}</span>`) with:

```tsx
          {/* Title (with @name prefix when the tab is named) */}
          {renaming ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => {
                setNameDraft(e.target.value)
                setNameError(null)
              }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') {
                  const res = setTabName(tab.id, nameDraft)
                  if (res.ok) setRenaming(false)
                  else setNameError('Invalid or duplicate name')
                } else if (e.key === 'Escape') {
                  setRenaming(false)
                }
              }}
              onBlur={() => setRenaming(false)}
              placeholder="name"
              className={cn(
                'w-24 bg-transparent text-sm outline-none border-b',
                nameError ? 'border-red-500' : 'border-primary/50'
              )}
            />
          ) : refName ? (
            <span className="truncate text-sm">
              <span className="text-primary">@{refName}</span>
            </span>
          ) : (
            <span className="truncate text-sm">{tab.title}</span>
          )}
```

(`cn` is already imported in `tab.tsx`.)

- [ ] **Step 3: Add the context-menu items**

In the `<ContextMenuContent>`, before the close items (after the Pin/Unpin block + separator), add (query tabs only):

```tsx
        {isQuery && (
          <ContextMenuItem
            onClick={() => {
              setNameDraft(refName ?? '')
              setNameError(null)
              setRenaming(true)
            }}
          >
            Name as @…
          </ContextMenuItem>
        )}
        {isQuery && refName && (
          <ContextMenuItem onClick={() => clearTabName(tab.id)}>Clear @name</ContextMenuItem>
        )}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @data-peek/desktop typecheck:web`
Expected: no errors.

- [ ] **Step 5: Manual verification**

(Ask before starting the dev server.) Right-click a query tab → "Name as @…" → type `active_users`, Enter → header shows `@active_users` in accent. Try a duplicate or `select` → red underline, not saved. "Clear @name" reverts to the title.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/src/components/tab.tsx
git commit -m "feat(cross-tab): tab @name display + rename affordance"
```

---

## Phase E — Editor magic (Monaco)

### Task 7: `cross-tab-editor.ts` module + completion provider

**Files:**
- Create: `apps/desktop/src/renderer/src/components/cross-tab/cross-tab-editor.ts`
- Test: `apps/desktop/src/renderer/src/components/cross-tab/__tests__/cross-tab-editor.test.ts`

- [ ] **Step 1: Write the failing test (pure helpers only)**

Create `apps/desktop/src/renderer/src/components/cross-tab/__tests__/cross-tab-editor.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { atTokenBeforeCursor, filterRefs } from '../cross-tab-editor'
import type { CrossTabRef } from '@/lib/cross-tab-integration'

describe('atTokenBeforeCursor', () => {
  it('detects an @-token being typed at a word boundary', () => {
    expect(atTokenBeforeCursor('SELECT * FROM @act')).toEqual({ active: true, partial: 'act' })
  })
  it('detects a bare @ with empty partial', () => {
    expect(atTokenBeforeCursor('SELECT * FROM @')).toEqual({ active: true, partial: '' })
  })
  it('ignores @@ (system variable)', () => {
    expect(atTokenBeforeCursor('SELECT @@ver').active).toBe(false)
  })
  it('ignores email-like sequences', () => {
    expect(atTokenBeforeCursor("'a@x").active).toBe(false)
  })
  it('is inactive when there is no trailing @-token', () => {
    expect(atTokenBeforeCursor('SELECT * FROM users').active).toBe(false)
  })
})

describe('filterRefs', () => {
  const refs: CrossTabRef[] = [
    { name: 'active_users', tabTitle: 'A', rowCount: 1, colCount: 1, hasResult: true },
    { name: 'archived', tabTitle: 'B', rowCount: 1, colCount: 1, hasResult: true },
    { name: 'pending', tabTitle: 'C', rowCount: 0, colCount: 0, hasResult: false }
  ]
  it('returns all refs for an empty partial', () => {
    expect(filterRefs(refs, '')).toHaveLength(3)
  })
  it('prefix-filters by name', () => {
    expect(filterRefs(refs, 'a').map((r) => r.name)).toEqual(['active_users', 'archived'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @data-peek/desktop test src/renderer/src/components/cross-tab/__tests__/cross-tab-editor.test.ts`
Expected: FAIL — `Cannot find module '../cross-tab-editor'`.

- [ ] **Step 3: Write the module**

Create `apps/desktop/src/renderer/src/components/cross-tab/cross-tab-editor.ts`:

```ts
/**
 * Monaco providers for cross-tab @name references — completion, hover, and
 * diagnostics. Follows the singleton-provider + module-state pattern from
 * sql-editor.tsx: the active editor pushes refs via updateCrossTabRefs and
 * the providers read the latest snapshot.
 */

import * as monaco from 'monaco-editor'
import type { Monaco } from '@monaco-editor/react'
import type { DatabaseType } from '@data-peek/shared'
import { parseTabReferences } from '@/lib/cross-tab-parser'
import type { CrossTabRef } from '@/lib/cross-tab-integration'

let currentRefs: CrossTabRef[] = []
let providersRegistered = false

const MARKER_OWNER = 'cross-tab'

export function updateCrossTabRefs(refs: CrossTabRef[]): void {
  currentRefs = refs
}

/** True when the text immediately before the cursor is an @-token being typed (not @@, not email). */
export function atTokenBeforeCursor(textBeforeCursor: string): { active: boolean; partial: string } {
  const m = textBeforeCursor.match(/@([a-z0-9_]*)$/i)
  if (!m) return { active: false, partial: '' }
  const at = textBeforeCursor.length - m[0].length
  const prev = at > 0 ? textBeforeCursor[at - 1] : ''
  if (/[A-Za-z0-9_.$@]/.test(prev)) return { active: false, partial: '' }
  return { active: true, partial: m[1].toLowerCase() }
}

export function filterRefs(refs: CrossTabRef[], partial: string): CrossTabRef[] {
  if (!partial) return refs
  return refs.filter((r) => r.name.startsWith(partial))
}

/** Register the completion + hover providers once, globally. */
export function ensureCrossTabProviders(monacoInstance: Monaco): void {
  if (providersRegistered) return
  providersRegistered = true

  monacoInstance.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['@'],
    provideCompletionItems: (model, position) => {
      const textBeforeCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column
      })
      const tok = atTokenBeforeCursor(textBeforeCursor)
      if (!tok.active) return { suggestions: [] }
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }
      return {
        suggestions: filterRefs(currentRefs, tok.partial).map((r) => ({
          label: `@${r.name}`,
          kind: monacoInstance.languages.CompletionItemKind.Variable,
          insertText: r.name,
          range,
          detail: r.hasResult ? `${r.rowCount} rows · ${r.colCount} cols` : 'not run yet',
          documentation: { value: `Result of tab **${r.tabTitle}**` },
          sortText: '0' + r.name
        }))
      }
    }
  })

  monacoInstance.languages.registerHoverProvider('sql', {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position)
      if (!word) return null
      const lineText = model.getLineContent(position.lineNumber)
      if (lineText[word.startColumn - 2] !== '@') return null
      const ref = currentRefs.find((r) => r.name === word.word.toLowerCase())
      if (!ref) return null
      return {
        range: new monacoInstance.Range(position.lineNumber, word.startColumn - 1, position.lineNumber, word.endColumn),
        contents: [
          { value: `**@${ref.name}** — tab "${ref.tabTitle}"` },
          {
            value: ref.hasResult
              ? `${ref.rowCount} rows · ${ref.colCount} columns`
              : "_hasn't been run yet_"
          }
        ]
      }
    }
  })
}

/**
 * Recompute diagnostic markers for the model. Unknown names → Error; named
 * but not-yet-run → Warning. For mysql/mssql, only known names are parsed
 * (so @vars aren't flagged).
 */
export function updateCrossTabMarkers(monacoInstance: Monaco, model: monaco.editor.ITextModel, dbType: DatabaseType): void {
  const byName = new Map(currentRefs.map((r) => [r.name, r]))
  const knownNames = dbType === 'mysql' || dbType === 'mssql' ? new Set(byName.keys()) : undefined
  const parsed = parseTabReferences(model.getValue(), { dialect: dbType, knownNames })

  const markers: monaco.editor.IMarkerData[] = []
  for (const ref of parsed.references) {
    const known = byName.get(ref.name)
    const start = model.getPositionAt(ref.start)
    const end = model.getPositionAt(ref.end)
    const base = {
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column
    }
    if (!known) {
      markers.push({ ...base, severity: monacoInstance.MarkerSeverity.Error, message: `No tab named @${ref.name} on this connection.` })
    } else if (!known.hasResult) {
      markers.push({ ...base, severity: monacoInstance.MarkerSeverity.Warning, message: `@${ref.name} hasn't been run yet.` })
    }
  }
  monacoInstance.editor.setModelMarkers(model, MARKER_OWNER, markers)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @data-peek/desktop test src/renderer/src/components/cross-tab/__tests__/cross-tab-editor.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @data-peek/desktop typecheck:web
git add apps/desktop/src/renderer/src/components/cross-tab/cross-tab-editor.ts apps/desktop/src/renderer/src/components/cross-tab/__tests__/cross-tab-editor.test.ts
git commit -m "feat(cross-tab): Monaco completion/hover/markers module"
```

---

### Task 8: Wire the providers into `SQLEditor` + push context from `tab-query-editor`

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/sql-editor.tsx`
- Modify: `apps/desktop/src/renderer/src/components/tab-query-editor.tsx`

Manual verification (editor behavior).

- [ ] **Step 1: Add imports + props to `SQLEditor`**

In `sql-editor.tsx`, add imports:

```ts
import type { DatabaseType } from '@data-peek/shared'
import type { CrossTabRef } from '@/lib/cross-tab-integration'
import { ensureCrossTabProviders, updateCrossTabRefs, updateCrossTabMarkers } from '@/components/cross-tab/cross-tab-editor'
```

Add to `SQLEditorProps`:

```ts
  /** Named tabs available for @name references on this connection. */
  crossTabRefs?: CrossTabRef[]
  /** Dialect used for cross-tab parsing/markers. */
  crossTabDialect?: DatabaseType
```

Destructure them in the component signature with defaults: `crossTabRefs = []`, `crossTabDialect`.

- [ ] **Step 2: Register providers on mount + keep a dialect ref**

Add a ref near `monacoRef`:

```ts
  const crossTabDialectRef = React.useRef<DatabaseType | undefined>(crossTabDialect)
  React.useEffect(() => {
    crossTabDialectRef.current = crossTabDialect
  }, [crossTabDialect])
```

In `handleEditorDidMount`, after `ensureCompletionProvider(monaco)`:

```ts
    updateCrossTabRefs(crossTabRefs)
    ensureCrossTabProviders(monaco)
    const model = editor.getModel()
    if (model && crossTabDialectRef.current) {
      updateCrossTabMarkers(monaco, model, crossTabDialectRef.current)
    }
```

- [ ] **Step 3: Refresh refs + markers when they change**

Add effects (near the existing schema/snippet effects):

```ts
  React.useEffect(() => {
    updateCrossTabRefs(crossTabRefs)
    const model = editorRef.current?.getModel()
    if (monacoRef.current && model && crossTabDialect) {
      updateCrossTabMarkers(monacoRef.current, model, crossTabDialect)
    }
  }, [crossTabRefs, crossTabDialect])
```

- [ ] **Step 4: Recompute markers on edit**

In `handleChange`, after `onChange?.(newValue ?? '')`:

```ts
    const model = editorRef.current?.getModel()
    if (monacoRef.current && model && crossTabDialectRef.current) {
      updateCrossTabMarkers(monacoRef.current, model, crossTabDialectRef.current)
    }
```

- [ ] **Step 5: Push context from `tab-query-editor.tsx`**

Add import:

```ts
import { buildCrossTabRefs } from '@/lib/cross-tab-integration'
```

Read all tabs and compute refs (near the other store reads):

```ts
  const allTabs = useTabStore((s) => s.tabs)
  const crossTabRefs = React.useMemo(
    () => buildCrossTabRefs(allTabs, tab?.connectionId ?? null, tabId),
    [allTabs, tab?.connectionId, tabId]
  )
```

Pass to `<SQLEditor>`:

```tsx
              schemas={schemas}
              snippets={allSnippets}
              crossTabRefs={crossTabRefs}
              crossTabDialect={tabConnection?.dbType}
```

(`React` is already imported in `tab-query-editor.tsx`; if it uses named hooks, use `useMemo` directly with the existing import style.)

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @data-peek/desktop typecheck:web`
Expected: no errors.

- [ ] **Step 7: Manual verification**

(Ask before starting the dev server.) Name tab A `@active_users` and run it. In tab B: type `SELECT * FROM @` → autocomplete lists `@active_users` with "N rows · M cols". Type `@ghost` → red squiggle "No tab named @ghost". Hover `@active_users` → preview popover. Name a tab but don't run it, reference it → yellow squiggle "hasn't been run yet".

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/renderer/src/components/sql-editor.tsx apps/desktop/src/renderer/src/components/tab-query-editor.tsx
git commit -m "feat(cross-tab): wire Monaco @name completion/hover/diagnostics"
```

---

## Phase F — Final verification

### Task 9: Full suite + docs + branch wrap-up

- [ ] **Step 1: Run the full test suite**

Run: `pnpm --filter @data-peek/desktop test`
Expected: all green, including the pre-existing 885 lines of cross-tab parser/resolver/validation tests + the new integration, store, and editor-helper tests.

- [ ] **Step 2: Full typecheck + lint**

Run: `pnpm --filter @data-peek/desktop typecheck && pnpm --filter @data-peek/desktop lint`
Expected: no errors.

- [ ] **Step 3: Update feature docs (per CLAUDE.md "Feature Documentation")**

Add a "Cross-tab references" entry to `README.md` Features and to the relevant `docs/` page. Note the marketing-site (`apps/web`) update can follow at launch.

- [ ] **Step 4: Commit docs**

```bash
git add README.md docs
git commit -m "docs(cross-tab): document @name references"
```

- [ ] **Step 5: Manual end-to-end demo**

(Ask before starting the dev server.) The full flow from the spec's marketing angle: tab A `SELECT id FROM users WHERE last_seen > now() - interval '24 hours'`, name it `@active_users`, run. Tab B: `SELECT count(*) FROM events WHERE user_id IN (@active_users)` via autocomplete → result lands; pill shows refs inlined.

---

## Self-review

**Spec coverage:**
- Tab naming (store + UI) → Tasks 1, 2, 6. ✓
- Lookup adapter (`mapTabToResolvable`, `buildTabLookup`) → Task 3. ✓
- Execution wiring in `handleRunQuery` → Task 4. ✓
- Threshold-only confirm + indicator pill → Task 5. ✓
- Editor magic (completion, hover, diagnostics) → Tasks 7, 8. ✓
- Error handling via existing banner → Task 4 (`crossTabErrorMessage`, tested in Task 3). ✓
- `DatabaseType`→`SQLDialect` reconciliation → `toSQLDialect` in Task 3. ✓
- Only query tabs nameable → guarded in `setTabName`, `buildTabLookup`, `buildCrossTabRefs`, and the `tab.tsx` menu. ✓
- Deferred (staleness, settings, notebook, table-preview refs, error action buttons, token accent-coloring) → not implemented, by design. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. UI/editor glue tasks that can't be unit-tested use explicit manual-verification steps with concrete expected behavior (not "test the above"). ✓

**Type consistency:** `ResolveForRunSummary`, `ResolveForRunResult`, `CrossTabRef`, `crossTabErrorMessage`, `resolveForRun`, `buildCrossTabRefs`, `toSQLDialect` are defined in Task 3 and consumed with matching signatures in Tasks 5 and 8. `setTabName` returns `RefNameValidationResult` (Task 1) consumed in Task 6. The resolver's `ResolvableTab`/`ResolveErrorKind`/`ResolveResult` shapes match #184's exported types. ✓

**Assumption to verify during Task 3:** that `tab-store.ts` exports the `Tab` union type. If not, the Task 3 typecheck step adds the `export`.
