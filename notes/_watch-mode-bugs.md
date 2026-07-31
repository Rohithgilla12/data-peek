# Watch Mode — two bugs found while filming it

Found 2026-07-30 while building Playwright capture clips for the marketing site.
Trying to film the feature is what surfaced them; neither is caught by the
existing test suite or by `tests/e2e/watch-mode.spec.ts` (which asserts row
*count*, never that values change).

Marketing copy being tested against, from `apps/web/src/components/marketing/features.tsx`:

> **Watch Mode** — Pin a SELECT, see it move. Re-runs on a cadence with live
> cell-level diff highlights. Refuses to poll INSERT/UPDATE/DELETE/DDL.

## Bug 1 — grid never refreshed on a tick — FIXED

**Symptom:** Watch Mode painted "this cell changed" highlights over the *old*
value. Displayed data never updated while watching.

**Cause:** the tick path wrote rows only into `useWatchStore`. `updateTabResult`
— the sole writer of `tab.result`, which the grid renders — was called only from
the manual Run path (`tab-query-editor.tsx:404`) and explain-error paths.
`editable-data-table.tsx` consumed `watchState` purely to mount the decoration
overlay, passing it `rows={rows}`, i.e. the stale host rows. The overlay paints
rectangles and cannot change cell text.

So the differ was correct — it compared two freshly-fetched snapshots — and the
UI highlighted a cell whose on-screen value was stale.

**Fix:** commits `f2ccecd`, `efa23e7`, `4b10884` on `feat/feature-clips`.

New `useTabStore.applyWatchResult` writes tick rows into `tab.result`. The
non-obvious part: `updateTabResult` deliberately drops pending inline edits (see
`stores/__tests__/tab-result-invalidation.test.ts`), because rows changing under
a pending edit lets that edit commit against the wrong row. A naive per-tick
call would therefore have destroyed a user's in-progress edit every few seconds.
So `applyWatchResult` **declines** the refresh while edits are pending or a cell
editor is open, and the watch pill renders **Held** (paused styling) rather than
counting down to ticks that do nothing.

Also in that fix:
- diff baseline is read from `tab.result` at tick time rather than cached in the
  scheduler. The cached version desynced on the commit-then-re-run path that most
  often follows a declined tick, producing **missed highlights**.
- `autoResetPageIndex: !isWatching` on `DataTable` — a watched multi-page result
  was bouncing to page 1 every tick.
- dropped a `computeDiff` call that ran with `next.rows = []` on failed polls,
  which had been inflating `rowsRemovedCumulative` and firing spurious
  rows-removed alerts on every failed tick.

Suite: 1137 passed / 56 skipped / 0 failures (was 1119). Reviewed, all findings
closed.

## Bug 2 — diff highlights invisible at 50 rows or fewer — FIXED

Fixed 2026-07-31 in `3be3cb9` on `fix/watch-mode-diff-highlights`. The account
below is the original diagnosis, kept intact; what was actually done is at the
end of the section under **Resolution**.


**Symptom:** with Bug 1 fixed, cell text now updates correctly on a tick
(verified in footage: `Ahmed Hassan` → `Ahmed Hassan (Live)`), but **no amber
changed-cell background and no green added-row band ever appear** for a result of
≤50 rows. That is nearly every realistic query, and every small demo.

**Cause — verified in code, both grid paths:**

`apps/desktop/src/renderer/src/components/editable-data-table.tsx`
- `:76` — `const VIRTUALIZATION_THRESHOLD = 50`
- `:1077` — `const shouldVirtualize = rows.length > VIRTUALIZATION_THRESHOLD`
- `:1363-1369` — `<EditableWatchOverlay … enabled={shouldVirtualize && columnWidths.length > 0} />`
- `:1442,1458` — returns `null` unless `enabled`

`apps/desktop/src/renderer/src/components/data-table.tsx`
- `:54,548` — same threshold and `shouldVirtualize`
- `:770` — `{diffOverlay && shouldVirtualize && columnWidths.length > 0 && (`
- `diffOverlay` is a prop. The only caller that passes it is
  `time-machine/time-machine-view.tsx:131`.
  `query-editor/query-results.tsx` renders both grids for query results
  (`EditableDataTable` at `:298`, `DataTable` at `:331`) and **never passes it**.

**Why it is not a one-line fix:** `cell-grid/watch-decoration-overlay.tsx`
positions absolutely-placed rectangles from `virtualizer` and `geometry` (column
widths, row offsets), which only exist on the virtualized path. The overlay is
architecturally dependent on the virtualizer, so ungating it is not sufficient.

**Relevant precedent already in the codebase:** `data-table.tsx:713`
(`isAddedRow` from `diffOverlay?.addedRowKeys`) and `:730`
(`diffOverlay?.cells.get(...)`) style rows and cells **inline**, inside the
ordinary non-virtualized row map, with no virtualizer. That is how Time Machine
renders its diff. Extending that mechanism to Watch Mode — and adding an
equivalent to `EditableDataTable` — looks more promising than making geometry
available for small results.

**Also worth deciding:** there are two half-wired mechanisms for the same visual
feature — a `diffOverlay` prop and a self-subscribing overlay. That split is how
this bug survived. Pick one.

**Resolution.** New pure module `src/renderer/src/lib/watch-inline-diff.ts` owns
the non-virtualized painter (row keying, added-row and changed-cell predicates,
the two `--cell-diff-*` style constants). Both grids now subscribe to the watch
diff, but only when `!shouldVirtualize` — above the threshold the geometry
overlay already works and a grid-level subscription would re-render every row
per tick, which is what splitting `WatchOverlay` out of the grid was for. Below
it the grid re-renders on a tick anyway (`applyWatchResult` replaces
`tab.result`), so the subscription costs nothing extra. `editable-data-table.tsx`
gained the inline path it never had; `data-table.tsx`'s existing one now takes
`diffOverlay ?? inlineWatchDiff`.

The two mechanisms were kept but given non-overlapping jobs, documented at both
call sites: geometry overlay above the threshold, inline below, never both.
`diffOverlay` is now *only* Time Machine's pinned diff — Watch Mode never uses
the prop.

Same change closed a latent mis-decoration that the wider inline path would have
made common: a watched tab viewing a Time Machine snapshot painted the live watch
diff over historical rows. `diffOverlay` is read as a tri-state (`undefined` =
live grid, `null` = pinned view with nothing to compare, a diff = pinned compare)
and both painters are suppressed on a pinned view.

Inline highlights have no fade — the overlay's `intensity` ramp against `fadeMs`
has no inline equivalent, so a highlight persists until a later tick's
`computeDiff` prunes it past `fadeMs`. Kept deliberately: at the default 5s
cadence a change stays legible for the whole interval instead of dimming out
mid-cadence, and the green added-row band already lasts exactly one tick.

22 unit tests in `lib/__tests__/watch-inline-diff.test.ts` cover the decision
logic; the wiring itself is covered only by `watch-mode.capture.ts`, which now
passes unmodified. Suite 1159 passed / 56 skipped.

## Deferred / related

- **Alerts fire over a held grid.** During a decline, `runAlerts` still evaluates
  polled snapshots, so an alert can announce "5 rows added" over a grid showing
  none of them. Surfaced by the Held pill but not fixed — needs a product call on
  whether alerts describe the data or the display.
- **No component tests possible.** `apps/desktop/vitest.config.ts:7` sets
  `environment: 'node'` and `include` only matches `*.test.ts`, so grid rendering
  behaviour cannot be unit-tested as things stand. Bug 2's fix worked around this
  by extracting the decision logic into a pure module and unit-testing that; the
  JSX wiring is still only covered by capture/e2e specs.
- **First tick has no diff baseline** — by design, unchanged.
- Minor items from the Bug 1 review, all deferred: dead multi-statement branch
  (`tab-store.ts:831`), `fields: result.columns` mirror dropping `dataTypeID`
  (`:852`), no execution guard on `applyWatchResult`'s unconditional `error: null`
  (`:844`), `carryDiff` vs `computeDiff` fade-pruning disagreement
  (`watch-scheduler.ts:70-81`), untested table-preview + watch combination.

## State of the clip — shipped

`apps/desktop/tests/capture/watch-mode.capture.ts` asserts two things: that the
`(Live)` value becomes visible (Bug 1) and that the amber changed-cell decoration
(`[style*="--cell-diff-fill"]`) becomes visible (Bug 2). Both pass, with the spec
byte-identical to how it looked while deliberately failing — which is the evidence the
fix is real rather than the test having been softened. Its header has been rewritten;
it no longer claims to be expected-to-fail.

The clip **ships**: `watch-mode` is in `tools/feature-clips/clips.manifest.json`
(in 17.0, out 28.5, posterAt 23.0 — 11.5s, 157KB mp4 / 168KB webm) and in
`apps/web/src/components/marketing/feature-clips.ts` under `performance`, with a
`#feature-watch-mode` cross-link from the features index. Frame inspection confirms
the amber highlight lands on `Ahmed Hassan (Live)` while the two neighbouring name
cells stay unhighlighted, so the clip demonstrates selective cell-level diffing rather
than a whole-row flash.

## The three public claims are now true

These were false for results of ≤50 rows and are no longer:

- `apps/web/src/components/marketing/features.tsx` — Watch Mode feature copy
- `notes/watch-mode.mdx` — the published blog post
- `apps/docs/content/docs/features/watch-mode.mdx` — docs page, four places

No copy edits were needed. Fixing the bug made the claims accurate, which was the
point of choosing the fix over a walk-back.

## Decision: Bug 2 is a follow-up branch

Agreed 2026-07-30. `feat/feature-clips` merges with Bug 2 open. Fix it separately so
it gets review on its own merits rather than riding a marketing diff.

The follow-up has a ready-made acceptance test: `watch-mode.capture.ts` already
asserts the amber decoration and **fails today for exactly this reason**. When it
passes, re-run the capture and add `watch-mode` to `clips.manifest.json` and
`feature-clips.ts` — no new capture code needed.

**Three** public surfaces were false for results of ≤50 rows until `3be3cb9`. They
are now true again, so nothing here needs retracting — but each was written against
a claim the bug falsified, so re-read them before the next release. This list is the
authoritative one, so keep it complete:

- `apps/web/src/components/marketing/features.tsx` — the Watch Mode feature copy
- `notes/watch-mode.mdx` — a published blog post promising "changed cells flash
  amber, new rows enter green"
- `apps/docs/content/docs/features/watch-mode.mdx` — the docs site page, in four
  places: the frontmatter `description` (line 3), the intro paragraph (line 8), and
  the "Added rows" / "Changed cells" bullets (lines 50-51). No draft gate, so it is
  live.

## Note on branching

Bug 1's fix is currently committed on `feat/feature-clips` alongside the
marketing-clip work. If you want it reviewed and merged independently of the
clips, cherry-pick `f2ccecd`, `efa23e7`, `4b10884` onto their own branch.
