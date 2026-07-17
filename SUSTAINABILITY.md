# Sustainability & Continuity

data-peek is built and maintained by a single developer. That is a fair thing
to weigh before adopting any tool, so here is exactly what happens if this
project ever stops being maintained — written down, versioned in git, and
verifiable against the source code.

## If data-peek stops being maintained

- **The source stays yours.** The entire codebase is MIT-licensed. You can
  build, patch, and redistribute it today — see
  [Building from source](#building-from-source).
- **Releases are not tied to one machine.** Every published binary is built by
  GitHub Actions ([build.yml](.github/workflows/build.yml),
  [build-artifacts.yml](.github/workflows/build-artifacts.yml)). Anyone with a
  fork can run the same workflows to produce their own builds.
- **Your licence does not depend on our servers.** See the guarantee below.

## Kill-switch-free guarantee

data-peek's licence activation is designed to fail open for the versions you
already have:

- Activated licences revalidate roughly every 7 days. If the licence server is
  unreachable, your licence remains fully valid for a 30-day grace window.
- After that window, the licence falls back to **perpetual mode**: the version
  you activated keeps working, with all commercial features, forever — fully
  offline.

In plain terms: if the licence server disappeared tomorrow, every activated
installation would keep working on its current version indefinitely. This is
how the code behaves today (`apps/desktop/src/main/license-service.ts`), not a
promise about future behaviour.

## Dormancy pledge

If this repository has no maintainer activity — no commits, no releases, and
no issue triage — for **12 consecutive months**, the commercial-licence
requirement is waived for all versions released up to that point.

This pledge is made by the maintainer, lives in version control, and applies
to every copy of this file distributed with a release.

## Building from source

```bash
git clone https://github.com/Rohithgilla12/data-peek.git
cd data-peek
pnpm install
pnpm --filter @data-peek/desktop build:mac   # or build:win / build:linux
```

Binaries you build yourself are covered by the MIT licence alone — the
commercial-licence terms apply only to the pre-built binaries we distribute.
