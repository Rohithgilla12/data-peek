# data-peek

A minimal, fast, lightweight PostgreSQL client desktop application. Built for developers who want to quickly peek at their data without the bloat.

## Features

- **Fast** - Opens in under 2 seconds, low memory footprint
- **Query Editor** - Monaco editor with SQL syntax highlighting and autocomplete
- **Multi-tab Support** - Work with multiple queries simultaneously
- **Inline Editing** - Edit table data directly with INSERT/UPDATE/DELETE
- **ERD Visualization** - See table relationships visually
- **Query Plans** - Analyze query performance with EXPLAIN ANALYZE viewer
- **Dark/Light Mode** - Easy on the eyes
- **Keyboard-First** - Power users shouldn't need a mouse
- **Secure** - Connection credentials encrypted locally, no telemetry

## Installation

### Download

Download the latest release for your platform from [Releases](https://github.com/Rohithgilla12/data-peek/releases).

- **macOS**: `.dmg` (Intel & Apple Silicon)
- **Windows**: `.exe` installer
- **Linux**: `.AppImage` or `.deb`

### macOS: "App is damaged" Fix

Since the app isn't notarized with Apple yet, macOS Gatekeeper may show a warning. To fix:

**Option 1: Terminal command**
```bash
xattr -cr /Applications/data-peek.app
```

**Option 2: Right-click to open**
1. Right-click (or Control+click) on data-peek.app
2. Select "Open" from the menu
3. Click "Open" in the dialog

This only needs to be done once. Proper code signing is coming soon!

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
| Database | pg (PostgreSQL driver) |

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
- Twitter/X: [@gillarohith](https://x.com/gillarohith)
