# data-peek


![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/Rohithgilla12/data-peek/total?style=for-the-badge)



A minimal, fast SQL client desktop application with AI-powered querying. Built for developers who want to quickly peek at their data without the bloat. Supports PostgreSQL, MySQL, Microsoft SQL Server, and SQLite.



<p align="center">
  <img src="https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev/hero.png" alt="Data Peek - SQL Client" width="100%" />
</p>

## Screenshots

<details>
<summary>AI Assistant - Generate charts and insights</summary>
<img src="https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev/ai-assitant.png" alt="AI Assistant Charts" width="100%" />
</details>

<details>
<summary>AI Assistant - Natural language to SQL</summary>
<img src="https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev/ai-assitant-2.png" alt="AI Assistant Queries" width="100%" />
</details>

<details>
<summary>ER Diagrams - Visualize relationships</summary>
<img src="https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev/erd.png" alt="ER Diagrams" width="100%" />
</details>

<details>
<summary>Command Palette - Quick actions</summary>
<img src="https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev/command-bar.png" alt="Command Palette" width="100%" />
</details>

<details>
<summary>Light Mode</summary>
<img src="https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev/light-mode.png" alt="Light Mode" width="100%" />
</details>


## Features

- **AI Assistant** - Ask questions in plain English, get SQL queries. Generate charts and insights (BYOK)
- **Fast** - Opens in under 2 seconds, low memory footprint
- **Query Editor** - Monaco editor with SQL syntax highlighting and smart autocomplete with table aliases
- **Command Palette** - `Cmd+K` to access everything instantly
- **Multi-tab & Multi-window** - Work with multiple queries and databases simultaneously
- **Query Telemetry** - Detailed timing breakdown with waterfall visualization and benchmark mode
- **SSH Tunnels** - Connect securely through bastion hosts
- **Schema Explorer** - Browse tables, views, stored procedures, and functions
- **Inline Editing** - Edit table data directly with INSERT/UPDATE/DELETE
- **ERD Visualization** - See table relationships visually
- **Query Plans** - Analyze query performance with EXPLAIN ANALYZE viewer
- **Saved Queries** - Bookmark your favorite queries for quick access
- **Cancel Queries** - Stop long-running queries mid-execution
- **Auto-Updates** - Automatic updates with toast notifications
- **Dark/Light Mode** - Easy on the eyes
- **Keyboard-First** - Power users shouldn't need a mouse
- **Secure** - Connection credentials encrypted locally using OS keychain, no telemetry

## Installation

### Download

Download the latest release for your platform from [Releases](https://github.com/Rohithgilla12/data-peek/releases).

- **macOS**: `.dmg` (Intel & Apple Silicon)
- **Windows**: `.exe` installer
- **Linux**: `.AppImage`, `.deb`, or `.tar.gz` (Arch)

### macOS: Code Signing

Starting from v0.4.0, data-peek is code signed and notarized for macOS. You should be able to open it directly without any warnings.

If you're using an older version and see an "App is damaged" warning:

**Option 1: Terminal command**
```bash
xattr -cr /Applications/data-peek.app
```

**Option 2: Right-click to open**
1. Right-click (or Control+click) on data-peek.app
2. Select "Open" from the menu
3. Click "Open" in the dialog

### Linux: Auto-Updates

Auto-updates only work with the **AppImage** format. If you installed via `.deb` or `.tar.gz`, you'll need to manually download new releases from the [Releases page](https://github.com/Rohithgilla12/data-peek/releases).

| Format | Auto-Update |
|--------|-------------|
| AppImage | Yes |
| .deb | No (manual update) |
| .tar.gz | No (manual update) |

For the best experience with automatic updates, we recommend using the AppImage.

### Build from Source

```bash
# Clone the repository
git clone https://github.com/Rohithgilla12/data-peek.git
cd data-peek

# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for your platform
pnpm build:mac    # macOS
pnpm build:win    # Windows
pnpm build:linux  # Linux
```

### Troubleshooting: Electron not found

If you get errors about Electron not being found after `pnpm install`:

```bash
# Option 1: Run the setup script
pnpm setup:electron

# Option 2: Rebuild native modules
pnpm rebuild

# Option 3: Clean install (nuclear option)
pnpm clean:install
```

This can happen when pnpm's cache skips Electron's postinstall script that downloads platform-specific binaries.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop | Electron |
| Frontend | React 19 + TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| State | Zustand |
| Query Editor | Monaco |
| Database | pg (PostgreSQL), mysql2 (MySQL), mssql (SQL Server), better-sqlite3 (SQLite) |

## Project Structure

```
apps/
  desktop/     # Electron desktop application
  web/         # Marketing website + licensing
packages/
  shared/      # Shared types for IPC
```

## Development

```bash
# Install dependencies
pnpm install

# Start desktop app with hot reload
pnpm dev

# Start web app
pnpm dev:web

# Lint all workspaces
pnpm lint

# Build desktop app
pnpm build
```

## Star History

<a href="https://www.star-history.com/#Rohithgilla12/data-peek&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Rohithgilla12/data-peek&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=Rohithgilla12/data-peek&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=Rohithgilla12/data-peek&type=date&legend=top-left" />
 </picture>
</a>

## License

MIT License - see [LICENSE](LICENSE) for details.

Pre-built binaries require a license for commercial use. See the license file for details on free vs. commercial use.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Support

- [GitHub Issues](https://github.com/Rohithgilla12/data-peek/issues) - Bug reports and feature requests
- [GitHub Sponsors](https://github.com/sponsors/Rohithgilla12) - Support development
- Twitter/X: [@gillarohith](https://x.com/gillarohith)
