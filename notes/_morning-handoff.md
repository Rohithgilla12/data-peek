# Morning handoff — Watch Mode shipped (+ release video)

You went to bed at 2026-05-22 ~midnight asking for "cool stuff." Here's
what's done. The 20-second release video at
`apps/video/out/release-v0.23.0-watch-mode.mp4` was sent over chat too.

## What landed

**Watch Mode** — the flagship feature from `docs/PLAN-watch-mode.md`,
shipped as an MVP. Press `⌘⇧W` on any `SELECT` and the query re-runs on
a cadence with live cell-level diff highlights in the result grid.

This is the feature the next release was supposed to be about (per the
last line of `notes/v0.22.0-hardened-edges.mdx`: _"The next one has
features in it."_). Now it does.

## How to try it

```bash
pnpm dev    # spins up Electron with hot reload
```

Then:

1. Open a query tab against any connection.
2. Paste a select that changes over time. The seed data has `users` —
   run `SELECT * FROM users ORDER BY created_at DESC LIMIT 50;` and the
   first tick lands immediately.
3. Press `⌘⇧W`. A "Watching · Ns" pill appears in the toolbar. The tab
   title gets a pulsing amber dot.
4. In another tab, run `UPDATE users SET email = 'x@y.test' WHERE id = 1;`
   (or any change). Watch the cell light amber for ~8s in the watched
   tab.
5. Click the watching pill → popover with cadence presets (500ms → 5min),
   pause-when-hidden toggle, totals (ticks run, row delta, cells
   changed), Pause / Run now / Stop.
6. Edit the SQL in the editor — watch invalidates and clears. Press
   `⌘⇧W` again to resume on the new SQL.

The Watch button is **disabled** with a tooltip explaining why on:
`INSERT/UPDATE/DELETE/DDL/transactions/multi-statement/empty` queries.
Try it: paste `DROP TABLE users` and hover the button — the tooltip
reads _"Watch Mode refuses to poll DROP — DDL is a one-shot
operation."_

## What's in the diff

| Diff kind    | What you see                                                                        |
| ------------ | ----------------------------------------------------------------------------------- |
| Cell changed | Amber tint on the cell, left-edge accent stripe, fades over `fadeMs` (default 8000) |
| Row added    | Full-width green band on the row, left-edge green stripe, fades                     |
| Row removed  | (MVP cut) — row just disappears                                                     |

The diff carries forward across ticks so a cell that changed N ticks ago
still glows until its `changedAt` exceeds `fadeMs`. This means a 5s
cadence with an 8s fade gives you ~1.6 ticks of visibility per change —
enough that "did I just see something flash?" is rarely a question.

## Architecture

```
apps/desktop/src/renderer/src/
├── lib/
│   ├── watch-types.ts                  shared types, defaults, cadence presets
│   ├── watch-sql-gate.ts               pre-execution refusal logic
│   ├── watch-row-keying.ts             PK / heuristic / row_position strategy
│   ├── watch-diff.ts                   synchronous differ + carry-forward
│   ├── watch-scheduler.ts              singleton timer owner
│   └── __tests__/watch-*.test.ts       49 tests
├── stores/
│   ├── watch-store.ts                  per-tab Zustand state
│   └── __tests__/watch-store.test.ts   10 tests
└── components/
    ├── watch-button.tsx                toolbar button + popover
    ├── tab.tsx                         (modified) tab-bar amber dot
    ├── data-table.tsx                  (modified) overlay wiring
    ├── editable-data-table.tsx         (modified) overlay wiring
    ├── tab-query-editor.tsx            (modified) runner + ⌘⇧W hotkey
    ├── query-editor/editor-toolbar.tsx (modified) watchSlot prop
    └── cell-grid/
        └── watch-decoration-overlay.tsx GPU-composited diff layer
```

## Test status

```
Test Files   29 passed (29)
Tests       619 passed (619)
```

59 new tests across gate / keying / diff / store. No existing tests
regressed.

Typecheck + electron-vite build both clean.

## What I did NOT do

- **Did not commit.** The repo policy in `CLAUDE.md` is implicit (and
  the global instructions say to ask first). Everything is staged for
  you to review. `git status` shows 9 modified + 15 new files.
- **Did not bump the version** (`apps/desktop/package.json` still says
  0.22.0). You'll want to bump to 0.23.0 since the cell-grid release
  notes file already uses that version, or 0.24.0 if you want to keep
  this as a separate release.
- **Did not write the marketing blurb in `notes/social-*.md`** — the
  blog post at `notes/watch-mode.mdx` is set to `published: false` so
  it won't go live until you flip the flag.
- **Did not push or open a PR** — same reason.

## MVP cuts vs. the full plan

The plan in `docs/PLAN-watch-mode.md` estimated ~1,940 LoC. The MVP is
~1,200 LoC. The cuts:

| Cut                                              | Why                                                        |
| ------------------------------------------------ | ---------------------------------------------------------- |
| Persistence across app restart                   | Snapshots are heavy; restart-fresh is cheap to live with   |
| Web Worker offload for >20k rows                 | Sync differ + cadence floor handles current scales         |
| Time-machine tooltip (last 3 values on hover)    | Adds a popover layer; not needed for the headline UX       |
| Per-query saved cadence                          | Picker resets to 5s each time; can add when there's demand |
| Removed-row "linger one tick with strikethrough" | Just drop them; cleaner                                    |
| Multi-cadence shortcuts (`⌘⇧,` / `⌘⇧.`)          | One shortcut for the toggle; cadence is in the popover     |

The plan's "Phase 6: Tab Header" was simplified to just the pulsing
amber dot. The full tab-title with `next in 3s · 247→253 rows` would be
nice but the popover surfaces all of it already.

## Release video

Built a Remotion composition `ReleaseVideo023` for the launch. ~20s,
intro → live-diff hero showing cells flashing and rows entering →
safety-gate side-by-side (pollable vs refused leading keywords) →
shortcut outro. Audio reuses the same `bg-music-notebooks.mp3` track
the other releases use.

```
apps/video/src/compositions/ReleaseVideo023/
├── index.tsx          composition (~600 frames @ 30fps = 20s)
├── Intro.tsx          eye icon + version pill + tagline
├── WatchHero.tsx      faux jobs table, deterministic event timeline
├── SafetyGate.tsx     two-column accept/refuse list
└── Outro.tsx          ⌘⇧W shortcut card + URL
```

Render with:

```bash
pnpm --filter @data-peek/video exec remotion render \
  ReleaseVideo-v0-23-0 out/release-v0.23.0-watch-mode.mp4
```

The current render is at `apps/video/out/release-v0.23.0-watch-mode.mp4`
(1.8MB).

## Possible follow-ups

If you want to keep iterating tomorrow, the natural next moves are:

1. **Bump version + flip `published: true` on the blog post.**
2. **Alerts.** "Notify me when this row count exceeds 100." Composes
   with Watch Mode via a separate `WatchAlert` type. Sticky-note
   feature.
3. **Cross-tab composition.** Plan exists at
   `docs/PLAN-cross-tab-query.md`. Independent of Watch Mode but the
   two compose: watch tab A's result, reference it as `@active_users`
   in tab B, and tab B re-renders when tab A's snapshot changes.
4. **Watch-and-graph.** Aggregate the watch's snapshot history into a
   sparkline so you can see "row count over time" without leaving the
   tab. The differ already keeps 6 snapshots; just need a renderer.

## One last thing

The Watch popover totals card shows `+6 row Δ` when rows are added —
the delta is computed from `snapshots[0].rowCount - snapshots[1].rowCount`,
which is `0` until the second tick lands. The first tick after starting
will show `0` because there's no previous snapshot to delta against.
That's expected, not a bug.

— Claude
