---
workflow: motion-graphics
flow: automation
storyboard: no
message: "Pin a SELECT and watch your data move"
destination: README + datapeek.dev
aspect: 16:10
length: 6s
language: en
---

## Intent

A cropped data-peek query view that is already being watched. The tab carries the pulsing amber watch dot, the toolbar pill reads `Watching · 1s`, and the result grid re-runs on a 2 s cadence. Each tick, the cells that changed flash amber and fade. Once, a new row enters at the top with a green band and the rows below slide down. The piece closes by returning exactly to its opening state, so it loops without a seam.

## Envelope

- 1920 × 1200, 30 fps, 6.0 s, seamless loop (frame 0 = t 5.967: the same seven rows, no highlights, `Watching · 1s`).
- No audio. Palette and type from `../design.md`, plus the Watch Mode `--amber: #f5b14c` token allowed by `../KIT.md`.

## Why a `workers` table, not `orders`

A seamless loop needs the grid to return to frame 0 exactly. Order data only moves forward (ids grow, `pending → paid` never reverts), so a truthful orders loop cannot come back to its first frame. A worker pool does cycle naturally: a worker goes `idle → busy` and back, `in_flight` and `lag_ms` rise and fall, and an autoscaled worker joins and then leaves. Every tick is a believable re-run of one unchanged `SELECT`. The docs suggest this kind of target too ("a job table … is the queue draining?").

## Story (2 s cadence, ticks at 0.5, 2.5 and 4.5 s)

1. 0.5 s, tick 1: worker 6 picks up work. `status idle → busy`, `in_flight 0 → 2`, `lag_ms 12 → 18`, and worker 2 `lag_ms 52 → 47`. Four amber flashes, fading over about 1.2 s.
2. 2.5 s, tick 2 (the pattern interrupt): worker 8 `ingest-08` joins. The new row enters at the top with a green band, rows slide down one slot, and worker 1 scrolls out of the cropped viewport. The header reads `8 rows returned`.
3. 4.5 s, tick 3: worker 8 leaves and the rows slide back up. Worker 6 finishes (`busy → idle`, `2 → 0`, `18 → 12`) and worker 2 `47 → 52`. These flash amber, then fade by 5.7 s. The grid now equals frame 0.

Ambient: the amber ping on the tab dot and the Watch pill runs as a 1.5 s sine breath, four full cycles. The ring is invisible at both ends of each cycle, so the loop seam does not show it.

## Truth notes (repo `apps/desktop/src/renderer/src`)

- Watch pill label `Watching · {ceil(countdown)}s`, amber text on an amber/10 fill, with a ping dot (`components/watch-button.tsx`). Cadence `2s` is a real preset (`lib/watch-types.ts` `CADENCE_PRESETS_MS`).
- Tab watching indicator: amber dot with an `animate-ping` ring next to the tab icon. A named query tab shows `@name` in the primary colour (`components/tab.tsx`).
- Changed cell: amber fill plus a 2 px left amber stripe, opacity fading with age (`components/cell-grid/watch-decoration-overlay.tsx`, `--cell-diff-fill` / `--cell-diff-stripe` in `assets/global.css`).
- Added row: full-width green band plus a left green stripe. Added rows never also get the amber fill (`lib/watch-inline-diff.ts` `isInlineChangedCell`).
- Removed rows have no in-grid decoration (they only appear in the popover metrics), so worker 8 just leaves.
- Rows are keyed by the heuristic `id` column, so diffs follow rows when they shift (docs `features/watch-mode.mdx` § Row Keying).
- Toolbar Run button `Run` + `⌘↵` (`components/query-editor/editor-toolbar.tsx`). Results bar: green dot, `{n} rows returned`, `{ms}ms` (`components/query-editor/query-results.tsx`). Header cells show the name plus a mono type badge (`components/data-table.tsx`).

## Simplifications (stated, not hidden)

- The real default `fadeMs` is 8000 ms; the docs say highlights "fade over a few seconds". Here the fade is compressed to about 1.2 s to fit a 6 s loop.
- In the app, rows re-render in place. The slide down and slide up are motion styling, added so the viewer can follow the change.
- The sparkline lives in the Watch popover. It is left out so the grid stays the hero.
