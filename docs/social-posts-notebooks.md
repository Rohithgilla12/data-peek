# Social Posts — SQL Notebooks (v0.20.0)

Ready-to-post content for the SQL Notebooks launch.

---

## Twitter/X

### Post 1 — Launch Announcement

```
data-peek v0.20.0: SQL Notebooks.

Mix SQL cells and Markdown in a single document. Run queries inline. Pin results so they survive restarts.

The main use case: team runbooks. "Here's how to debug stuck payments" — with the actual queries that run against your actual database.

→ Export as .dpnb (reimportable) or Markdown (readable anywhere)
→ Duplicate a notebook to a different connection (dev → staging → prod)
→ Folders for organization
→ Jupyter shortcuts: Shift+Enter, Cmd+J/K

datapeek.dev
```

### Post 2 — "Here's what it looks like in practice"

```
Here's what a SQL notebook looks like in practice:

Markdown cell: "Run this when payments stop processing. Check for rows stuck in `processing` state for more than 5 minutes."

SQL cell:
SELECT id, amount, status, created_at
FROM payments
WHERE status = 'processing'
  AND created_at < NOW() - INTERVAL '5 minutes'

Pin the result. Next time you open the notebook, the last known baseline is there.

Export it as a .dpnb file. Your teammate imports it, picks their connection, and the whole runbook is ready to go.

That's what SQL Notebooks in data-peek does — datapeek.dev
```

### Post 3 — Developer Tip (Keyboard Shortcuts + Pinning)

```
Some things I learned while building SQL Notebooks for data-peek:

Shift+Enter is the right default. Run and advance — same as Jupyter. You don't think, you just run.

Cmd+J / Cmd+K to move between cells without reaching for the mouse. The notebook starts feeling like the terminal.

Pinned results are underrated. Run a query on prod, pin the output, and now every teammate who opens the notebook can see what "normal" looked like — before they run it again.

Cmd+Shift+Enter runs everything top to bottom. Stops on first error so you don't accidentally run an UPDATE if the diagnostic SELECT above failed.

datapeek.dev
```

---

## Reddit

### r/SQL or r/database — "I added Jupyter-style notebooks to my SQL client"

**Title:** `I added Jupyter-style notebooks to my SQL client (data-peek)`

```
I've been building data-peek — a SQL client for developers who find DBeaver too heavy and DataGrip too expensive for quick work. Today I'm shipping v0.20.0: SQL Notebooks.

**What they are**

Notebooks mix SQL cells and Markdown cells in a single document. SQL cells execute inline and show results directly below the query. Markdown cells render documentation, notes, and instructions. It's the same concept as Jupyter, but wired to your database rather than Python.

**Why I built this**

The thing I kept running into: I'd debug a tricky production issue, figure it out, and then write a Notion doc explaining what to do next time. The doc had SQL in code blocks that you had to copy somewhere else to run. That's friction. A notebook collapses the documentation and the execution into the same place.

**The features that I think matter**

- **Pinned results** — after running a query, pin the output. It persists across sessions. Useful for runbooks that show "here's what the data looks like when this is broken."
- **Duplicate to connection** — right-click a notebook, duplicate it to a different connection. Run the same runbook against dev and staging without maintaining two copies.
- **Export as .dpnb or Markdown** — .dpnb is a JSON format you can reimport; Markdown is a .md file you can read without data-peek.
- **Folders** — organize notebooks into groups. Folders are implicit; no separate management UI.

**Keyboard shortcuts** (follow Jupyter conventions)

- `Shift+Enter` — run cell, advance focus
- `Cmd+Enter` — run cell, stay in place
- `Cmd+Shift+Enter` — run all (stops on first error)
- `Cmd+J` / `Cmd+K` — move focus down / up

**Tech note** — only the focused cell loads Monaco. Unfocused cells render as static `<pre>`. Notebooks with 20+ cells don't become sluggish.

**Pricing** — free for personal use, $29 one-time for commercial.

Website: https://datapeek.dev
GitHub: https://github.com/Rohithgilla12/data-peek

Happy to answer questions. What kinds of notebooks or runbooks would you actually use this for?
```

---

### r/programming — "SQL notebooks in a desktop client: technical implementation notes"

**Title:** `SQL notebooks in a desktop Electron app: some implementation notes`

```
I just shipped SQL Notebooks for data-peek (Electron + React SQL client). A few decisions that might be interesting if you're building something similar.

**Cell architecture: thin tab, rich store**

The notebook tab holds only a `notebookId`. All cell state lives in a Zustand store backed by SQLite via IPC. Cell content auto-saves on a 500ms debounce — no explicit save button, toolbar shows "Saved 2m ago". This is the same pattern as saved queries in the app.

**Monaco only on focus**

Loading Monaco for every cell in a notebook would be expensive. Unfocused cells render as syntax-highlighted `<pre>` elements. On focus, Monaco replaces the `<pre>` lazily. This keeps notebooks with many cells fast.

**Pinned results in SQLite**

After executing a SQL cell, you can pin the result. It serializes to JSON and stores in a `notebook_cells.pinned_result` column (capped at 500 rows). On next load, the pinned result renders before any query is run. Useful for runbooks where you want to show the last known state.

**Run All stops on first error**

When you "Run All", SQL cells execute sequentially and Markdown cells are skipped. Execution stops on the first error. This is intentional — if a diagnostic SELECT fails, you don't want an UPDATE to run below it.

**Export formats**

`.dpnb` is a JSON file: version field, title, cells array. Connection IDs are stripped (they're machine-local); on import the user picks which connection to bind. Markdown export renders SQL cells as fenced code blocks and pinned results as Markdown tables.

**Result tables**

Same virtualized rendering as the main query tab — TanStack Virtual. Large result sets in notebooks don't cause DOM bloat.

Stack: Electron, React, TypeScript, Monaco, Zustand, better-sqlite3, TanStack Table + Virtual.

https://datapeek.dev | https://github.com/Rohithgilla12/data-peek

Curious if anyone's done something similar and ran into edge cases I haven't thought about yet.
```

---

## Dev.to / Blog Teaser

**Post title:** `SQL Notebooks in data-peek — mix queries and docs in one place`

```
data-peek v0.20.0 ships SQL Notebooks: a Jupyter-style editor that mixes executable SQL cells and Markdown cells in a single document.

The idea came from a workflow problem. When debugging a production issue, you end up with two separate things: the Notion doc explaining what happened, and the SQL queries you run to diagnose it. The doc has code blocks you copy somewhere else to execute. That's unnecessary friction.

SQL Notebooks collapse them. Write the explanation in a Markdown cell. Put the actual query in a SQL cell right below it. Run it inline. Pin the result so it's there when your teammate opens the notebook.

Key things in this release:

- SQL + Markdown cells with inline results
- Pinned results that persist across sessions
- Export as `.dpnb` (reimportable JSON) or Markdown (plain .md, readable anywhere)
- Duplicate a notebook to a different connection — same runbook, different environment
- Jupyter keyboard shortcuts (Shift+Enter, Cmd+J/K, Cmd+Shift+Enter for Run All)
- Folders for organization
- Monaco lazy-loaded per cell — notebooks with many cells stay fast

I wrote about the implementation decisions in more depth on the blog: [link].

data-peek is free for personal use, $29 one-time for commercial. macOS, Windows, Linux.

datapeek.dev
```

---

## General Notes

1. Post Reddit threads on weekday mornings (9–11am US Eastern). r/sql and r/database are lower-traffic; the technical angle in r/programming tends to do better there.
2. Screenshots and a short screen recording of notebook execution will significantly improve engagement on Twitter/X.
3. The r/programming post is technical by design — that audience responds better to implementation details than feature lists.
4. Don't cross-post identical content across subreddits simultaneously.
5. Engage with every reply in the first hour.
