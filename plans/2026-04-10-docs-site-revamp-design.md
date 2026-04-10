# Docs Site Revamp — Design

**Date:** 2026-04-10
**Status:** Draft — pending review
**Target:** `apps/docs` (Fumadocs 16 + TanStack Start + Vite)

## Context

The docs site at `docs.datapeek.dev` has been in firefighting mode since PR #150 (the big marketing + docs overhaul). Recent commits on `feat/make-docs-better` tell the story: hydration crash fix (#151), MDX parse breakage from numeric operators in prose, untracked marketing content, missing feature pages. On top of that, the user reports layout transitions feel slow — `/docs/configuration/settings` was called out specifically.

Initial assumption was that Fumadocs + TanStack Start is an unsupported combo. **That's wrong.** Fumadocs 16 lists TanStack Start as a first-class target alongside Next.js, React Router, and Waku. The problems are all fixable inside the current stack.

## Root-cause findings (grounded in the repo)

### 1. Framer Motion page transition — the biggest perf problem

`src/routes/docs/$.tsx:108-112` wraps every doc page in a `motion.div` with `duration: 0.5` and a custom easing. That's a **500ms fade-in on every navigation before content is visible.** Intent preloading does nothing to hide this — the page is already loaded, the animation is the wait.

### 2. Sidebar tree re-transformed on every navigation

`src/routes/docs/$.tsx:58` returns `tree: source.pageTree as object` from the server loader on every navigation. At `$.tsx:131-134` the tree goes through `transformPageTree` under `useMemo([data.tree])`, but because the server returns a new reference every time, the memo never hits. The full sidebar tree is walked and recreated on every nav.

Worse: shipping the entire page tree in the loader payload adds bytes to every navigation response.

### 3. Entire page data re-fetched on every navigation

The `createServerFn` loader runs on every nav. Breadcrumbs are computed by calling `source.getPage()` once per path segment. For a 4-segment URL that's 4 extra calls on every nav. This is cheap but unnecessary.

### 4. Version lag

| Package | Current | Latest | Gap |
|---|---|---|---|
| fumadocs-ui | 16.2.1 | 16.7.11 | 5 minor |
| fumadocs-core | 16.2.1 | 16.7.11 | 5 minor |
| fumadocs-mdx | 14.0.4 | 14.2.11 | 2 minor |
| @tanstack/react-start | 1.134.12 | 1.167.16 | 33 minor |
| @tanstack/react-router | 1.134.12 | 1.168.10 | 34 minor |

TanStack Start is pre-1.0 and moves fast. 33 minor versions is a lot of hydration, routing, and loader fixes to be missing.

### 5. MDX brittleness

`source.config.ts` uses stock `defineConfig()` with no remark/rehype customization. The recent fix for numeric operators (`60282cd`) was to wrap them in backticks in prose. That's a workaround, not a fix. A proper remark plugin config would tolerate this.

No CI check catches MDX parse failures before deploy. That's why the fix landed as a hotfix after prod broke.

### 6. Prerender disabled

`vite.config.ts:20-22` has `tanstackStart({ prerender: { enabled: false } })`. Docs are static content — enabling prerender would ship pre-rendered HTML per route, making initial nav feel instant and improving SEO.

## Goals

1. Docs feel fast. Navigation between pages should feel instant on hover-preload and under 150ms otherwise.
2. Stop breaking. Version bumps stay safe; MDX parse failures are caught in CI; brittle patterns removed.
3. Look distinctly like data-peek. Brand tokens applied in phase 1, a distinctive custom treatment in phase 2.

## Non-goals

- Changing docs frameworks (Mintlify, Nextra, Starlight). Rejected — content already in Fumadocs, stack is supported, pain is fixable.
- Merging docs into `apps/web`. Rejected — bigger migration than warranted by the current pain.
- Rewriting content. Content itself is fine; this is a runtime and design polish pass.

## Plan

### Phase 0 — Triage (the 500ms fix)

Pure stability + perf, no version bumps, smallest possible diff. Ships first so the pain stops.

1. **Remove the Framer Motion wrapper** from `src/routes/docs/$.tsx`. Replace with a plain fragment. If we want any motion at all, a 120ms opacity fade using `view-transition-name` or plain CSS is fine — no JS animation library on the critical path. Acceptance: navigating `/docs/installation` → `/docs/configuration/settings` shows content immediately, no fade-in delay.
2. **Stop returning the page tree from the per-page loader.** Move tree loading to a parent route (`/docs` layout route) so it loads once per session, not per navigation. The child route loader only returns page-specific data (`path`, `title`, `description`, `breadcrumbs`). Acceptance: the `/docs/$` loader payload no longer contains `tree`.
3. **Drop `transformPageTree`'s per-nav work.** With the tree moved to the parent route, memoization on the tree reference will actually hit. Acceptance: React DevTools Profiler shows `transformPageTree` running once per session, not per nav.
4. **Smoke test the page the user flagged:** `/docs/configuration/settings`. Navigate to it from the sidebar and confirm the transition feels instant.

Estimated effort: 1-2 hours. Zero framework changes. Lowest risk change in the plan.

### Phase 1 — Version upgrades

Safe, measured bumps. Each bump is its own commit so we can bisect if something breaks.

1. **Fumadocs** 16.2.1 → 16.7.11 (all three packages: ui, core, mdx). Minor version within same major, should be a drop-in. Read the Fumadocs 16 changelog for any opt-ins we want.
2. **fumadocs-mdx** 14.0.4 → 14.2.11. Same — minor bump.
3. **@tanstack/react-start + react-router + react-router-devtools** 1.134.x → 1.168.x. This is the biggest jump and the highest risk. Read the Tanstack Start changelog (or git log) between these versions and flag any breaking changes before bumping. If TanStack Start has hit 1.170+ by the time we run this, use that.
4. **Run `pnpm typecheck`, `pnpm build`, and `pnpm dev`** after each bump. Smoke: homepage loads, sidebar works, `/docs/configuration/settings` loads, dark mode toggles.

Estimated effort: 2-3 hours including changelog reading.

Rollback: keep the old lockfile until the bump is verified in preview. If anything breaks, `git revert` the bump commit.

### Phase 2 — MDX brittleness fix

1. **Customize remark/rehype config in `source.config.ts`** so numeric operators, angle brackets, and other common prose patterns don't break MDX parsing. Specifically, review what tripped us on `60282cd` and add a `remarkGfm`-style plugin config that tolerates it. Unwrap the backtick workarounds added in that commit — the plugin should handle it.
2. **Add a CI check** that runs `pnpm --filter docs types:check` (which invokes `fumadocs-mdx` + `tsc`) on every PR. Any MDX parse failure fails the build. This is a tiny GitHub Actions step — model it on however the rest of the repo checks types today.
3. **Fail loud on broken links.** Add a build-time check that internal `/docs/...` links point to real pages. If Fumadocs 16.7 has this built in, use it; otherwise a small script.

Estimated effort: 2 hours.

### Phase 3 — Prerender & final perf pass

1. **Turn on prerender** in `vite.config.ts`. Set `prerender: { enabled: true }` and either (a) let it crawl from the root, or (b) supply explicit routes from `source.getPages()`. Verify the build output contains static HTML for each doc route.
2. **Measure before/after.** On the built site (not dev server): Lighthouse LCP, total blocking time, and manual feel of navigating through 5-6 sidebar entries. Record numbers in this spec or a sibling note so we can see the improvement.
3. **Strip unused deps.** If Framer Motion was only used by the docs route wrapper, remove it from `apps/docs/package.json`. Same for any other deps no longer used after phase 0.

Estimated effort: 1-2 hours.

### Phase 4 — Design polish, tier 1 (Fumadocs-but-unmistakably-data-peek)

Goal: someone looking at the docs can't tell it's built on a Fumadocs theme. Low risk, tokens-only changes.

1. **Brand tokens.** Set Fumadocs theme tokens to the OKLCH blue (hue 250°, `#6b8cf5` bright / `#3b52c4` deep) defined in CLAUDE.md. This touches the theme CSS file (likely `src/styles/app.css`). Dark mode is the primary target.
2. **Typography.** Confirm the system font stack matches the marketing site. Tighten heading sizes and line-height. Make code blocks use a proper monospace (JetBrains Mono / Geist Mono / SF Mono) and match the desktop app's editor feel.
3. **Density.** Fumadocs defaults are a little airy for a technical docs site. Tighten sidebar item padding, main column max-width, and vertical rhythm to feel closer to Linear/Raycast.
4. **Calm motion.** No fade-ins. Hover states use 80-120ms transitions. Nothing longer.

Estimated effort: half a day.

Handoff: this phase should use the `frontend-design` skill's brand-guidelines patterns. The tier-1 brand application can be done in one pass, and should render the same blue as the marketing site and desktop app.

### Phase 5 — Design polish, tier 2 (distinctive) — **follow-up, not blocking**

This phase is in scope but ships after phases 0-4 are stable. It's called out here so we have a north star, not so we block on it.

1. **Custom `/docs` landing page.** Right now `/docs` is probably a default index. Replace with a purpose-built landing: hero with the mission line from CLAUDE.md, quick-start grid, "I want to…" task cards that jump to common docs, recent changelog entries.
2. **Sidebar treatment.** Replace Fumadocs' default sidebar with a custom one that groups by workflow (Getting started / Connecting / Querying / Schema / Exporting) with subtle icons. Active state uses the brand blue.
3. **Code blocks.** Custom syntax theme matching the desktop app's editor. Copy button as an unobtrusive hover affordance. Line highlighting for `{4-6}` syntax.
4. **Search.** Command-palette-style search (`⌘K`) over docs content. Fumadocs ships a search primitive — style it to feel like Raycast.
5. **Page-level extras.** "Last updated" timestamp, "Edit on GitHub" link, and a next/prev footer.

Estimated effort: 1 day.

## Rollout sequence

Phases ship in order. Each phase is its own commit (or small series) on the current branch `feat/make-docs-better`, pushed after local smoke-test. Phase 0 and phase 2 should probably ship as the first PR since they're the ones unblocking the user's immediate pain. Phases 1, 3, 4 can ship together as a "docs perf + polish" PR. Phase 5 is a follow-up PR.

## Validation checklist

Before closing this out:

- [ ] `/docs/configuration/settings` loads from sidebar without visible delay.
- [ ] Navigating between 5 sidebar pages in a row feels instant (no 500ms fade).
- [ ] `pnpm --filter docs build` succeeds on all version bumps.
- [ ] `pnpm --filter docs types:check` runs in CI and catches a deliberately broken MDX file.
- [ ] Dark mode renders the OKLCH brand blue on links, active sidebar items, and code block accents.
- [ ] No hydration warnings in the browser console on cold load or after navigation.
- [ ] Lighthouse LCP on `/docs` is under 1.5s on the built site.
- [ ] Framer Motion is removed from `apps/docs/package.json` if unused elsewhere in docs.

## Risks

- **TanStack Start bump is the highest-risk change** — 34 minor versions includes plenty of room for breaking changes. Mitigation: bump it in its own commit, read the changelog before, be willing to revert and do a smaller bump (e.g., to 1.150) if 1.168 breaks.
- **Prerender may surface runtime assumptions** — if any doc route depends on request-time data, prerender will fail for it. Mitigation: start with prerender on a single route, expand.
- **Remark plugin changes could reflow existing MDX** — a lenient parser might interpret something differently. Mitigation: diff the built HTML of all doc pages before/after to catch unintended changes.
- **Prerender deferred:** Attempted in Phase 3 but blocked by an upstream
  compatibility issue between `@tanstack/start-plugin-core` and
  `nitro@3.0.1-alpha.1`. The runtime works; only the prerender crawl fails
  because of a race in the preview-server handoff. See
  `plans/2026-04-10-docs-perf-baseline.md` for the full note and options for
  revisiting.

## Open questions (none blocking)

- Do we want a `/blog` on the docs site eventually? (Currently out of scope.)
- Should search index also cover changelog entries? (Phase 5 decision.)
