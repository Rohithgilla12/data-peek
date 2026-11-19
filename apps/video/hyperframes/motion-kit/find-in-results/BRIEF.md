---
workflow: motion-graphics
flow: automation
storyboard: no
message: "Cmd+F inside the results grid finds a value on any page, not just the rows on screen"
destination: datapeek.dev blog post notes/find-in-sql-query-results.mdx (hero animation + two stills)
aspect: 16:10
length: 9s
language: en
---

# find-in-results

A 9 s seamless loop (1920 × 1200, 30 fps, no audio). Follow `../KIT.md` and `../design.md` exactly.
It illustrates `/home/ubuntu/data-peek/notes/find-in-sql-query-results.mdx`; read it.

## What the viewer sees

A cropped data-peek results area: the Smart Filter bar on top (empty, real placeholder text),
the results grid for a `users` query (`id`, `email`, `name`, `plan`, `created_at`, about 9
visible rows of plausible sample data), and the real pagination controls at the bottom showing
page 1 of a multi-page result (copy the real label format from source).

1. **Open (0 to 1.2 s).** Focus is in the grid (a cell has the focus ring). A `⌘F` keyboard chip
   flashes. The find bar appears in the grid's top-right corner: search icon, input with
   placeholder `Find...`, the `Aa` and `.*` toggle buttons, the counter, previous/next arrows,
   close. Match the real layout in `cell-find-bar.tsx`.
2. **Type (1.2 to 2.6 s).** `alice` types into the input (mono). Matching cells on the page get the
   match fill; the counter reads `7 matches` (plural rule from source).
3. **Step across pages (2.6 to 5.4 s).** Enter: counter `1 of 7`, the first match gets the
   distinct current-match fill and border. Enter again: `2 of 7`. Enter again: the next match is
   on page 3, so the page indicator changes to page 3, the rows swap (new plausible rows, one
   containing alice), and the matched cell takes the current-match fill and the focus ring:
   `3 of 7`. This page jump is the dominant beat.
4. **Regex (5.4 to 8.0 s).** The pointer clicks `.*`; it turns active. The needle is edited to
   `^alice@` and the counter updates to a smaller, consistent count (for example `2 of 3`, with
   highlights updated). This is still 1.
5. **Reset (8.0 to 9 s).** Escape: the find bar closes, highlights clear, page returns to 1, and the
   frame returns exactly to frame 0.

## Stills (save to `stills/`)

- `stills/find-bar-regex-toggle.png`: mid beat 4, `.*` active, `^alice@` in the input, counter and highlights visible.
- `stills/find-bar-with-filter.png`: mid beat 3 after the page jump, with the Smart Filter bar visible above the grid and the find bar open at the same time.

## Truth sources (copy is verbatim; read before writing any UI)

- Find bar layout, placeholder, toggle labels, counter text (`${n} of ${total}`, `N match`/`N matches`, `No matches`, `Invalid regex`): `apps/desktop/src/renderer/src/components/cell-grid/cell-find-bar.tsx` (lines ~210 to 357).
- Match fills: `apps/desktop/src/renderer/src/components/cell-grid/find-match-overlay.tsx` and the `--cell-match-*` variables in `apps/desktop/src/renderer/src/assets/global.css` (translate the oklch values to the video palette faithfully; no new colours beyond KIT.md).
- Paging behaviour: `apps/desktop/src/renderer/src/components/cell-grid/use-grid-find.ts` and `grid-find.ts` (`locateMatch`).
- Pagination labels: `apps/desktop/src/renderer/src/components/pagination-controls.tsx`.
- Smart Filter bar look and placeholder: `apps/desktop/src/renderer/src/components/smart-filter-bar.tsx`.
- Grid look: `apps/desktop/src/renderer/src/components/data-table.tsx`. Scale up for legibility (KIT.md: data text >= 26 px).

## Honesty notes

- Whole cells are highlighted, never substrings (that is how the app works).
- NULL cells never match; if you show a NULL in a matching column, it must not highlight.
- Counts must be consistent across beats (7 total for `alice`; the regex count must be ≤ 7).
