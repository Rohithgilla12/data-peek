---
workflow: motion-graphics
flow: automation
storyboard: no
message: "Select a block of result cells, read the sum, copy it as a Markdown table"
destination: datapeek.dev blog post notes/copy-sql-results-as-markdown-csv-json.mdx (hero animation + two stills)
aspect: 16:10
length: 9s
language: en
---

# copy-selection-as

A 9 s seamless loop (1920 × 1200, 30 fps, no audio). Follow `../KIT.md` and `../design.md` exactly.
It illustrates the blog post `/home/ubuntu/data-peek/notes/copy-sql-results-as-markdown-csv-json.mdx`;
read it.

## What the viewer sees

A cropped data-peek results grid (dark, dense, mono data) for a query over an `orders` table:
columns `id`, `customer`, `status`, `items`, `amount`. About 8 visible rows of plausible sample
data. `items` and `amount` are integers (so the selection stats treat them as numbers). A stats
footer strip sits under the grid but is empty at frame 0.

1. **Select (0 to 2.4 s).** A pointer clicks the `customer` cell in row 2; a focus ring appears.
   Shift+click on the `amount` cell in row 5 extends the selection to a 4-row × 4-column rectangle
   (`customer` to `amount`, rows 2 to 5). The selection overlay fills in (accent at low opacity,
   2 px accent border). A small `⇧ click` keyboard chip may flash once.
2. **Stats land (2.4 to 3.6 s).** The footer fades in with the real labels and separators:
   `Selected: 16 cells · Sum: … · Avg: … · Min: … · Max: … · Distinct: …`. Compute the numbers
   from your sample data so they are correct: only the 8 integer cells (`items` and `amount` in
   rows 2 to 5) are numeric; Distinct counts all 16 cells by type+value. Numbers use tabular figures.
   This is the dominant beat for still 1.
3. **Copy as Markdown (3.6 to 5.6 s).** Right-click inside the selection. The real context menu
   opens; hover `Copy Selection As`; its submenu shows exactly `TSV`, `TSV with headers`, `CSV`,
   `JSON`, `Markdown` in that order. The pointer clicks `Markdown`. The menu closes and the copy
   flash pill appears near the cell reading `copied 16 cells (Markdown)`.
4. **What landed on the clipboard (5.6 to 8.2 s).** The grid slides left/dims and a raised panel
   shows the clipboard text in Geist Mono: header row `| customer | status | items | amount |`,
   separator `| --- | --- | --- | --- |`, then the four data rows exactly as the selected cells
   read. Beside it, the same table rendered as a plain table in a generic comment box (no product
   names, no logos). This is still 2.
5. **Reset (8.2 to 9 s).** Panels clear and the frame returns exactly to frame 0 (no selection,
   empty footer, pointer at its start position).

## Stills (save to `stills/`)

- `stills/selection-stats-footer.png`: mid beat 2, selection visible, footer fully shown.
- `stills/markdown-paste.png`: mid beat 4, raw Markdown and rendered table both fully visible.

## Truth sources (copy is verbatim; read before writing any UI)

- Footer labels, separators, which stats show when: `apps/desktop/src/renderer/src/components/cell-grid/cell-selection-stats.tsx` (lines ~70 to 165) and `selection-stats.ts`.
- Menu labels and order: `apps/desktop/src/renderer/src/lib/selection-serialize.ts` (`SELECTION_COPY_CHOICES`) and `apps/desktop/src/renderer/src/components/row-context-menu.tsx` (the other items in the menu, and the `Copy Selection As` sub-trigger; show the sibling items with their real labels).
- Markdown output shape and escaping: `serializeSelection` markdown case in `selection-serialize.ts`.
- Copy flash text: `apps/desktop/src/renderer/src/components/cell-grid/copy-flash.tsx`.
- Selection overlay look: `apps/desktop/src/renderer/src/components/cell-grid/cell-selection-overlay.tsx`.
- Grid look (row height 37 px in the app, header, mono cells): `apps/desktop/src/renderer/src/components/data-table.tsx`. Scale up for video legibility (KIT.md: data text >= 26 px).

## Honesty notes

- Sample data is illustrative; keep it plausible and make every stat arithmetically correct.
- Do not show a keyboard shortcut for "Copy Selection As"; there isn't one.
- The rendered-table box must not look like any specific product (no GitHub, Slack, etc.).
