# data-peek — video design system (derived from .impeccable.md)

## Brand

Fast. Honest. Modern devtool. Belongs beside Linear/Raycast, never DBeaver.
Quiet confidence — motion is purposeful, never decorative for its own sake.
Data is the protagonist; chrome recedes.

## Colors (video-scaled)

| Role                  | Value                          | Notes                              |
| --------------------- | ------------------------------ | ---------------------------------- |
| Background            | `#101216`                      | oklch(0.16 0.005 260) equivalent   |
| Background raised     | `#171a20`                      | cards, terminal panels             |
| Foreground            | `#ebecee`                      | oklch(0.92 0 0) equivalent         |
| Muted foreground      | `#9aa0ad`                      | labels, secondary copy             |
| Accent (bright)       | `#6b8cf5`                      | canonical OKLCH blue, hue 250      |
| Accent (deep)         | `#3b52c4`                      | glows, fills, gradients            |
| Success               | `#4ade80`                      | approve, chain-intact              |
| Destructive           | `#f2555a`                      | reject, write warnings             |
| Hairline              | `#2a2f3a`                      | borders 2px at video scale         |

Dark canvas only for these videos (dark mode is the primary design target).
Accent presence: glows at 15–25% opacity, focal hits at full saturation.

## Typography

- Display/UI: `Geist Variable` (fonts/geist.woff2), weights 300–900. Use extreme contrast: 300 vs 800.
- Code/data/metadata: `Geist Mono Variable` (fonts/geist-mono.woff2). Monospace-native identity — mono carries data, SQL, hashes, chips, coords.
- Tracking on display sizes: -0.03em. `font-variant-numeric: tabular-nums` on all numbers.
- Register rule: statements in Geist, everything machine-flavoured (SQL, hashes, tool names, shortcuts) in Geist Mono.

## Motion

- Eases: `expo.out` for confident entrances, `power3.out` standard, `power2.in` exits (final scene only), `steps()`-style typing via mono reveal.
- Speed: fast and precise (0.2–0.5s) for UI elements; slow (0.8–1.6s) only for atmosphere.
- No bounce/elastic — quiet confidence. No gratuitous shake.
- Ambient motion: cursor blinks, soft glow breathing, slow grid drift. One ambient per scene.

## Recurring motifs

- Blinking block cursor (▍) in accent blue.
- Hash-chain links: mono hash fragments joined by `→` glyphs.
- Terminal panel: raised bg, 3px hairline border, traffic-light dots at 30% opacity.
- Keyboard chip: mono text in bordered pill (like ⌘K).

## What NOT to do

- No light theme in these cuts.
- No gradients as full-screen linear washes (banding) — radial glows only.
- No emoji, no gratuitous icons, no wizard-flow visuals.
- No competitor references in copy.
- No claim that future updates are free forever; audit copy must say "local".
