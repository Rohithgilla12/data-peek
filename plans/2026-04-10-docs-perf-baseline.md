# Docs perf baseline — 2026-04-10

Measured against the production build (`pnpm --filter docs build` +
`PORT=3001 pnpm --filter docs start`) on localhost. This is the post-Phase-2
baseline captured at the end of the docs revamp.

Target page: `/docs/configuration/settings`
Tool: Lighthouse headless (npx lighthouse, performance category only)

## Measurements

- LCP (largest-contentful-paint): 7.8 s
- TBT (total-blocking-time): 0 ms
- CLS (cumulative-layout-shift): 0
- FCP (first-contentful-paint): 6.5 s
- Speed Index: 6.5 s
- Lighthouse perf score (0-100): 60
- Cold curl response time: 0.265 s (first hit), then 0.014–0.021 s warm
- Response bytes: 60,625

The gap between the ~20 ms warm curl hit and the 7.8 s LCP reported by
Lighthouse is driven almost entirely by client-side hydration / font loading
against Lighthouse's simulated-throttling profile — the server itself responds
effectively instantly. TBT of 0 ms confirms the main thread is not the
bottleneck; this is render/paint timing on a throttled mobile profile.

## State of the site at measurement time

- Phase 0 landed: no Framer Motion fade, no CSS `main` fade-in, sidebar tree loaded once per session via `/docs` parent layout route.
- Phase 1 landed: Fumadocs 16.7.x, fumadocs-mdx 14.2.x, TanStack Router/Start 1.167–1.168.x.
- Phase 2 landed: remark-gfm + remark-smartypants in the MDX config, `.github/workflows/docs-types.yml` gating every PR.
- Intent preloading: on (`defaultPreload: 'intent'` in `router.tsx`).
- Prerender: **DISABLED**. See deferral note below.

## Prerender deferred

Attempted in this phase and blocked by an upstream compatibility issue between
`@tanstack/start-plugin-core` and `nitro@3.0.1-alpha.1` during the prerender
preview-server handoff. The crawl fires `fetch()` at a proxy middleware before
nitro's child server has bound to its port, causing every route to ECONNREFUSED.
The runtime code is fine — `node .output/server/index.mjs` serves routes
correctly under manual use — but the prerender crawler can't reach them.

Options for picking this up later:
1. Wait for upstream fixes (likely the path of least resistance: nitro is still
   on an alpha release).
2. Write a small custom prerender step that boots the real server post-build and
   curls each route into `.output/public/<route>/index.html`.
3. Switch off the nitro preset in favor of the default tanstack-start preview
   server.

None of these are urgent: the docs site renders content server-side on every
request today, and the main user-facing complaint (slow navigation) was fixed
by Phase 0.

## Pre-revamp comparison

Not measured pre-revamp, so we don't have direct before/after numbers.
Subjective baseline: before Phase 0, navigating between doc pages had ~500ms of
Framer Motion fade-in plus 400ms of CSS fade-in plus per-nav tree
re-serialization. Those are all gone as of commit `61bcdf2`.
