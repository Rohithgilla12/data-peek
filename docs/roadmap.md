---
title: Roadmap
description: Planned features and future development direction for data-peek
---

# Roadmap

This document outlines planned features and future development priorities for data-peek. Features are organized by priority and scope.

## Pending Features (from v1.1/v2.0 scope)

| Priority | Feature | Description | Scope |
|----------|---------|-------------|-------|
| Medium | Connection groups/folders | Organize connections into folders/groups | v1.1 |
| Low | Database diff tool | Compare schemas between databases | v2.0 |

## Suggested Features

### High Priority

| Feature | Description |
|---------|-------------|
| Query Snippets/Templates | Pre-built SQL templates for common operations (SELECT *, COUNT, JOINs, etc.) |
| Connection Cloning | Quickly duplicate existing connections with modifications |
| Query History Search | Filter and search through query history |
| Keyboard Shortcut Customization | Allow users to remap keyboard shortcuts |

### Medium Priority

| Feature | Description |
|---------|-------------|
| Query Scheduling | Run queries on a local schedule (cron-like) |
| Multiple Result Sets UI | Better UI for queries returning multiple result sets |
| Schema Comparison | Compare schemas between two connections |
| Query Profiler | More detailed execution stats beyond current telemetry |

### Nice to Have

| Feature | Description |
|---------|-------------|
| Stored Procedure Debugger | Step through stored procedures |
| SQL Linting | Highlight potential SQL issues (missing indexes, N+1 patterns) |

## Pro Tier Features (Planned)

These features are planned for the commercial Pro tier:

| Feature | Description |
|---------|-------------|
| Cloud Sync | Sync settings, connections, and saved queries across devices |
| Team Workspaces | Collaborate with team members on queries and connections |
| Shared Query Library | Share queries across your organization |
| SSO/SAML | Enterprise single sign-on support |
| Audit Logs | Track who ran what queries and when |

## Technical Improvements

| Area | Description |
|------|-------------|
| Safe Storage | Investigate and fix safeStorage corruption issues for credential encryption |
| Offline Features | Expand offline functionality beyond current license grace period |

## Current Feature Status

For reference, here's what's already implemented:

### Core
- Multi-database support (PostgreSQL, MySQL, MSSQL, SQLite)
- SSH tunnel connections with password and key auth
- Encrypted credential storage using OS keychain
- SSL connection support

### Query Editor
- Monaco editor with SQL syntax highlighting
- Schema-aware autocomplete with table alias support
- Multi-tab and multi-window support
- Saved queries with organization
- Command palette (`Cmd+K`)
- Query formatting/beautify

### Performance Analysis
- Query telemetry with waterfall visualization
- Benchmark mode (p50/p90/p99 statistics)
- EXPLAIN viewer with interactive visualization
- Query cancellation

### Data Management
- Schema explorer (tables, views, stored procedures, functions)
- Inline editing (INSERT/UPDATE/DELETE)
- Table designer with full DDL support
- JSON editor for JSON/JSONB columns
- Export to CSV, JSON, Excel
- Server-side pagination
- CSV import with column mapping, type inference, and conflict handling
- Data generator with Faker.js integration and FK awareness
- Column statistics (one-click profiling with histograms and top values)
- Data masking (blur sensitive columns with auto-mask rules)

### Database Monitoring
- Connection health monitor (active queries, table sizes, cache stats, locks)
- PostgreSQL LISTEN/NOTIFY pub/sub dashboard
- Kill queries from health monitor

### Visualization
- ERD diagrams with interactive visualization
- Foreign key navigation

### AI Assistant
- Multi-provider support (OpenAI, Anthropic, Google, Groq, Ollama)
- Natural language to SQL
- Charts and insights generation
- Schema-aware responses

### User Experience
- Dark/Light mode with system preference
- Keyboard-first design
- Auto-updates
- Multi-window support

## Contributing

Want to help implement a feature? Check out our [Contributing Guide](https://github.com/Rohithgilla12/data-peek/blob/main/CONTRIBUTING.md) and pick an item from this roadmap!
