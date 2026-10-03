---
workflow: motion-graphics
flow: automation
storyboard: no
message: "One npx command finds your schema problems and hands you the fix"
destination: README + datapeek.dev
aspect: 16:10
length: 9s
language: en
---

# doctor-cli

A 9 s seamless loop (1920 × 1200, 30 fps) for the README and datapeek.dev. No audio.

A large terminal panel sits centred on the dark canvas over a slow, breathing blue radial glow. The prompt waits with a blinking blue block cursor. `npx @data-peek/cli doctor postgres://localhost:5432/app` types itself. After a short wait, the report prints in the real `formatReport` format, group by group and most severe first:

- `✖ 1 invalid index` (critical)
- `▲ 1 foreign key without a supporting index` (warning)
- `● 3 nullable foreign keys` (info)

Then come the `✔ clean` line, the summary line, and the "Fix with a click" footer.

**Dominant motif:** problem → the SQL that fixes it. When the warning group lands, the rest of the report dims and an accent band plus an underline sweep across `CREATE INDEX "idx_payments_invoice_id" …`.

**Pattern interrupt:** the summary counts up to `1 critical · 1 warning · 3 info · 5 findings`. A second command, the CI gate `npx @data-peek/cli doctor "$DATABASE_URL" --fail-on warning >/dev/null; echo "exit $?"`, prints `exit 1`. That matches `exitCodeFor`: a warning meets the `warning` threshold.

**Loop:** a `⌘K` chip presses, the screen clears, and the empty prompt with its cursor is back, identical to frame 0.

## Truth notes

- All output strings come from `packages/cli/src/format.ts` (CHECK_COPY, CHECK_LABEL, `entityLabel`, `formatReport`) and the SQL builders in `packages/shared/src/schema-intel/postgres.ts`.
- `tables_without_pk` is a *warning* in the source, so the critical group is an invalid index. That is the only critical check.
- The CLI prints no progress line. It writes the whole report in one go, so the wait shows only the idle cursor. Printing group by group is a motion stylisation of a single write.
- ANSI colours map to the kit palette: red → `--destructive`, yellow → `--amber`, blue and cyan (SQL) → `--accent`, green → `--success`, dim → `--muted`.
