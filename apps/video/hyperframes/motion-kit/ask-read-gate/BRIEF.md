---
workflow: motion-graphics
flow: automation
storyboard: no
message: "AI-written reads run on their own because the database itself refuses writes; real writes wait for Run it"
destination: datapeek.dev blog post notes/ask-your-database-with-claude-code-codex-antigravity.mdx (gate animation + two stills)
aspect: 16:10
length: 14s
language: en
---

# ask-read-gate

A 14 s seamless loop (1920 × 1200, 30 fps, no audio). Follow `../KIT.md` and `../design.md` exactly.
It illustrates `/home/ubuntu/data-peek/notes/ask-your-database-with-claude-code-codex-antigravity.mdx`
(section "The two-layer read gate"); read it. The sibling piece `../ask-ai/` already shows picking
the AI and asking; reuse its Ask block styling so the two pieces look like one product, but this
piece is about the gate, not the menu.

## What the viewer sees

Left ~55%: a cropped Ask tab on a `prod-replica` Postgres connection showing one Ask block at a
time (question, short answer, SQL, then result/state). Right ~45%: a vertical "gate" diagram of two
stacked layers, labelled in Geist Mono: `1  read-guard` (subtitle: `one statement · starts with a read keyword · no write keywords`)
and `2  database engine` (subtitle: `BEGIN READ ONLY … ROLLBACK`). A small SQL token travels from the
block through the layers.

1. **A normal read (0 to 3.2 s).** Question `how many orders shipped today?`; SQL
   `SELECT count(*) FROM orders WHERE shipped_at::date = current_date;`. The token passes layer 1
   (success tick) and layer 2 (success tick, the engine panel shows `BEGIN READ ONLY`, the
   statement, `ROLLBACK`). The block shows a single metric result (e.g. `412`). No click happens.
2. **A read that writes (3.2 to 7.0 s).** Question `log that I checked the audit table`; SQL
   `SELECT record_audit_event('checked');`. Layer 1 passes (tick: it really does start with SELECT;
   this is the point). Layer 2 stops it: the engine panel prints the real Postgres error
   `ERROR:  cannot execute INSERT in a read-only transaction`, then `ROLLBACK`. The Ask block shows
   the app's real error state (warning icon, mono destructive text, the `Fix with AI` button).
   This is the dominant beat.
3. **Every engine has a backstop (7.0 to 9.8 s).** The diagram's layer 2 expands into a compact
   five-row card, one row per engine, mono:
   `PostgreSQL   BEGIN READ ONLY · always rolled back`
   `MySQL        START TRANSACTION READ ONLY · always rolled back`
   `SQL Server   transaction always rolled back`
   `SQLite       sqlite3_stmt_readonly · refused before it runs`
   `ClickHouse   readonly = 1`
   This is still 1. Then it collapses back.
4. **A real write waits (9.8 to 13.2 s).** Question `mark order 4182 as refunded`; SQL
   `UPDATE orders SET status = 'refunded' WHERE id = 4182;`. The token stops before the layers; the
   block shows the hold banner `This statement can change data. Nothing has run yet.` and the real
   `▶ Run it` button with a soft accent ring. Nothing runs. This is still 2.
5. **Reset (13.2 to 14 s).** Back to exactly frame 0.

## Stills (save to `stills/`)

- `stills/read-only-enforcement-table.png`: mid beat 3, the five-engine card fully visible.
- `stills/ask-write-approval-gate.png`: mid beat 4, banner and `Run it` fully visible.

## Truth sources (copy is verbatim; read before writing any UI)

- Ask block states, hold banner (`{reason} Nothing has run yet.`), `Run it`, error state and `Fix with AI`: `apps/desktop/src/renderer/src/components/ask/ask-block.tsx` (lines ~290 to 430).
- Hold reasons: `apps/desktop/src/renderer/src/lib/ask-session.ts` lines ~118 to 131 (`This statement can change data.`).
- Composer status line `AI-written SQL that only reads runs on its own. Writes wait for you.`: `apps/desktop/src/renderer/src/components/ask/ask-composer.tsx` line ~279 (show it under the composer).
- Layer 1: `apps/desktop/src/main/mcp/read-guard.ts`. Layer 2 per engine: `queryReadOnly` in `apps/desktop/src/main/adapters/{postgres,mysql,mssql,sqlite,clickhouse}-adapter.ts`, summarised in `apps/docs/content/docs/features/ask.mdx` line 39.
- Visual language for the Ask block: `../ask-ai/index.html`.

## Honesty notes

- The engine error string is the real PostgreSQL message; keep it exact, including the two spaces after `ERROR:`.
- The write must never appear to run. The read-that-writes must never appear to succeed.
- No vendor names or logos anywhere in this piece.
