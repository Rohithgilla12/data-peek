---
title: "Adding Jupyter-Style SQL Notebooks to a Desktop App"
published: false
description: "Why I added Jupyter-style notebooks to data-peek, how they work, and what makes them different from running SQL in a cell-based Python notebook."
tags: electron, sql, typescript, developer-tools
series: "Building data-peek"
cover_image:
---

# Adding Jupyter-Style SQL Notebooks to a Desktop App

A few months ago I added a feature I wasn't sure anyone would ask for: SQL notebooks. Cells of SQL and Markdown mixed together, each cell executable inline, results pinnable to the document. Jupyter for your database, without the kernel management.

The reaction was better than expected. The use case that kept coming up in feedback wasn't what I'd imagined. People weren't using notebooks for exploratory data analysis — they were using them for **team runbooks**.

## The Runbook Problem

Here's the actual problem: your team has a production database, and over time you accumulate a collection of queries that everyone needs occasionally. "How many active users signed up in the last 30 days?" "Which accounts have the broken subscription state?" "What's the current queue depth?"

These queries usually live in:
- A Notion doc where the SQL loses its formatting
- A Slack thread you can never find again
- Someone's personal `queries.sql` file that leaves when they do

What you actually want is a document where the SQL is the document. Not a screenshot of results next to code — the live, runnable query *is* the content. And when someone updates the query, the next person who opens it gets the updated version, not a stale screenshot.

That's the runbook use case. And it's a good fit for a notebook UI.

## How It Works

A notebook in data-peek is a tab that holds a list of cells. Each cell is either a SQL cell or a Markdown cell.

**SQL cells** show the query text. Click to edit, Shift+Enter to run and move to the next cell, Cmd+Enter to run in place. Results appear inline below the query.

**Markdown cells** render as formatted text when not focused — headings, bold, bullet lists. Click to edit, Escape to go back to rendered mode. These are the "runbook" parts: the explanation of what the query does, when to run it, what to look for in the results.

The mix looks like this in practice:

```
## Daily Active Users Check

Run this every morning before standup.

[SQL cell]
SELECT COUNT(DISTINCT user_id)
FROM events
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND event_type = 'session_start'

[Markdown cell]
If the number is below 500, check whether the auth service had any
errors overnight. Alert #ops if below 200.
```

The Markdown gives context. The SQL is always current. Anyone on the team can open the notebook and run it without digging through docs.

## Pinning Results

SQL cells have a "pin result" option in the cell menu. Pinning freezes the current result set into the cell and persists it to disk. The pinned result survives closing and reopening the notebook.

This is useful for runbooks because you want to see what the baseline looked like. Pinned results display with a timestamp: "Pinned — ran 3 days ago · 12ms". You can re-run to get fresh numbers, or keep the pin as a reference.

The pin metadata includes `executedAt`, `durationMs`, `rowCount`, and the full result rows. It's stored as a JSON column in SQLite. More on the storage design in the next post.

## The .dpnb Format

Notebooks can be exported as `.dpnb` files (data-peek notebook, JSON) or as Markdown. The `.dpnb` format is straightforward:

```json
{
  "version": 1,
  "title": "Daily Checks",
  "folder": "ops",
  "cells": [
    {
      "type": "markdown",
      "content": "## Daily Active Users\n\nRun before standup."
    },
    {
      "type": "sql",
      "content": "SELECT COUNT(*) FROM events WHERE ...",
      "pinnedResult": {
        "columns": ["count"],
        "rows": [[1234]],
        "rowCount": 1,
        "executedAt": 1704067200000,
        "durationMs": 12
      }
    }
  ]
}
```

This is designed to be committed to a git repo. The cells are plain text, diffable, mergeable. Pinned results make the diffs noisier, but the tradeoff is that you get a historical record of what the query returned.

The Markdown export is intended for sharing outside the tool — paste into Confluence, commit to a wiki. It renders the pinned result as a Markdown table.

## What Makes This Different from Jupyter

The most common question when I describe this feature is "why not just use Jupyter with a PostgreSQL kernel?" Fair question. A few differences:

**Bound to a connection, not a kernel.** Every notebook is created against a specific database connection. You don't manage kernels, environments, or driver installations. Open the notebook, it's connected.

**No execution state.** In Jupyter, cells can define variables and functions that affect later cells. Data-peek notebooks have no shared state between cells — each SQL cell is a standalone query. This is a deliberate simplification. It means notebooks are always reproducible regardless of execution order.

**Instant startup.** No kernel to boot. Opening a notebook is as fast as opening any other tab.

**Desktop-first.** The notebook is a native desktop feature, not a browser tab. It gets native shortcuts, native file dialogs for export, and it lives alongside your other data-peek tabs.

The tradeoff is no Python cells, no pandas, no plotting. If you need that, Jupyter is the right tool. data-peek notebooks are specifically for SQL-first workflows.

## Keyboard Shortcuts

The keyboard model follows Jupyter's conventions where it made sense:

| Shortcut | Action |
|----------|--------|
| Shift+Enter | Run cell and advance to next |
| Cmd+Enter | Run cell, stay in place |
| Escape | Exit cell edit mode |
| Cmd+J | Move focus to next cell |
| Cmd+K | Move focus to previous cell |
| Cmd+Shift+D | Delete focused cell |

The hint bar at the bottom of the editor always shows these. I wanted the feature to be discoverable without reading docs.

## What's Next

Two things I want to add:

**AI cells.** A third cell type that takes a natural language prompt and generates SQL. data-peek already has AI SQL generation in the query editor — bringing that into notebooks would make it easier to build runbooks interactively.

**Cloud sync.** Right now notebooks are local to one machine. For team runbooks you want a shared library. The architecture is already designed for it — notebooks have a `connectionId` but the storage is pluggable. Adding a sync backend is the missing piece.

The runbook use case made me realize data-peek was missing a way to put SQL *in context*. A notebook is just a document where SQL is a first-class citizen. That sounds obvious in retrospect.
