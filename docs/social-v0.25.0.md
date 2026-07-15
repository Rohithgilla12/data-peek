# v0.25.0 social drafts

Voice: Fast. Honest. Modern devtool. Speak to what data-peek IS. No competitor name-checks.

---

## Threads (primary — short, human)

data-peek 0.25.0 is out 🔵

Every query gets a memory now. It's called Time Machine:

• every SELECT you run is snapshotted locally, automatically
• ⌘⇧H opens a timeline — scrub back through past runs
• diff any two runs cell by cell (old value preserved, added rows counted)
• masked columns stay redacted on disk, storage capped, one-click wipe

Run a query before a migration. Run it after. Diff the two. That's the whole pitch.

Free for personal use. No account, no telemetry.

---

## Threads (follow-up post, next day)

The detail I'm proudest of in data-peek 0.25.0:

snapshot values are normalized once, at capture — timestamps to ISO, binary to hex. Sounds boring. It means a diff between two runs can never lie about a timestamp cell because of serialization drift.

The boring parts are the feature.

---

## X (thread)

1/
data-peek 0.25.0 — Time Machine 🕰️

You run the same query all day. Until now, every run overwrote the last and "what did this look like an hour ago?" had no answer.

Now it does.

🧵

2/
Every successful SELECT is snapshotted locally, automatically.

⌘⇧H opens a timeline strip above your results: one chip per run, row-count sparkline, click any chip to see that result exactly as it was. Click Live to come back.

3/
Diff any two runs.

Select one, ⌥-click another — changed cells highlight amber with the old value a hover away, added rows band green, and the banner counts what moved. Same cell-diff engine as Watch Mode, keyed by primary key when it can be.

4/
Watch Mode shows you *now*. Time Machine shows you *then*.

Run a query before kicking off a migration, run it after, diff the two. A before/after audit that used to need a scratch file and discipline.

5/
Persisting query results to disk goes wrong quietly, so the guardrails are the feature:

• masked columns (email, password, token, ssn) stored as [MASKED] — redacted before rows leave the renderer
• 50 runs per query, 512 MB budget, self-vacuuming
• Settings shows exactly what's on disk + one-click wipe

6/
data-peek is free for personal use. No account, no telemetry, your data stays on your machine.

Grab 0.25.0 → github.com/Rohithgilla12/data-peek/releases

---

## X (single post — if not threading)

data-peek 0.25.0 🔵 — Time Machine.

Every SELECT snapshotted locally · ⌘⇧H to scrub through past runs · diff any two runs cell-by-cell · masked columns stay redacted on disk · capped storage, one-click wipe.

"What did this look like an hour ago?" finally has an answer.

Free for personal use. No telemetry.

---

## Reddit (r/PostgreSQL / r/dataengineering — longer, technical)

**Title:** I added result-history to my SQL client — every SELECT gets snapshotted, scrubbed, and diffed

Body:

Most of my debugging is running the same query over and over and trying to remember what it said last time. So data-peek 0.25.0 adds Time Machine: every successful single-statement SELECT in a query tab is snapshotted to a local SQLite db, and a timeline strip lets you scrub back, view any run read-only, and diff any two runs at cell level.

Implementation bits people here might care about:

- Runs are grouped by a normalized SQL fingerprint (literals stripped), so `WHERE id = 1` and `WHERE id = 2` share a timeline
- Values normalized once at capture (timestamptz → ISO, bytea → hex preview) so persisted-vs-persisted diffs never flag every timestamp cell
- Diff keys rows by PK from the schema cache when the query is single-table, then an id-ish heuristic, then row position — and the UI tells you which one it used
- Column-masking rules (email/password/token/ssn out of the box) redact before rows leave the renderer process, so sensitive values never reach disk
- Caps everywhere: 2k rows/snapshot, 50 runs/query, 512 MB global with oldest-first eviction and incremental vacuum

Free for personal use, no telemetry. Feedback very welcome — especially on the retention defaults.

---

## Blog

`notes/time-machine.mdx` — flip `published: true` when the release binaries are live.
