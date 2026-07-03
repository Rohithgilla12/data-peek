# data-peek v0.25.0 — Time Machine

Every query gets a memory. You run the same SELECT all day — checking a
migration, watching a job table, verifying a fix — and until now every run
overwrote the last. v0.25.0 keeps the history: scrub back through past runs,
view any old result read-only, and diff any two runs cell by cell.

## ✨ New

- **Time Machine.** Every successful `SELECT` in a query tab is snapshotted
  locally — automatically, no setup. Press `⌘⇧H` and a timeline strip appears
  above the grid: one chip per run with a row-count sparkline. Click a chip to
  see that result exactly as it was, banner and all; click **Live** to come
  back.
- **Diff any two runs.** Select a run, ⌥-click another, and data-peek diffs
  them with the same cell-level engine that powers Watch Mode: changed cells
  highlight amber with the old value preserved, added rows band green, and the
  banner counts what moved (`+6 added · −2 removed · 14 cells changed`). Rows
  are keyed by primary key when possible, and the banner says which strategy
  was used.
- **Privacy-aware by construction.** Masked columns (email, password, token,
  ssn by default) are stored as `[MASKED]` — redacted before rows ever leave
  the renderer. Storage is capped: 2,000 rows per snapshot, 50 runs per query,
  512 MB global budget with oldest-first eviction and self-vacuuming. Settings
  → Time Machine shows exactly what's on disk, with a global toggle and a
  one-click wipe.

Watch Mode shows you *now*; Time Machine shows you *then*. Run a query before
a migration, run it after, diff the two — a before/after audit that used to
need a scratch file and discipline.

## 🧱 Under the hood

- Snapshots live in a dedicated SQLite database (WAL, incremental vacuum,
  checkpointed on quit), columnar-encoded, grouped by a normalized SQL
  fingerprint so `WHERE id = 1` and `WHERE id = 2` share a timeline.
- Values are normalized once at capture (timestamps → ISO, binary → hex
  preview) so a diff between two snapshots never lies about a timestamp cell.
- Only deliberate runs are captured: watch ticks, notebook cells, AI-assistant
  runs and table-preview page flips never pollute the timeline.

---

**Personal use is free.** Commercial use needs a license. No telemetry, no
account — your data stays on your machine.

Full changelog: https://github.com/Rohithgilla12/data-peek/compare/v0.24.0...v0.25.0
