# Contributing to data-peek

Thank you for your interest in contributing to data-peek! This document provides guidelines and instructions for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/data-peek.git
   cd data-peek
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Create a branch for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development

```bash
# Start the desktop app in development mode
pnpm dev

# Start the web app
pnpm dev:web

# Run linting
pnpm lint

# Type checking (from apps/desktop)
cd apps/desktop
pnpm typecheck

# Unit tests (from apps/desktop)
pnpm test

# End-to-end tests (from apps/desktop; builds first, needs Docker for the Postgres specs)
pnpm test:e2e
```

## Project Structure

```
apps/
  desktop/           # Electron desktop app
    src/main/        # Main process (Node.js)
    src/preload/     # IPC bridge
    src/renderer/    # React frontend
  web/               # Marketing website + licence API
  docs/              # Documentation site
packages/
  shared/            # Shared TypeScript types
```

## Where to start

Issues labelled
[good first issue](https://github.com/Rohithgilla12/data-peek/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
are scoped for newcomers. For bigger changes, open an issue first so we can
agree on the approach before you invest time. Every PR gets maintainer review.

## Code Style

- We use Prettier for formatting (single quotes, no semicolons)
- TypeScript strict mode is enabled
- Run `pnpm lint` before committing

## Pull Request Process

1. Ensure your code passes linting and type checking
2. Update documentation if you're adding new features
3. Write clear commit messages
4. Open a PR against the `main` branch
5. Describe what your PR does and why

## Reporting Issues

When reporting issues, please include:

- Your operating system and version
- Steps to reproduce the issue
- Expected vs actual behavior
- Screenshots if applicable

## Feature Requests

Feature requests are welcome! Please open an issue describing:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
