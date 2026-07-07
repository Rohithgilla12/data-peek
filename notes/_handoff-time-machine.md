# Handoff — Time Machine shipped (uncommitted)

You said "let's build something crazy this session" and went AFK. This is the
crazy thing: **Time Machine** — every successful SELECT in a query tab is
snapshotted locally; a timeline strip lets you scrub back through past runs,
view any old result read-only, and diff any two runs at cell level.

Design doc: `docs/PLAN-time-machine.md`. Blog draft: `notes/time-machine.mdx`
(`published: false`).

## How to try it

1. `pnpm dev` (you usually have one running — restart it to pick up the main-process changes)
2. Run any SELECT in a query tab a few times (change some data in between)
3. Press `⌘⇧H` (or the Time Machine button in the toolbar, or ⌘K → "Toggle Time Machine")
4. Click a chip to view that run read-only; click **Live** to come back
5. With a run selected, **⌥-click another chip** to diff them — changed cells
   highlight amber, added rows band green, banner shows +added/−removed/changed counts
6. Settings → Time Machine: disable capture, see disk usage, wipe everything

## What's in the diff

- `packages/shared/src/index.ts` — TM types + caps (2000 rows/snapshot, 6 MB payload, 50 runs/query, 512 MB global)
- `apps/desktop/src/main/time-machine-storage.ts` — better-sqlite3 `time-machine.db` (WAL, incremental vacuum, oldest-first eviction), + `ipc/time-machine-handlers.ts` (7 channels, null-degrade like notebooks)
- `apps/desktop/src/renderer/src/lib/time-machine-{payload,capture}.ts` — value normalization (Date→ISO, bigint→string, binary→hex preview, NaN→'NaN'), masked-column redaction _before_ IPC, columnar payloads, capture gating (single-statement pure SELECT, query tabs only — watch ticks/notebooks/AI runs excluded by construction)
- `stores/time-machine-store.ts` — per-tab state, stale-response guards, diff via the existing `computeDiff`/`pickKeyingPlan`
- `components/time-machine/` — button, strip (sparkline + chips), view (banner + read-only grid + pinned diff overlay); `data-table.tsx` gained a `diffOverlay` prop incl. inline tints for small non-virtualized results
- `lib/result-key-columns.ts` — PK resolution extracted from the watch runner so capture and watch key rows identically
- Menu accelerator ⌘⇧H, palette entry, settings section, shortcut docs, README

## Verification

- 968 tests pass (81 new) + 20 sqlite storage tests under the Electron ABI
  (`ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs run <file>` — plain-node runs skip them)
- `pnpm typecheck` (node + web) clean, `pnpm build` clean, feature files lint-clean
- Adversarial review workflow ran (6 dimensions × 3 refuters per finding); it got
  cut off by the session token limit partway through verification, so I triaged
  all 31 raw findings by hand. Fixed: phantom `payload_bytes` for over-cap runs
  (was evicting real snapshots for bytes not on disk), just-inserted run
  protected from its own cap pass (clock-skew crash), running a query now always
  returns the panel to Live (fresh results were hidden behind a viewed snapshot),
  strip/view gated on the settings toggle, storage WAL-checkpointed + closed on
  quit, NaN/Infinity survive as strings, tab-close cleanup armed on strip open.

## Known limitations (deliberate, not bugs)

- Masking is capture-time: rules added _after_ a run don't retro-redact old
  snapshots (wipe + re-run if that matters). Default auto-mask rules
  (email/password/token/ssn) are on out of the box.
- Running a _selection_ captures under the selection's fingerprint, so the
  strip (keyed to the full editor text) won't list those runs later.
- `'[MASKED]'` placeholder is indistinguishable from a genuine string of the
  same value in diffs. Fingerprint includes comments, so editing a comment
  forks the timeline. Content-hash "no change" dimming only covers stored
  (capped) rows.
- Position-keyed diffs + client-side sorting can misplace highlights (same
  trade Watch Mode made).
- Cut from MVP: per-row history dialog ("this row across the last 10 runs") —
  the differ already stores `previousValue` per cell, so this is the natural
  next move. Also cut: capturing watch ticks, table-preview tabs.

## Not done (your call)

- **Nothing committed/pushed/version-bumped.** `git status` has it all; the
  repo also has ~90 files of pre-existing prettier drift at HEAD (lint already
  failed before tonight) — I kept them untouched so this diff stays pure.
- Marketing site not updated; blog draft is `published: false`.
- Default is capture **ON**. Query history already persists SQL text by
  default and snapshots redact masked columns, but flip
  `timeMachineEnabled: false` in `settings-store.ts` if you'd rather ship
  opt-in.

— Claude
