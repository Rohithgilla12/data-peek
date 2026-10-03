---
workflow: motion-graphics
flow: automation
storyboard: no
message: "Ask, run, answer, in one breath: data-peek is the fast SQL client"
destination: README hero + datapeek.dev hero
aspect: 16:10
length: 10s
language: en
---

## Intent

The user chose concept "A inside B": the 'one breath' query run inside a 'schema constellation' pull-back.

A single data-peek window types a real query, `⌘↵` runs it, eight rows land with a `38ms` timer. Then the camera dollies back through real 3D depth: the window becomes one glowing node in a constellation of the schema's tables, FK edges draw themselves and light pulses travel along them. The constellation collapses into the logo lockup, which dissolves back into the empty editor so the loop is seamless.

## Envelope

- 1920 × 1200, 30 fps, 10.0 s, seamless loop (frame 0 = last frame: empty editor, blue block cursor on).
- No audio. Palette and type from `../design.md`; rules from `../KIT.md`.

## Truth notes (from `apps/desktop/src/renderer/src/components`)

- Toolbar Run button shows `Run` + a `⌘↵` kbd (`query-editor/editor-toolbar.tsx`).
- Result header cells show the column name with a mono data-type badge (`data-table.tsx`).
- Results footer: green dot + `{rowCount} rows` + `{durationMs}ms` (`query-editor/query-results.tsx`); empty state is `No results`.
- ERD table nodes show the table name over `public · N relations` (`erd-visualization.tsx`); constellation cards borrow that two-line structure.
