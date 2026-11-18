---
workflow: motion-graphics
flow: automation
storyboard: no
message: "Ask your database in plain English, on the AI plan you already pay for"
destination: datapeek.dev #ai section (and README if it earns it)
aspect: 16:10
length: 10s
language: en
---

# ask-ai

A 10 s seamless loop (1920 × 1200, 30 fps, no audio) for the `#ai` section of datapeek.dev. It
replaces a static drawing of the Choose AI menu. Follow `../KIT.md` and `../design.md` exactly.

## What the viewer sees

A cropped data-peek window on a `prod-replica` connection with an empty Ask tab: the composer at
the bottom, its placeholder reading `Ask about prod-replica, or type SQL`, and the `Choose AI ▾`
pill in the composer footer.

1. **Pick the AI (0 to 1.6 s).** A pointer clicks `Choose AI`. The real menu opens: a small
   `Use your subscription` label, then `Claude`, `Codex`, `Antigravity`, a separator, and
   `Other providers…`. The pointer picks `Claude`. The menu closes, the pill leaves the composer,
   and the titlebar shows the active pill: a green dot, `Claude`, then a muted `your subscription`.
2. **Ask (1.6 to 3.2 s).** A `⌘T` keyboard chip flashes once. A plain-English question types into
   the composer with the `ASK` mode chip: `top 5 customers by revenue this month`. Enter.
3. **It answers and runs on its own (3.2 to 6.2 s).** The block shows the question, a short
   `Thinking` state, a one-sentence answer, then the SQL (a `SUM ... GROUP BY ... ORDER BY ...
   LIMIT 5` over `orders` joined to `customers`). Because it only reads, it runs with no click:
   five rows land in the grid and a small horizontal bar chart draws beside or above them. This
   is the dominant beat.
4. **A write waits (6.2 to 9.2 s).** A second question types: `mark order 4182 as refunded`. The
   new block shows a three-line `UPDATE orders SET status = 'refunded' WHERE id = 4182;` and
   stops on the real `▶ Run it` button, which gets a soft accent ring. Nothing runs.
5. **Reset (9.2 to 10 s).** The blocks clear and the frame settles back to exactly frame 0,
   including the `Choose AI` pill in the composer and the empty titlebar slot.

## Dominant motif

Rows and the chart landing with no click in beat 3, contrasted with the held `Run it` in beat 4.

## Truth sources (copy is verbatim; read these before writing any UI)

- Pill and menu: `apps/desktop/src/renderer/src/components/ask/ask-composer.tsx` lines 48 to 126
  (`ProviderPill`: active state with `bg-success` dot, `label`, `your subscription`; multi-CLI
  dropdown with `Choose AI`, `Use your subscription`, CLI labels, `Other providers…`).
- CLI labels: `apps/desktop/src/renderer/src/hooks/use-ask-provider.ts` lines 7 to 11.
- Composer: same file, lines 195 to 250 (mode chip `Ask`/`SQL` with `auto`, placeholder
  `Ask about ${connectionName}, or type SQL`, round send button).
- Titlebar placement of the pill: `apps/desktop/src/renderer/src/router.tsx` (grep `ProviderPill`).
- Answer block, `Thinking`, chart/table toggle, and `Run it`:
  `apps/desktop/src/renderer/src/components/ask/ask-block.tsx` (lines ~191 to 250 for the
  visual, ~321 for `Thinking`, ~377 for `Run it`).
- Gate behaviour (reads run, writes wait): `apps/docs/content/docs/features/ask.mdx` lines 36 to 41.
- `⌘T` opens Ask: `apps/desktop/src/renderer/src/hooks/use-tab-shortcuts.ts`.

## Honesty notes

- `Claude` appears only as the plain text label the app renders. No vendor logos or brand
  colours; the menu icon is the app's own generic AI glyph.
- The menu with three CLIs is what a user with all three installed sees. Do not show sign-in or
  login UI; the app has none.
- The read runs with no click because the gate allows single read-only statements. The write
  must never appear to run.
- Numbers in the result are illustrative sample data; keep them plausible and consistent between
  grid and chart.
