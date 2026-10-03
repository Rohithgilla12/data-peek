---
workflow: motion-graphics
flow: automation
storyboard: no
message: "EXPLAIN ANALYZE as a tree, not a wall of text"
destination: README + datapeek.dev
aspect: 16:10
length: 6s
language: en
---

## Intent

A PostgreSQL `EXPLAIN ANALYZE` result grows into data-peek's plan tree node by node, top-down. Every card shows the node type badge, the relation, rows and time; elbow connectors draw from parent to child and per-node time bars fill. The red time chain leads down to the culprit: the `Seq Scan on orders` lights up, its bar fills, its glow pulses once, and the real viewer warning plus the generated index suggestion appear beside it. Then the tree collapses back into the `EXPLAIN ANALYZE` chip so the loop is seamless.

## Envelope

- 1920 x 1200, 30 fps, 6.0 s, seamless loop (frame 0 = last frame: chip + query line on an empty canvas).
- No audio. Palette and type from `../design.md`; rules from `../KIT.md`.
- Composition id `query-plan`, one paused GSAP timeline.

## Beats

| Time | Beat |
| --- | --- |
| 0.0-0.4 | Chip `EXPLAIN ANALYZE` + one-line query; empty canvas (loop point). |
| 0.4-3.2 | Tree grows: Limit, Sort, Hash Join, Seq Scan, Hash, Index Scan. Connectors draw (stroke-dashoffset), chevrons rotate open, cards enter `expo.out`, time bars fill. |
| 3.2-4.6 | Dominant motif: Seq Scan bar fills red, border + glow pulse once, other nodes dim, warning + index SQL slide in beside it. |
| 4.6-6.0 | Collapse bottom-up (`power2.in`): hint out, children fold into parents, connectors retract, chevrons close, root folds into the chip; hold empty. |

## The plan (realistic, internally consistent)

Query: `SELECT ... FROM orders o JOIN customers c ... ORDER BY o.created_at DESC LIMIT 50` (filters `o.status = 'pending'`, `c.region = 'EU'`).

| Row | Depth | Node | Rows | Actual total time | Bar (time / max) | Bar colour rule |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 0 | Limit | 50 | 1702.31 ms | 100% | red (> 1000 ms and > 50%) |
| 1 | 1 | Sort | 50 | 1702.27 ms | 100% | red |
| 2 | 2 | Hash Join (Inner) | 60,412 | 1689.54 ms | 99.2% | red |
| 3 | 3 | Seq Scan on orders as o | 241,318 | 1612.08 ms | 94.7% | red |
| 4 | 3 | Hash | 12,406 | 9.86 ms | 0.6% | green (< 10 ms) |
| 5 | 4 | Index Scan on customers as c using customers_region_idx | 12,406 | 7.41 ms | 0.4% | green |

Seq Scan: `Filter: (status = 'pending'::text)`, rows removed 1,758,682 (ratio 0.88, so only the seq-scan warning fires, not the filter-selectivity one).

## Truth notes (repo paths relative to `apps/desktop/src`)

- Tree, chevron, indent: `renderer/src/components/execution-plan-viewer.tsx` L204 (`ml-6 border-l` per depth), L211-217 (ChevronRight `rotate-90` when open).
- Badge colours by type: L94-108 (Seq Scan orange, Index green, Hash/Join blue, Sort purple, Limit gray). Mapped to kit tokens: Index -> `--success`, Hash/Join -> `--accent`, Sort/Limit -> `--muted`, Seq Scan -> `--destructive` (kit has no orange/purple token).
- Relation line `on <relation> as <alias>` L229-239; `using <index>` L242-247; Join Type outline badge L249-253.
- Metrics: `<rows> rows` (toLocaleString) L281-285, `<time.toFixed(2)> ms` L307-309.
- Time bar = `Actual Total Time / maxTime` L199, colour rule `getTimeBarColor` L120-145, max width L464.
- Warning icon beside badge L274; warning text `Sequential scan on large table - consider adding an index` L155 (rendered yellow in-app; mapped to `--destructive`).
- Index suggestion SQL: `main/lib/index-suggestion.ts` (`CREATE INDEX CONCURRENTLY idx_{table}_{cols} ON "schema"."table" ("col");` L35-88, L103), shown green mono in `renderer/src/components/perf-issue-card.tsx` L171-175.
- Simplified away: `(est: N)`, cost, startup time, buffers, sort key rows, summary header, legend.
