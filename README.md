<p align="center">
  <img src="apps/desktop/build/icon.png" alt="data-peek" width="96" />
</p>

<h1 align="center">data-peek</h1>

<p align="center">
  A fast, keyboard-first SQL client for PostgreSQL, MySQL, SQL Server, and SQLite.<br />
  Open it, run the query, get the answer, get back to work.
</p>

<p align="center">
  <a href="https://github.com/Rohithgilla12/data-peek/releases/latest"><img src="https://img.shields.io/github/v/release/Rohithgilla12/data-peek?style=flat-square&label=release" alt="Latest release" /></a>
  <a href="https://github.com/Rohithgilla12/data-peek/releases"><img src="https://img.shields.io/github/downloads/Rohithgilla12/data-peek/total?style=flat-square" alt="Downloads" /></a>
  <a href="https://www.npmjs.com/package/@data-peek/cli"><img src="https://img.shields.io/npm/v/@data-peek/cli?style=flat-square&label=cli" alt="npm @data-peek/cli" /></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/source-MIT-blue?style=flat-square" alt="MIT licensed source" /></a>
</p>

<p align="center">
  <a href="https://www.datapeek.dev">Website</a> ·
  <a href="https://www.datapeek.dev/download">Download</a> ·
  <a href="https://docs.datapeek.dev/docs">Docs</a> ·
  <a href="https://github.com/Rohithgilla12/data-peek/releases">Changelog</a>
</p>

<p align="center">
  <a href="https://www.datapeek.dev">
    <img src="apps/web/public/motion/hero.webp" alt="A SQL query types itself in data-peek and returns 8 rows in 38 ms, then the view pulls back through the schema's tables into the data-peek logo" width="100%" />
  </a>
</p>

## Why data-peek

- **Fast.** Opens in about two seconds and stays light on memory. No splash screens, no project setup.
- **Keyboard-first.** `Cmd/Ctrl+K` reaches every action. [Every shortcut](https://docs.datapeek.dev/docs/reference/keyboard-shortcuts) is documented.
- **Local and private.** Credentials are encrypted with your OS keychain. No telemetry, no account, no cloud sync.
- **Grows with the task.** A quick `SELECT` stays quick, and query plans, live diffs, ER diagrams, and an AI assistant are there when the job gets bigger.

## Install

| Platform             | Command                                                        |
| -------------------- | -------------------------------------------------------------- |
| macOS, Linux         | `curl -fsSL https://install.cat/Rohithgilla12/data-peek \| sh` |
| Windows (PowerShell) | `irm https://install.cat/Rohithgilla12/data-peek \| iex`       |
| macOS (Homebrew)     | `brew install --cask Rohithgilla12/tap/data-peek`              |

Or grab a build from [Releases](https://github.com/Rohithgilla12/data-peek/releases/latest): `.dmg` for macOS (signed and notarised), `.exe` for Windows, and `.AppImage`, `.deb`, or `.tar.gz` for Linux.

<details>
<summary>Platform notes</summary>

**macOS.** Builds are signed and notarised, so they open without warnings. The quick installer installs the matching `.dmg` and clears the quarantine flag for you. If an older manual install says the app is "damaged", run `xattr -cr "/Applications/Data Peek.app"`.

**Linux.** Auto-updates only work with the AppImage. The quick installer puts it at `~/.local/bin/data-peek`. `.deb` and `.tar.gz` installs need a manual download for each new release.

</details>

### No install: `npx @data-peek/cli doctor`

Eight Postgres schema checks from the terminal. Each finding comes with the SQL that fixes it.

```bash
npx @data-peek/cli doctor postgres://user:pass@localhost:5432/app
npx @data-peek/cli doctor "$DATABASE_URL" --fail-on warning   # fail CI on warnings
```

It finds tables without a primary key, foreign keys without an index, duplicate, unused, and invalid indexes, bloat, never-vacuumed tables, and nullable foreign keys. These are the same checks as Schema Intel in the app. See [`packages/cli`](packages/cli/README.md).

<p align="center">
  <img src="apps/web/public/motion/doctor-cli.webp" alt="npx @data-peek/cli doctor reporting an invalid index, a foreign key without an index, and nullable foreign keys, each with the SQL that fixes it" width="100%" />
</p>

## See it work

<table>
  <tr>
    <td width="50%">
      <a href="https://www.datapeek.dev/#feature-watch-mode"><img src="apps/web/public/motion/watch-mode.webp" alt="Watch Mode re-running a query: changed cells flash amber and a new row slides in on a green band" /></a>
      <br /><b>Watch Mode</b>: pin a <code>SELECT</code> and watch cells change live.
    </td>
    <td width="50%">
      <a href="https://www.datapeek.dev/#feature-query-plans"><img src="apps/web/public/motion/query-plan.webp" alt="An EXPLAIN ANALYZE plan growing into a tree, with the slow sequential scan flagged and the CREATE INDEX that fixes it" /></a>
      <br /><b>Query plans</b>: <code>EXPLAIN ANALYZE</code> as a tree, with the slow node and its fix.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <a href="https://www.datapeek.dev/#feature-mcp-approval"><img src="apps/web/public/motion/mcp-approval.webp" alt="An agent asks to run an UPDATE over MCP and data-peek shows an approval dialog before it runs" /></a>
      <br /><b>MCP server</b>: agents can read freely; every write waits for your approval.
    </td>
    <td width="50%">
      <a href="https://docs.datapeek.dev/docs/features/time-machine"><img src="apps/web/public/motion/time-machine.webp" alt="Time Machine scrubbing back to an earlier run of a query and diffing two runs cell by cell" /></a>
      <br /><b>Time Machine</b>: scrub back through past results and diff any two runs.
    </td>
  </tr>
</table>

More clips (command palette, ER diagrams, the AI assistant, inline editing) are on [datapeek.dev](https://www.datapeek.dev/#see-it-work).

## Features

### Query editor

- Monaco editor with schema-aware autocomplete that understands table aliases
- Multiple tabs and windows, plus [cross-tab references](https://docs.datapeek.dev/docs/features/cross-tab-references): name a tab and query its result from another as `@name`
- Step through multi-statement scripts one statement at a time, with manual transactions on PostgreSQL
- Saved queries with folders and tags, reusable snippets, and SQL notebooks that mix SQL cells with Markdown
- A sidebar omnibar (`/`) that searches tables, columns, functions, saved queries, and history

### Results and data

- Inline editing with a preview of the generated `INSERT`/`UPDATE`/`DELETE` before you commit
- Smart filters and sorting on results without re-running the query
- Foreign key navigation, a JSON/JSONB editor, and one-click column statistics
- Export to CSV, JSON, or Excel, or share a result as an image
- CSV import with column mapping and type inference, PostgreSQL `.sql` dump import, and an FK-aware fake data generator
- Data masking that blurs sensitive columns for demos and screenshots

### Performance

- `EXPLAIN` viewer with an interactive plan tree
- Query telemetry with a timing waterfall, and a benchmark mode reporting p50/p90/p99
- Performance hints for missing indexes, N+1 patterns, and slow queries, each with a suggested fix
- Cancel a running query, or kill a blocking one from the health monitor

### Live data

- **Watch Mode** re-runs a read-only query every 500 ms to 5 min and highlights changed cells. It refuses to poll anything that writes.
- **Time Machine** snapshots past results locally, so you can scrub back and diff any two runs (`Cmd/Ctrl+Shift+H`)
- Scheduled queries on a cron, with run history and desktop notifications
- PostgreSQL `LISTEN`/`NOTIFY` with a live event log
- Dashboards built from your queries, with charts, KPIs, and tables

### Schema and monitoring

- Schema explorer for tables, views, functions, procedures, and triggers
- Table designer for creating and altering tables: columns, indexes, constraints, and partitions
- Interactive ER diagrams
- Health monitor with active queries, table sizes, cache hit ratios, and lock detection

### AI and agents

- AI assistant that turns plain English into SQL and builds charts from results. It knows your schema.
- Bring your own key (OpenAI, Anthropic, Google, Groq, or local Ollama models), or bring your own agent: point it at your installed Claude Code, Codex, or Antigravity CLI and use the subscription you already have
- A built-in [MCP server](https://docs.datapeek.dev/docs/features/mcp-server) (off by default) that exposes your connections to AI agents. Reads are capped and rolled back, and every write needs your approval in the app.

### Connections and security

- PostgreSQL, MySQL, Microsoft SQL Server, and SQLite
- SSH tunnels through bastion hosts, using a password or a key
- Credentials encrypted with the OS keychain, and no telemetry
- An optional tamper-evident audit log of every statement you run. It stays local.

The [docs](https://docs.datapeek.dev/docs) cover every feature in depth.

## Pricing

The source is MIT licensed. The pre-built app is **free for personal use**: side projects, learning, open source, students, educators, non-profits, and solo founders, with every feature included. Using it at a for-profit company of two or more people, or as a freelancer or agency billing clients, needs a [Pro licence](https://www.datapeek.dev/pricing). Details are in [LICENSE.md](LICENSE.md).

data-peek is a single-maintainer project, and two commitments in [SUSTAINABILITY.md](SUSTAINABILITY.md) say so up front:

- **No kill switch.** If the licence server ever goes away, your activated version keeps working forever, offline.
- **Dormancy pledge.** After 12 months of maintainer inactivity, the commercial-licence requirement is waived for every released version.

## Contributing

Contributions are welcome, and **data-peek is taking part in Hacktoberfest**. Issues labelled [`good first issue`](https://github.com/Rohithgilla12/data-peek/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) say what to change and how to tell when it's done. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

```bash
git clone https://github.com/Rohithgilla12/data-peek.git
cd data-peek
pnpm install
pnpm dev          # desktop app with hot reload
```

<details>
<summary>Repository layout, scripts, and troubleshooting</summary>

```
apps/
  desktop/     Electron app (main process, preload, React renderer)
  docs/        docs.datapeek.dev
  web/         datapeek.dev marketing site and licence API
packages/
  cli/         @data-peek/cli, the `doctor` command
  shared/      Types and logic shared across apps (IPC contract, Schema Intel checks)
  ui/          Shared shadcn/ui components
```

| Script                                         | What it does                                   |
| ---------------------------------------------- | ---------------------------------------------- |
| `pnpm dev`                                     | Desktop app with hot reload                    |
| `pnpm dev:web`                                 | Marketing site                                 |
| `pnpm lint`                                    | Lint every workspace                           |
| `pnpm build`                                   | Build the desktop app for the current platform |
| `pnpm build:mac` / `build:win` / `build:linux` | Platform builds                                |

Built with Electron, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Zustand, and Monaco. Database drivers are `pg`, `mysql2`, `mssql`, and `better-sqlite3`.

**"Electron not found" after `pnpm install`?** pnpm's cache can skip Electron's postinstall step, which downloads the platform binary. Run `pnpm setup:electron`, then `pnpm rebuild`. If that doesn't fix it, `pnpm clean:install` starts from scratch.

</details>

## Support

- [GitHub Issues](https://github.com/Rohithgilla12/data-peek/issues) for bugs and feature requests
- [GitHub Sponsors](https://github.com/sponsors/Rohithgilla12) to support development
- [@gillarohith](https://x.com/gillarohith) on X

<p align="center">
  <br />
  <a href="https://vercel.com/oss">
    <img alt="Vercel OSS Program" src="https://vercel.com/oss/program-badge.svg" />
  </a>
</p>
