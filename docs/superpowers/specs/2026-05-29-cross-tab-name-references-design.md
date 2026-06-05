# Cross-Tab `@name` References — v1 Integration Design

**Date:** 2026-05-29
**Status:** Approved (design & implementation plan)
**Builds on:** PR #184 (`feat(cross-tab): @name references — foundations`)
**Parent plan:** `docs/PLAN-cross-tab-query.md`

## Overview

Most analytical work is two or three dependent queries, not a 20-cell notebook.
Today you write query A in tab 1, see the result, then write query B in tab 2 —
with no way to use tab 1's result as input to tab 2 short of copy-pasting values
or rewriting A as a CTE.

This feature adds **named tab references**: name a query tab's result `@active_users`,
then write `SELECT … WHERE user_id IN (@active_users)` in another tab. At submit
time the referenced result is inlined as a `VALUES`-backed CTE. No notebook
ceremony, no server-side staging.

PR #184 already merged the **pure logic core** — parser, resolver, name validation,
types — with 885 lines of tests. This spec covers the **remaining integration layer**:
tab naming, the lookup adapter, query-execution wiring, and the editor experience
(autocomplete / hover / diagnostics).

## What #184 already shipped (do not rebuild)

All in `apps/desktop/src/renderer/src/lib/`, all unit-tested, **none wired into the app**:

- `cross-tab-types.ts` — `TabReference`, `ParsedSql`, `ResolveCaps`
  (`DEFAULT_RESOLVE_CAPS` = 10k rows / 5MB / 100 cols), `ResolveResult`,
  `ResolveErrorKind`, `RefNameValidationResult`.
- `cross-tab-parser.ts` — `parseTabReferences(sql, { dialect, knownNames? })`.
  A dialect-aware single-pass scanner that finds `@name` tokens while skipping
  string literals, quoted identifiers (`"…"`, backtick, `[…]`), line/block
  comments, Postgres dollar-quoted bodies, emails, and `@@var` system variables.
- `cross-tab-resolver.ts` — `resolveReferences(source, parsed, ctx)` where
  `ctx = { lookup, currentTabId, dialect, caps? }`. Builds per-dialect
  `VALUES`-CTEs (PG/SQLite typed `VALUES`, MySQL `VALUES ROW(...)`, MSSQL
  `SELECT * FROM (VALUES …)`), merges into a leading `WITH`/`WITH RECURSIVE`,
  enforces caps, detects self-reference, and substitutes `@name` → quoted
  identifier. Returns `{ ok: true, result } | { ok: false, error }`.
- `cross-tab-name-validation.ts` — `validateRefName(candidate, { takenNames?, ownTabId? })`.
  Shape (`/^[a-z][a-z0-9_]*$/`, ≤32 chars), reserved-word rejection
  (local list + shared `isSQLKeyword`), per-connection uniqueness.

The resolver is **decoupled via a `lookup(name) => ResolvableTab | null` callback**,
so the entire remaining feature is integration — no changes to the parser or resolver.

## Decisions (locked during brainstorming)

1. **Scope = functional core + editor magic.** Tab naming, lookup adapter,
   execution wiring, error banners, *plus* Monaco autocomplete / hover preview /
   inline diagnostics. Staleness tracking, settings panel, and notebook-cell
   references are deferred.
2. **Confirm UX = threshold-only.** Run immediately by default with a subtle
   "refs inlined" indicator; show a blocking confirm dialog **only** when the
   inlined payload is heavy (>1,000 rows OR >256KB). This honors CLAUDE.md
   design principle #2 ("speed over ceremony — no confirmation dialogs where
   undo works") while keeping a guard before sending a large query to a DB. The
   hard caps (10k rows / 5MB) still hard-fail with a clear error.
3. **Architecture = name on the tab + pure lookup helper** (Approach A). No new
   store. Add `name?` to `QueryTab`; derive the resolver's `lookup` with a pure
   `buildTabLookup()` helper. Matches the plan's Phase 1 and #184's pure-function
   ethos; deferred staleness later just adds a field.

## Settled by investigation

- **Resolution runs renderer-side**, inside `handleRunQuery`
  (`tab-query-editor.tsx:313`), right after `queryToRun` is computed (`:323`)
  and before `window.api.db.queryWithTelemetry(...)` (`:344`). Matches the
  `cross-tab-types.ts` note that the feature is renderer-only. **No IPC / main /
  `@data-peek/shared` changes.**
- **`@name` inlines a named query tab's full in-memory active result.**
  `QueryTab` holds its complete result set in `result.rows` and uses *client-side*
  pagination (`currentPage`/`pageSize`) for display — only `TablePreviewTab` has
  server-side `totalRowCount`. So there is no "first page only" wrong-answer trap
  for query tabs.
- **`QueryResult.columns` is `{ name, dataType }[]`** — a direct shape match for
  the resolver's `ResolvableTab.result.fields`. Mapping is a field rename, not a
  transform.
- **Only query tabs are nameable in v1.** Table-preview tabs (server-side paged)
  and notebook cells are out — sidesteps partiality and scopes cleanly.
- **The editor experience extends the existing singleton-provider pattern.**
  `sql-editor.tsx` already registers a global SQL completion provider once
  (`ensureCompletionProvider`) reading module-level mutable state
  (`currentSchemas`/`currentSnippets`) that the active editor refreshes via
  `useEffect`. Cross-tab providers follow the identical shape.

## Architecture & data flow

```text
User runs SQL in tab B (⌘↵)
        │
handleRunQuery (tab-query-editor.tsx:313)
        │  queryToRun computed (:323)
        ▼
resolveForRun(queryToRun, { dialect, connectionId, currentTabId, tabs })   ← NEW (pure)
        │   ├─ parseTabReferences(sql, { dialect, knownNames })   [#184]
        │   ├─ buildTabLookup(tabs, connectionId, currentTabId)   ← NEW
        │   └─ resolveReferences(sql, parsed, ctx)               [#184]
        ▼
   ok? ──no──▶ map ResolveErrorKind → message → updateTabResult(tabId, null, msg)
        │ yes
   over threshold (>1k rows OR >256KB)? ──yes──▶ submit dialog → Cancel | Run
        │ no / confirmed
        ▼
window.api.db.queryWithTelemetry(tabConnection, finalSql, …)   [existing, :344]
        │
        ▼
   toolbar pill: "N refs · M rows inlined"
```

The database only ever receives `finalSql` (the user's SQL with `@name` tokens
replaced by quoted identifiers and the matching `VALUES`-CTEs prepended).

## Components

### 1. Tab naming — `stores/tab-store.ts`

- Add `name?: string` to the `QueryTab` interface and to `PersistedTab` (so the
  name survives app restart).
- `setTabName(tabId, name): RefNameValidationResult` — normalizes and validates
  via `validateRefName`, passing `takenNames` = names of *other* tabs on the same
  connection (from `getNamedTabs(connectionId)`) and `ownTabId = tabId`. On
  success persists the normalized name; returns the validation result so the UI
  renders inline errors. Does **not** throw.
- `clearTabName(tabId)` — removes the name (header reverts to auto `title`).
- `getNamedTabs(connectionId): Array<{ tabId; name; title }>` — selector for the
  same connection. (Closing a tab removes its name implicitly, since the name
  lives on the tab object — no separate cleanup.)

### 2. Tab-naming UI — `components/tab.tsx`

- Entry points: **double-click the tab title**, or **right-click → "Name as @…"**.
  Reuses the existing inline-rename affordance used for `renameTab`, but writes
  `name` instead of `title`.
- Inline input validates on each keystroke: invalid shape / duplicate / reserved
  word → red underline + short message. `Enter` saves, `Esc` cancels.
- A named tab shows the **`@name` prefix** in the header with a subtle accent so
  it reads as referenceable. Clearing reverts to the auto-derived title.

### 3. Lookup adapter — `lib/cross-tab-integration.ts` (NEW, pure)

- `mapTabToResolvable(tab): ResolvableTab` — maps a `QueryTab`'s **active** result:
  - active result = legacy `result`, or `multiResult.results[activeResultIndex]`
    when multi-statement.
  - `null` result → `{ kind: 'none' }`; stored error → `{ kind: 'error', message }`;
    success → `{ kind: 'success', rows: r.rows, fields: r.columns }`.
- `buildTabLookup(tabs, connectionId, currentTabId): (name) => ResolvableTab | null`
  — connection-scoped, excludes the current tab, matches on `tab.name`.
- `resolveForRun(sql, ctx): ResolveForRunResult` — orchestrates
  parse → build lookup → resolve. Returns a discriminated union:
  `{ ok: true; finalSql; summary: { refCount; rowsInlined; bytesAdded; references } }`
  or `{ ok: false; error: ResolveErrorKind }`. This is the single seam that
  `handleRunQuery` calls — fully unit-testable without React.
- `dialectFor(dbType)` — maps the connection's `dbType` to the parser's
  `DatabaseType` and the resolver's `SQLDialect`. (Implementation note: both come
  from `@data-peek/shared`; reconcile the two unions here so callers pass one
  connection type.)

### 4. Editor experience — `components/cross-tab/cross-tab-editor.ts` (NEW)

Extends the singleton-provider pattern from `sql-editor.tsx`:

- Module state `currentNamedTabs` + `currentConnectionId`, refreshed by the active
  query editor via `useEffect` (mirrors how `currentSchemas`/`currentSnippets`
  are updated today).
- **Completion** — a provider with `triggerCharacters: ['@']`. When the cursor is
  inside an `@…` token, suggest connection-scoped named tabs (excluding the
  current tab); `detail` = "N rows · M cols", `documentation` = a short rows
  preview.
- **Hover** — `registerHoverProvider('sql')` for `@name`: name, source tab title,
  row/column counts, first-rows preview.
- **Diagnostics + accent styling** — on content change (debounced), parse the
  current SQL and `setModelMarkers`: `Error` squiggle for unknown names, `Warning`
  for "exists but not run yet". A decoration gives resolved `@name` tokens the
  accent color (avoids a custom Monaco tokenizer).
- Pure helpers (cursor-in-`@`-token test, completion filter) extracted for unit
  tests.

### 5. Confirm / indicator UX

- `cross-tab-submit-dialog.tsx` (NEW) — shown only when
  `summary.rowsInlined > 1000 || summary.bytesAdded > 256*1024`. Lists per-ref
  breakdown + totals; `[Cancel] [Run]`; a "don't ask again this session" toggle.
- Below threshold → **run immediately**.
- Whenever any ref was inlined, a subtle **"N refs · M rows inlined"** pill appears
  in the editor toolbar / results header.

### 6. Error handling

Each `ResolveErrorKind` maps to a clear message rendered via the **existing tab
error banner** (`updateTabResult(tabId, null, msg)`):

| kind | message |
|---|---|
| `unknown_reference` | No tab named `@x` on this connection. |
| `no_result` | `@x` hasn't been run yet. |
| `errored_result` | `@x`'s last run errored: *msg*. |
| `circular` | `@x` can't reference itself. |
| `too_large` | `@x` has N rows; cap is 10,000. Add a `LIMIT`. |
| `too_many_columns` | `@x` has N columns; cap is 100. |
| `duplicate_cte_name` | `@x` collides with a CTE in your query — rename one. |

Editor squiggles + hover prevent most of these before the user runs. Resolve-error
**action buttons** ("Open and run @x") are a stretch goal, not v1.

## Testing

- **Unit (Vitest)** — `lib/__tests__/cross-tab-integration.test.ts`:
  `mapTabToResolvable` (success / error / none / multi-statement / missing),
  `buildTabLookup` (connection scoping + self-exclusion), `resolveForRun`
  end-to-end across all four dialects, and the threshold decision. Plus the
  extracted editor pure helpers.
- **Store** — `setTabName` normalization, per-connection uniqueness, `clearTabName`,
  persistence round-trip.
- Builds on #184's existing parser/resolver/validation tests (885 lines); those
  cover CTE generation and edge cases and are not re-tested here.
- **Manual** — the demo flow: name tab A `@active_users`, reference it from tab B,
  run, confirm the CTE-backed result; verify squiggle on an unknown name and
  hover preview on a known one.

## Out of scope (deferred)

- Staleness tracking + "stale" badges (Phase 6).
- Cross-Tab settings panel — caps remain at `DEFAULT_RESOLVE_CAPS` (Phase 8).
- Notebook-cell references (Phase 7).
- Table-preview (server-side-paged) tabs as reference targets.
- Resolve-error action buttons ("Open and run").

## File plan

```text
stores/tab-store.ts                                 (edit: name field, setTabName/clearTabName, getNamedTabs)
lib/cross-tab-integration.ts                        (NEW: mapTabToResolvable, buildTabLookup, resolveForRun, dialectFor)
lib/__tests__/cross-tab-integration.test.ts         (NEW)
components/tab.tsx                                   (edit: rename affordance + @name display)
components/tab-query-editor.tsx                     (edit: wire resolveForRun, threshold dialog, pill, push editor context)
components/cross-tab/cross-tab-editor.ts            (NEW: Monaco completion/hover/markers/decorations + module state)
components/cross-tab/cross-tab-submit-dialog.tsx    (NEW)
```

## Risks

| Risk | Mitigation |
|---|---|
| `DatabaseType` (parser) vs `SQLDialect` (resolver) unions diverge | Centralize the map in `dialectFor()`; assert exhaustiveness |
| Global Monaco providers don't know the focused editor's connection | Active editor pushes `currentConnectionId` to module state on focus/update, exactly like the schema provider does today |
| Multi-statement tab — which result does `@name` use? | The **active** result set (`activeResultIndex`); documented and tested |
| Large in-memory result inlined into a prod query | Threshold confirm dialog + hard caps (10k/5MB) hard-fail with a clear message |
| Marker recompute on every keystroke is costly | Debounce; parse is a cheap single pass |
