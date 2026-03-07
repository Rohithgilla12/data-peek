# Electrobun Migration Design

**Date:** 2026-03-07
**Status:** Approved
**Issue:** [#110](https://github.com/Rohithgilla12/data-peek/issues/110)

## Goals

- Reduce distribution size from ~241MB to ~14MB (17x smaller)
- Faster startup (<50ms vs 2-5s)
- Tiny differential updates (14KB binary patches vs full binary rebuilds)
- Modern TypeScript-first runtime (Bun)
- Maintain full feature parity with current Electron app

## Non-Goals

- Adding new features during migration
- Mobile support
- Dropping any database support (PostgreSQL, MySQL, MSSQL, SQLite)

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Webview | System webview (no CEF) | Smallest bundle; Monaco works on modern WebKit/WebView2. Can toggle to CEF later without recompiling if issues arise. |
| Internal storage | Bun's built-in SQLite | Replaces `electron-store`. Atomic writes, queryable, no native addon needed. |
| Secret storage | Platform keychain | Replaces `safeStorage`. Use native FFI or keychain library. |
| SSH tunneling | Try `ssh2` on Bun as-is | ~95% N-API compatibility. Validate in prototype, find alternatives only if it fails. |
| MSSQL | Experimental | Socket issue fixed (Bun v1.1.27). Performance issue open (182x slower pooling). Functional but performance TBD. |
| IPC | Typed bidirectional RPC | Replaces 92 `ipcMain.handle` endpoints with `BrowserView.defineRPC()` schema-first typed RPC. |
| Auto-updater | Electrobun built-in `Updater` | Replaces `electron-updater`. Only needs static file hosting. Binary diff patches. |

## Current Electron Surface Area

### IPC Endpoints (92 total)

| Namespace | Count | Handlers |
|-----------|-------|----------|
| connections | 4 | list, add, update, delete |
| db (queries) | 11 | connect, query, cancel-query, schemas, invalidate-schema-cache, execute, preview-sql, explain, query-with-telemetry, benchmark, analyze-performance |
| db (DDL) | 7 | create-table, alter-table, drop-table, get-table-ddl, get-sequences, get-types, preview-ddl |
| license | 5 | check, activate, deactivate, activate-offline, customer-portal |
| saved queries | 5 | list, add, update, delete, increment-usage |
| snippets | 4 | list, add, update, delete |
| scheduled queries | 13 | CRUD, pause/resume, run-now, history, cron validation |
| dashboards | 18 | CRUD, widgets, layouts, refresh scheduling, tagging |
| AI | 20 | config, chat, sessions, multi-provider management |
| files | 1 | open-file-dialog |
| window | 3 | minimize, maximize, close |

### Electron-Specific Dependencies to Replace

| Current | Replacement |
|---------|-------------|
| `electron` (runtime) | Electrobun + Bun |
| `electron-vite` | Electrobun CLI + Vite (renderer only) |
| `electron-builder` | Electrobun build pipeline |
| `electron-updater` | `Updater` API |
| `electron-store` | Bun SQLite |
| `electron-log` | Custom logger using `Bun.file()` |
| `@electron-toolkit/preload` | Not needed (RPC replaces preload) |
| `@electron-toolkit/utils` | Electrobun equivalents |
| `better-sqlite3` (internal) | `bun:sqlite` |
| `better-sqlite3` (user DBs) | `bun:sqlite` |
| `contextBridge` / preload | Typed RPC via `BrowserView.defineRPC()` |
| `ipcMain` / `ipcRenderer` | Typed RPC |
| `Menu` | `ApplicationMenu.setApplicationMenu()` |
| `dialog` | Electrobun dialog APIs |
| `shell.openExternal` | Electrobun equivalent or `Bun.spawn` |
| `Notification` | Platform notification API |
| `safeStorage` | Platform keychain |
| `screen` | Electrobun window APIs |

### Database Adapters

| Adapter | Current Package | Electrobun Plan |
|---------|----------------|-----------------|
| PostgreSQL | `pg` (Client per query) | Option A: Keep `pg` on Bun. Option B: Use `Bun.SQL` native driver. |
| MySQL | `mysql2/promise` | Option A: Keep `mysql2` on Bun. Option B: Use `Bun.SQL` native driver. |
| MSSQL | `mssql` (tedious) | Keep `mssql` on Bun. Experimental — monitor performance. |
| SQLite (user) | `better-sqlite3` | Replace with `bun:sqlite` (built-in, no native addon). |
| SQLite (internal) | `electron-store` (JSON) | Replace with `bun:sqlite`. |

### Native Module Risk Assessment

| Module | Risk | Notes |
|--------|------|-------|
| `ssh2` | Medium | N-API native submodules. Needs prototype validation. |
| `better-sqlite3` | Low | Replaced by `bun:sqlite` — no risk. |
| `pg` | None | Pure JS driver. Works on Bun. |
| `mysql2` | None | Pure JS driver. Works on Bun. |
| `mssql` | Medium | Socket fix shipped. Pool performance issue open. |

## Architecture Comparison

### Electron (Current)

```
Main Process (Node.js)
  ├── IPC handlers (ipcMain.handle)
  ├── Database adapters (pg, mysql2, mssql, better-sqlite3)
  ├── Services (storage, license, scheduler, AI, SSH)
  └── Native APIs (Menu, dialog, Notification, safeStorage)

Preload Script (contextBridge)
  └── window.api.* (95 methods)

Renderer Process (Chromium)
  └── React app → window.api.* calls
```

### Electrobun (Target)

```
Zig Launcher
  └── Starts Bun + owns native GUI event loop

Bun Worker Process
  ├── RPC handlers (BrowserView.defineRPC)
  ├── Database adapters (Bun.SQL / pg / mysql2 / mssql)
  ├── Services (SQLite storage, license, scheduler, AI, SSH)
  └── Native APIs (ApplicationMenu, dialog, Tray, Updater)

Webview Process (System WebKit / WebView2 / WebKitGTK)
  └── React app → RPC calls (typed, encrypted WebSocket)
```

### IPC Migration Pattern

**Before (Electron):**
```typescript
// main
ipcMain.handle('db:query', async (_event, connectionId, sql) => {
  const adapter = getAdapter(config)
  return adapter.query(sql)
})

// preload
db: {
  query: (connectionId: string, sql: string) =>
    ipcRenderer.invoke('db:query', connectionId, sql)
}

// renderer
const result = await window.api.db.query(connectionId, sql)
```

**After (Electrobun):**
```typescript
// shared types
type DataPeekRPC = {
  requests: {
    dbQuery: { params: { connectionId: string, sql: string }, response: QueryResult }
  }
}

// main (Bun)
const rpc = BrowserView.defineRPC<DataPeekRPC>({
  handlers: {
    requests: {
      dbQuery: async ({ connectionId, sql }) => {
        const adapter = getAdapter(config)
        return adapter.query(sql)
      }
    }
  }
})

// renderer
const result = await rpc.request.dbQuery({ connectionId, sql })
```

## Migration Strategy

### Phase 0: Prototype (Validate Unknowns)

Goal: De-risk the biggest unknowns before committing to full migration.

**Validate:**
1. Monaco editor renders and functions correctly in system WebKit (macOS) and WebView2 (Windows)
2. `ssh2` works on Bun (connect, port forward)
3. `mssql` works on Bun (connect, query, acceptable performance)
4. Bun.SQL works for PostgreSQL and MySQL
5. Basic RPC round-trip (Bun ↔ webview)
6. shadcn/ui + Tailwind CSS 4 render correctly in system webview

**Deliverable:** Working window that can connect to a PostgreSQL database, run a query, and display results in a table with Monaco editor for SQL input.

**Exit criteria:** All 6 validations pass, or we identify blocking issues and decide how to handle them.

### Phase 1: Project Scaffold

- Initialize Electrobun project structure in `apps/desktop/`
- Configure Vite for renderer bundling
- Get React app loading in Electrobun webview
- Set up path aliases (`@/*`, `@shared/*`)
- Verify hot reload works in development

### Phase 2: Internal Storage

- Create SQLite schema for internal state (connections, settings, saved queries, snippets)
- Implement storage service replacing `electron-store` + `DpStorage`
- Implement secure storage using platform keychain (replacing `safeStorage`)
- Migrate data model from JSON to SQLite tables
- Data migration utility for existing users (read old JSON, write to SQLite)

### Phase 3: Database Adapters + Query RPC

- Port `DatabaseAdapter` interface
- Port PostgreSQL adapter (try both `pg` and `Bun.SQL`, pick winner)
- Port MySQL adapter (try both `mysql2` and `Bun.SQL`, pick winner)
- Port MSSQL adapter (keep `mssql` package)
- Port SQLite adapter (replace `better-sqlite3` with `bun:sqlite`)
- Define RPC types for all query-related endpoints (11 handlers)
- Implement query tracker and cancellation
- Implement schema cache

### Phase 4: Connection + CRUD RPC

- Port connection handlers (4 endpoints)
- Port DDL handlers (7 endpoints)
- Port saved queries handlers (5 endpoints)
- Port snippet handlers (4 endpoints)
- Port file dialog handler (1 endpoint)
- Multi-window broadcast for connection sync

### Phase 5: Native Features

- Application menu (`ApplicationMenu.setApplicationMenu()`)
- Context menus (`ContextMenu` API)
- Window management (minimize, maximize, close, state persistence)
- Auto-updater (`Updater` API + static file hosting)
- Platform notifications (scheduled query completion)
- `shell.openExternal` equivalent for links

### Phase 6: Advanced Features

- SSH tunnel service (port `ssh2` usage)
- Scheduled queries service (port `node-cron` usage)
- Dashboard service (widgets, layouts, cron refresh)
- AI service (Vercel AI SDK on Bun)
- License service (HTTP + device fingerprinting)
- Telemetry and performance analyzer

### Phase 7: Build, Package, Distribute

- Configure Electrobun build pipeline
- Code signing and notarization (macOS)
- Windows installer
- Linux packaging (Ubuntu .tar.gz)
- Auto-update infrastructure (static file hosting for patches)
- CI/CD pipeline updates
- Update Homebrew Cask formula
- Migration guide for existing users

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Monaco doesn't work on WebKit | Low | High | Toggle CEF; validate in Phase 0 |
| `ssh2` fails on Bun | Medium | High | Fall back to `Bun.spawn(['ssh', '-L', ...])` |
| MSSQL pool performance | Medium | Medium | Use single connections (current pattern); monitor Bun issue #13093 |
| `better-sqlite3` N-API issues | N/A | N/A | Replaced by `bun:sqlite` — eliminated |
| Linux WebKitGTK inconsistencies | Medium | Medium | Bundle CEF for Linux only if needed |
| Electrobun API gaps | Low | Medium | Framework author responsive; can contribute upstream |
| Application menus missing on Linux | Known | Low | Linux is lowest-priority platform; use in-app menu fallback |
| Existing user data migration | Low | High | Build migration utility in Phase 2; test thoroughly |

## Platform Support Matrix

| Platform | Minimum Version | Webview Engine | Menu Support |
|----------|----------------|----------------|--------------|
| macOS | 14+ (Sonoma) | WebKit (WKWebView) | Full |
| Windows | 11+ | Edge WebView2 (Chromium) | Full |
| Ubuntu | 22.04+ | WebKitGTK | No app menu (in-app fallback) |

## Success Criteria

- [ ] All 92 IPC endpoints ported to typed RPC
- [ ] All 4 database adapters functional
- [ ] SSH tunneling works
- [ ] Auto-updater works with static file hosting
- [ ] Distribution size < 20MB compressed
- [ ] Startup time < 100ms
- [ ] All existing features work (menus, notifications, scheduled queries, dashboards, AI)
- [ ] Existing user data can be migrated
- [ ] CI/CD builds for macOS, Windows, Linux
