# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

data-peek is a minimal, fast SQL client desktop application built with Electron, React, and TypeScript. Supports PostgreSQL and MySQL databases. Core philosophy: Simple over feature-rich, keyboard-first, fast to open and query.

## Commands

```bash
# Development (from root)
pnpm dev                 # Start desktop app with hot reload
pnpm lint                # Lint all workspaces
pnpm build               # Build for current platform

# From apps/desktop
pnpm format              # Format with Prettier
pnpm typecheck           # Full TypeScript check (node + web)
pnpm typecheck:node      # Check Electron main/preload only
pnpm typecheck:web       # Check React frontend only

# Platform builds
pnpm --filter @data-peek/desktop build:mac
pnpm --filter @data-peek/desktop build:win
pnpm --filter @data-peek/desktop build:linux
```

## Architecture

### Monorepo Structure (pnpm workspaces)
```
apps/desktop/           # Electron desktop application
apps/web/               # Next.js web app (license API, marketing)
packages/shared/        # Shared types for IPC communication
docs/                   # Scope document and roadmap
seeds/                  # Database seed files for testing
```

### Desktop App Layers
```
src/main/               # Electron main process (Node.js)
  index.ts              # IPC handlers, DB connections, query execution
  sql-builder.ts        # SQL generation for edit operations
  ddl-builder.ts        # DDL generation for table designer
  db-adapter.ts         # Database adapter interface
  adapters/             # Database-specific adapters
    postgres-adapter.ts # PostgreSQL implementation
    mysql-adapter.ts    # MySQL implementation
  license-service.ts    # License validation and management
  menu.ts               # Native menu configuration
  context-menu.ts       # Right-click context menus
  window-state.ts       # Window state persistence

src/preload/            # IPC bridge (context isolation)
  index.ts              # Exposes window.api to renderer

src/renderer/src/       # React frontend
  components/           # UI components
  stores/               # Zustand state management
  lib/                  # Utilities (export, SQL formatting)
  hooks/                # Custom React hooks
  router.tsx            # TanStack Router
```

### IPC Contract

The preload script exposes `window.api`:
```typescript
window.api.connections.{list, add, update, delete}
window.api.db.{connect, query, schemas, execute, previewSql, explain}
window.api.ddl.{createTable, alterTable, dropTable, getTableDDL, getSequences, getTypes, previewDDL}
window.api.license.{check, activate, deactivate, activateOffline}
window.api.savedQueries.{list, add, update, delete, incrementUsage}
window.api.menu.{onNewTab, onCloseTab, onExecuteQuery, onFormatSql, onClearResults, onToggleSidebar}
```

All IPC types are defined in `packages/shared/src/index.ts`.

### Database Adapter Pattern

Multi-database support via adapters in `src/main/adapters/`:
- `DatabaseAdapter` interface defines standard operations (connect, query, execute, getSchemas, explain, getTableDDL)
- `getAdapter(config)` returns the appropriate adapter based on `config.dbType`
- Supported types: `'postgresql' | 'mysql' | 'sqlite'` (SQLite pending implementation)

### State Management

Zustand stores in `src/renderer/src/stores/`:
- `connection-store.ts` - Active connection, available connections, schema cache
- `query-store.ts` - Query history, execution history
- `tab-store.ts` - Multiple editor tabs
- `edit-store.ts` - Pending inline edits (insert/update/delete)
- `ddl-store.ts` - Table designer state (columns, constraints, indexes)
- `license-store.ts` - License status and activation
- `saved-queries-store.ts` - Bookmarked SQL queries

## Tech Stack

- **Desktop**: Electron + electron-vite
- **Web**: Next.js (license API, marketing site)
- **Frontend**: React 19, TanStack Router, TanStack Table
- **UI**: shadcn/ui + Tailwind CSS 4
- **State**: Zustand
- **Editor**: Monaco
- **Database**: pg (PostgreSQL), mysql2 (MySQL), better-sqlite3 (local storage)
- **Visualization**: @xyflow/react (ERD diagrams)
- **ORM**: Drizzle (web app)

## Code Style

- Prettier: single quotes, no semicolons, 100 char width, no trailing commas
- TypeScript strict mode with path aliases:
  - `@/*` → renderer source
  - `@shared/*` → shared package

## Key Patterns

1. **IPC Communication**: All database operations go through IPC handlers in main process. Never import `pg` or `mysql2` in renderer.

2. **Type Safety**: Shared types in `packages/shared` ensure IPC contract consistency between main and renderer.

3. **Database Adapters**: `db-adapter.ts` abstracts database-specific logic. Add new databases by implementing `DatabaseAdapter` interface.

4. **SQL Generation**: `sql-builder.ts` generates SQL for edit operations (INSERT/UPDATE/DELETE). `ddl-builder.ts` handles DDL (CREATE/ALTER/DROP TABLE).

5. **Schema Caching**: Schema info is fetched once per connection and stored in Zustand.

6. **Licensing**: Commercial use requires license activation via `apps/web` API. Personal use is free.
