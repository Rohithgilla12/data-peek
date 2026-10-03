---
workflow: motion-graphics
flow: automation
storyboard: no
message: "Every query remembers its past results"
destination: README + datapeek.dev
aspect: 16:10
length: 6s
language: en
---

# time-machine: brief

A 6 s seamless loop (1920 x 1200, 30 fps, no audio) for the data-peek motion kit. It shows a
cropped result view of `SELECT plan, count(*) AS users FROM accounts GROUP BY plan;` with the
Time Machine strip open above the grid.

## Story (one dominant motif per beat)

1. **0.0-0.7 s Live.** Live is selected in the strip. The grid shows the current result (6 rows).
2. **0.7-2.4 s Scrub back.** The cursor clicks the `10:02:15` run. The selection pill glides back
   through the newer runs, the sparkline playhead slides in, and the `users` digits roll through
   each run they pass. The `business` row drops out, because that run had 5 rows. The real banner
   slides in, pushing the grid down: `Viewing run from Oct 2 10:02:15` /
   `5 rows · 41ms · read-only` / `Back to live`.
3. **2.4-4.3 s Diff.** `⌥`-click on `12:47:09`. The newer run becomes the selected run and the
   older one gets the compare ring. The banner switches to the real diff banner:
   `Oct 2 10:02:15 → Oct 2 12:47:09`, `+1 added`, `−0 removed`, `3 cells changed`,
   `keyed by position`. The three changed `users` cells get the amber diff fill and stripe, and the
   added row gets the green band.
4. **4.3-6.0 s Back to live.** Clicking `Back to live` sends the pill back to Live. The banner
   leaves, the decorations clear, and the values roll forward to the live result. The cursor
   parks, and the last frame matches frame 0.

## Truth sources

- `apps/desktop/src/renderer/src/components/time-machine/time-machine-view.tsx`: banner copy,
  diff badges, `keyed by`, and `Back to live`.
- `.../time-machine-strip.tsx`: chip format (`HH:MM:SS` + row count), `Live` chip, unchanged
  runs at 50% opacity, selected = primary fill, compare = primary/20 + ring.
- `apps/desktop/src/renderer/src/components/watch-sparkline.tsx`: amber row-count polyline,
  `min · max` and `N rows` labels.
- `apps/desktop/src/renderer/src/assets/global.css` and `components/cell-grid/watch-decoration-overlay.tsx`:
  amber changed-cell fill with an inset left stripe, and a green added-row band.
- `stores/time-machine-store.ts`: after a compare, the newer run is selected and the older run is
  the compare side.
- `apps/docs/content/docs/features/time-machine.mdx`: `Cmd+Shift+H` (shown as `⌘⇧H`), and the
  fact that removed rows are counted in the banner.

## Stylisations (not product features)

- The pill glides through intermediate runs, and the digits roll on the way. In the app the click
  switches runs instantly.
- The sparkline playhead marks the selected run. The real sparkline has no marker.
- The banner badges count up.
