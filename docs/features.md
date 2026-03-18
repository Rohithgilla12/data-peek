# data-peek Feature Overview

> A minimal, fast, beautiful PostgreSQL client for developers who want to quickly peek at their data — now with AI-powered database exploration.

---

## Product Summary

**data-peek** is a lightweight desktop database client designed for developers who need quick, frictionless access to their databases. Unlike bloated alternatives like pgAdmin or DBeaver, data-peek focuses on speed, simplicity, and a keyboard-first experience — now with AI-powered assistance.

**Target Audience:** Developers, data engineers, backend engineers, and anyone who needs to quickly query and explore databases without the overhead of enterprise tools.

**Supported Databases:** PostgreSQL, MySQL (SQLite coming soon)

**Platforms:** macOS (Apple Silicon + Intel), Windows, Linux

---

## Key Value Propositions

| Benefit | Description |
|---------|-------------|
| **Lightning Fast** | Opens in under 2 seconds. No splash screens, no waiting. |
| **AI-Powered** | Ask questions in natural language, get SQL queries and charts. |
| **Zero Configuration** | Connect and query immediately. No complex setup required. |
| **Keyboard-First** | Power users can do everything without touching the mouse. |
| **Beautiful & Modern** | Dark and light themes with a clean, distraction-free UI. |
| **Privacy-First** | No telemetry, no tracking. Your data stays on your machine. |
| **Secure** | Connection credentials are encrypted locally. |
| **Pay Once, Own Forever** | No subscriptions. One-time purchase with 1 year of updates. |

---

## Pricing

### Free Tier
Get started at no cost:
- 2 database connections
- 50 query history items
- 3 editor tabs
- 1 schema for ER diagrams
- CSV/JSON export

### Pro License — ~~$99~~ $29 (Early Bird)
Unlock everything:
- **Unlimited** connections
- **Unlimited** query history
- **Unlimited** tabs
- **Unlimited** ER diagrams
- Inline data editing (INSERT/UPDATE/DELETE)
- Query execution plans (EXPLAIN/ANALYZE)
- 3 device activations
- 1 year of updates
- **Pay once, use forever**

### Cloud (Coming Soon)
For power users and teams:
- Everything in Pro
- Sync connections across devices
- Cloud-saved queries
- Team sharing
- ~$5-8/month

---

## Feature List

### Connection Management

| Feature | Description |
|---------|-------------|
| **Quick Connection Setup** | Add connections with host, port, database, user, and password — or paste a connection string |
| **Connection String Parsing** | Paste any PostgreSQL connection URL and auto-fill all fields |
| **Test Before Save** | Verify connections work before adding them |
| **Encrypted Storage** | Credentials stored securely with encryption |
| **SSL Support** | Connect to SSL-enabled databases |
| **Connection Switcher** | Quickly switch between multiple database connections |
| **Edit & Delete** | Manage saved connections with ease |

### Query Editor

| Feature | Description |
|---------|-------------|
| **Monaco Editor** | Same editor engine that powers VS Code |
| **SQL Syntax Highlighting** | Full SQL syntax highlighting with PostgreSQL support |
| **Smart Autocomplete** | Schema-aware suggestions for tables, columns, and SQL keywords |
| **Multi-Tab Support** | Work on multiple queries simultaneously with independent tabs |
| **Query Formatting** | Auto-format SQL with `Cmd/Ctrl + Shift + F` |
| **Run Query** | Execute with `Cmd/Ctrl + Enter` |
| **Collapsible Editor** | Minimize the editor to focus on results |

### Results Viewer

| Feature | Description |
|---------|-------------|
| **Data Table View** | View results in a clean, sortable table |
| **Data Type Indicators** | Color-coded badges showing column types |
| **Query Metrics** | See row count and query execution time |
| **Pagination** | Navigate large result sets with customizable page sizes |
| **Copy Cell** | Click any cell to copy its value |
| **Copy Row as JSON** | Export individual rows as JSON objects |
| **Export to CSV** | Download results as CSV files |
| **Export to JSON** | Download results as JSON files |
| **NULL Styling** | Clear visual distinction for NULL values |
| **Foreign Key Navigation** | Click FK cells to view related records |
| **JSON Tree Viewer** | Expand and inspect JSON with collapsible tree view |
| **JSON Syntax Highlighting** | Color-coded values by type (strings, numbers, booleans) |
| **JSON Preview** | Partial content preview in cell with tooltip |

### Schema Explorer

| Feature | Description |
|---------|-------------|
| **Tree View Navigation** | Browse schemas, tables, and views hierarchically |
| **Column Details** | See column names, data types, and constraints |
| **Primary Key Indicators** | Visual markers for primary key columns |
| **Nullable Indicators** | See which columns allow NULL values |
| **Foreign Key Display** | View foreign key relationships |
| **Table Search** | Filter tables by name with instant search |
| **Click to Query** | Click any table to generate a SELECT query |
| **Schema Refresh** | Reload schema after database changes |

### Query History

| Feature | Description |
|---------|-------------|
| **Auto-Save** | Every executed query is automatically saved |
| **Persistent Storage** | History survives app restarts |
| **Query Metadata** | See execution time, row count, and status for each query |
| **Quick Load** | Click any history item to load it into the editor |
| **Copy to Clipboard** | Copy previous queries without loading |
| **Clear History** | Remove all or individual history items |
| **Query Type Badges** | Visual indicators for SELECT, INSERT, UPDATE, DELETE |
| **Relative Timestamps** | "5 minutes ago", "yesterday", etc. |

### AI Assistant (New in v0.2.0)

| Feature | Description |
|---------|-------------|
| **Natural Language Queries** | Ask questions in plain English, get SQL queries |
| **Multi-Provider Support** | Choose OpenAI, Anthropic, Google, Groq, or local Ollama |
| **Schema Awareness** | AI understands your tables, columns, and relationships |
| **Inline Execution** | Run AI-generated queries and see results in chat |
| **Chart Generation** | Create bar, line, pie, and area charts from data |
| **Metric Cards** | Display formatted single-value insights |
| **Chat Persistence** | Conversations saved per connection |
| **Session Management** | Create, rename, and delete chat sessions |
| **Privacy Options** | Use local Ollama models for complete data privacy |

**Supported AI Providers:**

| Provider | Best For | Key Features |
|----------|----------|--------------|
| OpenAI | General use | GPT-5, GPT-4o models |
| Anthropic | SQL generation | Claude Opus 4.5, Sonnet 4 |
| Google | Balanced | Gemini 3 Pro, 2.5 |
| Groq | Speed | Ultra-fast inference |
| Ollama | Privacy | Local models, no API key needed |

### Column Statistics

| Feature | Description |
|---------|-------------|
| **One-Click Profiling** | Click the chart icon on any column header to open statistics |
| **Base Stats** | Row count, null count, null percentage, distinct count for every column |
| **Numeric Stats** | Min, max, average, standard deviation, median, histogram distribution |
| **Text Stats** | Min/max/average length, top 5 most common values |
| **DateTime Stats** | Earliest, latest, and date range |
| **Boolean Stats** | True/false counts and percentages |

### Data Masking

| Feature | Description |
|---------|-------------|
| **Blur Masking** | Blur sensitive column values with CSS filter |
| **Auto-Mask Rules** | Regex-based rules to automatically mask columns matching patterns (email, password, SSN, etc.) |
| **Hover to Peek** | Hold Alt and hover to temporarily reveal masked values |
| **Per-Tab State** | Each tab maintains its own set of masked columns |
| **Export Safety** | Warning dialog when exporting data with masked columns |
| **Persistent Rules** | Auto-mask rules persist across sessions |

### CSV Import

| Feature | Description |
|---------|-------------|
| **File Picker** | Drag-and-drop or file picker for CSV files |
| **Auto Column Mapping** | Automatically maps CSV columns to table columns by name |
| **Type Inference** | Detects data types from CSV content |
| **Conflict Handling** | Skip, update, or error on duplicate key conflicts |
| **Batch Insert** | Configurable batch size for large imports |
| **Progress Tracking** | Real-time progress bar with row count |
| **Cancel Support** | Cancel long-running imports mid-operation |

### Data Generator

| Feature | Description |
|---------|-------------|
| **Faker.js Integration** | Generate realistic fake data (names, emails, addresses, etc.) |
| **Heuristic Detection** | Auto-detects appropriate generator type from column names |
| **FK-Aware** | Samples existing foreign key values to maintain referential integrity |
| **Preview Mode** | Preview generated rows before inserting |
| **Configurable Row Count** | Generate 1 to 100,000+ rows |
| **Dedicated Tab** | Full-featured tab UI with per-column generator configuration |

### Inline Data Editing

| Feature | Description |
|---------|-------------|
| **Click-to-Edit Cells** | Single click to start editing (fast workflow) |
| **Enum Dropdowns** | Dropdown selectors for PostgreSQL enum columns |
| **JSON Cell Editor** | Sheet-based editor with live preview |
| **Add Rows** | Insert new records with a visual form |
| **Delete Rows** | Remove records with confirmation |
| **SQL Preview** | Review generated SQL before executing changes |
| **Batch Operations** | Queue multiple changes before committing |
| **Discard Changes** | Undo pending edits before saving |
| **Type-Safe Editing** | Input validation based on column data types |

### ER Diagram Visualization

| Feature | Description |
|---------|-------------|
| **Visual Schema Map** | See your database structure as an interactive diagram |
| **Table Nodes** | Each table displays all columns with types |
| **Relationship Lines** | Foreign key connections visualized as links |
| **Primary Key Highlights** | Yellow indicators for PK columns |
| **Foreign Key Highlights** | Blue indicators for FK columns |
| **Smart Auto-Layout** | Automatic positioning prevents overlapping tables |
| **Pan & Zoom** | Navigate large schemas with ease |
| **Mini Map** | Overview navigation for complex databases |

### Query Execution Plans

| Feature | Description |
|---------|-------------|
| **EXPLAIN Visualization** | See query execution plans in a visual tree |
| **Node Type Coloring** | Color-coded operations (scans, joins, sorts) |
| **Cost Analysis** | View estimated vs actual costs |
| **Performance Metrics** | Execution time breakdown by operation |
| **Buffer Statistics** | I/O and memory usage details |
| **Expandable Nodes** | Drill into plan details |

### Query Performance Indicator (PostgreSQL)

| Feature | Description |
|---------|-------------|
| **Missing Index Detection** | Identifies sequential scans on large tables that would benefit from indexes |
| **N+1 Pattern Detection** | Analyzes query history to flag repeated similar queries within time windows |
| **Slow Query Analysis** | Flags queries exceeding configurable threshold (default: 1 second) |
| **High Filter Ratio Detection** | Identifies queries scanning many rows to return few |
| **Row Estimate Mismatch** | Highlights planner vs actual row count variance |
| **Auto-Generated Index Suggestions** | Copy-ready `CREATE INDEX CONCURRENTLY` statements |
| **Severity Filtering** | Filter issues by critical, warning, or info severity |
| **Query Fingerprinting** | Normalizes queries to detect patterns across history |

### Database Monitoring

| Feature | Description |
|---------|-------------|
| **Connection Health Monitor** | Dashboard with 4 cards: active queries, table sizes, cache stats, locks |
| **Active Query Viewer** | See all running queries with PID, user, duration, and state |
| **Kill Queries** | Terminate long-running or blocking queries with one click |
| **Table Size Analysis** | View row counts, data size, index size, and total size per table |
| **Cache Hit Ratios** | Buffer cache and index hit ratios with color-coded thresholds |
| **Lock Detection** | See blocking locks with blocked/blocking PID, lock type, and wait time |
| **Auto-Refresh** | Configurable refresh interval (2s/5s/10s/30s/off) |
| **PostgreSQL Notifications** | Subscribe to LISTEN/NOTIFY channels |
| **Real-Time Events** | See notification events arrive in real-time |
| **Send Notifications** | Publish NOTIFY messages to channels from the UI |
| **Event History** | Persistent event log with SQLite storage |

### User Interface

| Feature | Description |
|---------|-------------|
| **Dark Mode** | Easy on the eyes for long coding sessions |
| **Light Mode** | Clean, bright interface when you prefer it |
| **System Preference** | Automatically match your OS theme |
| **Resizable Panels** | Drag to resize sidebar and editor |
| **Collapsible Sidebar** | Maximize workspace when needed |
| **Collapsible Query Editor** | Hide/show query panel to focus on results |
| **Settings Modal** | Configure preferences via UI (persisted) |
| **Loading States** | Clear feedback during operations |
| **Error Handling** | Helpful error messages with details |
| **Empty States** | Guided prompts when there's no data |

### Settings

| Setting | Description |
|---------|-------------|
| **Hide Query Editor by Default** | Start table previews with editor collapsed |
| **Expand JSON by Default** | Auto-expand JSON objects in viewer |

### Saved Queries Library (New in v0.2.0)

| Feature | Description |
|---------|-------------|
| **Save Queries** | Bookmark any query with name and description |
| **Folders/Tags** | Organize queries into categories |
| **Quick Access** | Search and filter saved queries |
| **Usage Tracking** | See how often each query is used |
| **Run Directly** | Execute saved queries with one click |
| **Copy to Editor** | Load queries into current tab |

### Command Palette (New in v0.2.0)

| Feature | Description |
|---------|-------------|
| **Quick Access** | `Cmd/Ctrl + K` to open |
| **Fuzzy Search** | Find any command by typing |
| **Grouped Commands** | Organized by category |
| **Keyboard Navigation** | Arrow keys + Enter to execute |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Enter` | Execute query |
| `Cmd/Ctrl + K` | Open command palette |
| `Cmd/Ctrl + B` | Toggle sidebar |
| `Cmd/Ctrl + Shift + F` | Format SQL |
| `Cmd/Ctrl + P` | Open connection picker |
| `Cmd/Ctrl + T` | New tab |
| `Cmd/Ctrl + W` | Close tab |
| `Cmd/Ctrl + 1-9` | Switch to tab 1-9 |
| `Cmd/Ctrl + Shift + 1-9` | Switch between connections |
| `Cmd/Ctrl + I` | Toggle AI assistant |

#### Data Editing Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + S` | Save pending changes |
| `Cmd/Ctrl + Shift + Z` | Discard all changes |
| `Cmd/Ctrl + Shift + I` | Add new row |
| `Escape` | Exit edit mode |
| `Cmd/Ctrl + Click` on FK | Open foreign key in new tab |

See the full [Keyboard Shortcuts Guide](/docs/keyboard-shortcuts.md) for all available shortcuts.

---

## Technical Highlights

| Aspect | Details |
|--------|---------|
| **Framework** | Electron with React 19 |
| **Editor** | Monaco (VS Code engine) |
| **AI Integration** | Vercel AI SDK with structured output |
| **Database Driver** | Native PostgreSQL (pg), MySQL (mysql2) |
| **Charts** | Recharts for AI-generated visualizations |
| **Local Storage** | SQLite for history and settings |
| **Security** | Encrypted credential storage |
| **Build Targets** | macOS DMG, Windows exe/msi, Linux AppImage/tar.gz |

---

## What data-peek is NOT

To set clear expectations:

- **Not a database admin tool** — Focus is on querying and exploring, not server management
- **Not a data migration tool** — CSV import is supported, but not full database migration
- **Limited multi-database** — PostgreSQL and MySQL supported (SQLite coming soon)
- **Not enterprise software** — Built for individual developers (team features coming with Cloud tier)

---

## Comparison with Alternatives

| Feature | data-peek | pgAdmin | DBeaver | TablePlus |
|---------|-----------|---------|---------|-----------|
| Startup Time | < 2s | 5-10s | 10-15s | 2-3s |
| Memory Usage | Low | High | Very High | Low |
| Learning Curve | Minimal | Steep | Steep | Minimal |
| Price | Free + $29 Pro | Free | Free/Paid | $69 |
| PostgreSQL Focus | Yes | Yes | No | No |
| **AI Assistant** | **Yes** | No | No | No |
| ER Diagrams | Yes | Yes | Yes | Yes |
| Inline Editing | Yes | Yes | Yes | Yes |
| Query Plans | Yes | Yes | Yes | Limited |
| Modern UI | Yes | No | No | Yes |

---

## Coming Soon

Features planned for future releases:

- SQLite support
- Connection groups/folders
- More AI visualization types (scatter, heatmap)
- AI query explanations and optimization suggestions
- **Cloud Sync** — Sync connections and saved queries across devices
- **Team Features** — Share queries and connections with your team

---

## Screenshots

*[Add screenshots here]*

- Connection dialog
- Query editor with results
- Schema explorer tree
- ER diagram view
- Query execution plan
- Inline data editing
- AI Assistant chat panel
- AI-generated charts
- Settings modal
- Dark/Light theme comparison

---

## One-Liner Descriptions

For various marketing contexts:

**Tagline:**
> Peek at your data. Fast. With AI.

**Short (10 words):**
> A fast, AI-powered database client for developers who value simplicity.

**Medium (25 words):**
> data-peek is a lightweight database client with AI assistance, modern UI, and features like ER diagrams and query plans — without the bloat.

**Long (50 words):**
> data-peek is the database client developers actually want to use. AI-powered natural language queries, lightning-fast startup, Monaco-powered SQL editor, visual ER diagrams, query execution plans, inline data editing, and a beautiful dark/light UI. No telemetry, no subscriptions, no bloat. Pay once, own forever. Available for macOS, Windows, and Linux.

---

*Document updated: March 2026 (v0.15.0)*
