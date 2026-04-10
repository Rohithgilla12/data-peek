# Docs Site Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `apps/docs` feel fast, stop breaking on MDX edits, and tighten the visual polish without changing frameworks.

**Architecture:** Keep the existing Fumadocs 16 + TanStack Start + Vite stack. Fix the slow-nav root causes (500ms Framer Motion fade wrapper + sidebar tree re-sent on every nav), catch the version lag up to latest, harden MDX parsing with CI, enable prerender, and tighten typography.

**Tech Stack:** Fumadocs 16 (ui/core/mdx), TanStack Start + Router, Vite 7, Tailwind 4, MDX.

**Source spec:** `plans/2026-04-10-docs-site-revamp-design.md`

**Note on testing:** `apps/docs` has no test runner or tests directory. Each task uses `pnpm typecheck`, `pnpm build`, and a manual dev-server smoke as its verification step. When a task makes a user-visible change, the smoke step names the specific page to check so verification isn't hand-wavy.

---

## File Structure

Files this plan touches:

- **Create:** `apps/docs/src/routes/docs.tsx` — new parent layout route that owns the sidebar tree (loaded once per session).
- **Modify:** `apps/docs/src/routes/docs/$.tsx` — strip Framer Motion wrapper, drop tree from loader, simplify.
- **Modify:** `apps/docs/source.config.ts` — add remark plugins so prose with numeric operators / angle brackets parses cleanly.
- **Modify:** `apps/docs/vite.config.ts` — enable prerender.
- **Modify:** `apps/docs/src/styles/app.css` — remove the `main { animation: fade-in-up }` rule; tighten h1/h2 sizes and main column density.
- **Modify:** `apps/docs/package.json` — version bumps.
- **Modify:** `pnpm-lock.yaml` — via install.
- **Create:** `.github/workflows/docs-types.yml` — CI job running `pnpm --filter docs types:check`.

Pre-existing files you should **read but probably not modify**: `apps/docs/src/routes/__root.tsx`, `apps/docs/src/lib/source.ts`, `apps/docs/src/lib/layout.shared.tsx`, `apps/docs/src/routes/index.tsx` (landing — leave alone, it has its own motion treatment).

---

## Phase 0 — Triage (the 500ms fix)

Goal: navigation between doc pages feels instant, without any version bumps or framework changes.

### Task 1: Create parent layout route that owns the sidebar tree

**Files:**
- Create: `apps/docs/src/routes/docs.tsx`

**Why:** Today the `docs/$.tsx` loader returns `tree: source.pageTree` on every navigation. That causes the whole sidebar tree to be re-serialized and re-walked on every page change (the `transformPageTree` `useMemo` in `$.tsx:131` never hits because `data.tree` is a new reference on every loader result). Moving tree loading into a parent layout route means the tree is loaded once when `/docs/*` is entered, then reused for all child navigation.

- [ ] **Step 1:** Create `apps/docs/src/routes/docs.tsx` with this exact content:

```tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import type * as PageTree from 'fumadocs-core/page-tree'
import { useMemo } from 'react'
import { source } from '@/lib/source'
import { baseOptions } from '@/lib/layout.shared'

const loadTree = createServerFn({ method: 'GET' }).handler(async () => {
  return {
    tree: source.pageTree as object,
  }
})

export const Route = createFileRoute('/docs')({
  component: DocsRouteLayout,
  loader: async () => loadTree(),
  staleTime: Infinity,
  gcTime: Infinity,
})

function DocsRouteLayout() {
  const { tree } = Route.useLoaderData()
  const transformedTree = useMemo(
    () => transformPageTree(tree as PageTree.Root),
    [tree],
  )

  return (
    <DocsLayout {...baseOptions()} tree={transformedTree}>
      <Outlet />
    </DocsLayout>
  )
}

function transformPageTree(root: PageTree.Root): PageTree.Root {
  function mapNode<T extends PageTree.Node>(item: T): T {
    if (typeof item.icon === 'string') {
      item = {
        ...item,
        icon: (
          <span
            dangerouslySetInnerHTML={{
              __html: item.icon,
            }}
          />
        ),
      }
    }

    if (item.type === 'folder') {
      return {
        ...item,
        index: item.index ? mapNode(item.index) : undefined,
        children: item.children.map(mapNode),
      }
    }

    return item
  }

  return {
    ...root,
    children: root.children.map(mapNode),
    fallback: root.fallback ? transformPageTree(root.fallback) : undefined,
  }
}
```

- [ ] **Step 2:** Regenerate the route tree by running the dev server once (TanStack Start auto-regenerates `routeTree.gen.ts` on file change).

Run: `cd apps/docs && pnpm dev`
Expected: dev server starts without type errors, `src/routeTree.gen.ts` is updated in place.
Stop the server after `routeTree.gen.ts` is regenerated.

- [ ] **Step 3:** Run typecheck to confirm the new route is wired correctly.

Run: `cd apps/docs && pnpm typecheck`
Expected: exits 0 with no errors.

### Task 2: Strip the Framer Motion wrapper and tree work from the child route

**Files:**
- Modify: `apps/docs/src/routes/docs/$.tsx`

**Why:** The `motion.div` with `duration: 0.5` is the biggest cause of the "slow nav" feel — half a second of fade on every page. The tree transform and `DocsLayout` wrapping now live in the parent `docs.tsx`, so this file collapses to just rendering the page content.

- [ ] **Step 1:** Replace the entire content of `apps/docs/src/routes/docs/$.tsx` with:

```tsx
import { createFileRoute, notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { source } from '@/lib/source'
import browserCollections from 'fumadocs-mdx:collections/browser'
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import {
  generateMetaTags,
  DOCS_CONFIG,
  getTechArticleStructuredData,
  getBreadcrumbStructuredData,
} from '@/lib/seo'

const loader = createServerFn({ method: 'GET' })
  .inputValidator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs)
    if (!page) throw notFound()

    const pageData = (page as any).data || {}
    const frontmatter = pageData.frontmatter || {
      title: 'Documentation',
      description: DOCS_CONFIG.description,
    }

    const breadcrumbs = [
      { name: 'Home', url: DOCS_CONFIG.url },
      { name: 'Documentation', url: `${DOCS_CONFIG.url}/docs` },
    ]

    const pathParts = page.path.split('/').filter(Boolean)
    let currentPath = ''
    pathParts.forEach((part, index) => {
      currentPath += `/${part}`
      const pageAtPath = source.getPage(pathParts.slice(0, index + 1))
      if (pageAtPath) {
        const pageFrontmatter = (pageAtPath as any).data?.frontmatter
        breadcrumbs.push({
          name: pageFrontmatter?.title || part,
          url: `${DOCS_CONFIG.url}/docs${currentPath}`,
        })
      }
    })

    return {
      path: page.path,
      title: frontmatter.title || 'Documentation',
      description: frontmatter.description || DOCS_CONFIG.description,
      breadcrumbs,
    }
  })

export const Route = createFileRoute('/docs/$')({
  component: Page,
  loader: async ({ params }) => {
    const slugs = params._splat?.split('/') ?? []
    const data = await loader({ data: slugs })
    await clientLoader.preload(data.path)
    return data
  },
  head: ({ loaderData }) => {
    if (!loaderData?.path) return {}

    const pagePath = `/docs/${loaderData.path}`
    const url = `${DOCS_CONFIG.url}${pagePath}`
    const title = loaderData.title
    const description = loaderData.description

    const meta = generateMetaTags({
      title,
      description,
      path: pagePath,
      keywords: [
        'data-peek',
        'documentation',
        'SQL client',
        'PostgreSQL',
        'MySQL',
        'database',
        ...title.toLowerCase().split(' '),
      ],
      type: 'article',
    })

    return { meta }
  },
})

const clientLoader = browserCollections.docs.createClientLoader({
  component({ toc, frontmatter, default: MDX }) {
    return (
      <DocsPage toc={toc}>
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <DocsBody>
          <MDX components={{ ...defaultMdxComponents }} />
        </DocsBody>
      </DocsPage>
    )
  },
})

function Page() {
  const data = Route.useLoaderData()
  const Content = clientLoader.getComponent(data.path)

  const url = `${DOCS_CONFIG.url}/docs${data.path}`
  const structuredData = [
    getTechArticleStructuredData({
      title: data.title,
      description: data.description,
      url,
    }),
    getBreadcrumbStructuredData(data.breadcrumbs),
  ]

  return (
    <>
      {structuredData.map((sd, i) => (
        <script
          key={i}
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(sd) }}
        />
      ))}
      <Content />
    </>
  )
}
```

Note what changed: Framer Motion import gone, `motion.div` wrapper gone, `DocsLayout` wrapping gone (moved to parent), `tree` removed from the loader return, `transformPageTree` and its helper gone (moved to parent), no more `useMemo` in the child.

- [ ] **Step 2:** Run typecheck.

Run: `cd apps/docs && pnpm typecheck`
Expected: exits 0 with no errors.

### Task 3: Remove the CSS fade-in animation from `main`

**Files:**
- Modify: `apps/docs/src/styles/app.css:629-632`

**Why:** Even after Framer Motion is gone, there's still `main { animation: fade-in-up 0.4s }` on line 630. That's another 400ms fade every time a route changes the `<main>` element. Kill it for the same reason we killed the JS one.

- [ ] **Step 1:** Open `apps/docs/src/styles/app.css` and delete lines 629-632 (the "Page content animation" comment and rule). Specifically, remove:

```css
/* Page content animation */
main {
  animation: fade-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
```

Leave the `@keyframes fade-in-up` definition in place — it may be used by other elements. If a search for `fade-in-up` shows no other uses, also remove the keyframes block. Run this search first:

Run: `cd apps/docs && grep -rn "fade-in-up" src/`
If the only remaining match is the `@keyframes fade-in-up` definition, also remove the keyframes block at lines 609-618.

- [ ] **Step 2:** Start the dev server and smoke-test navigation.

Run: `cd apps/docs && pnpm dev`
Open http://localhost:3000/docs/configuration/settings in a browser.
Click 3-4 different sidebar items in quick succession.
Expected: content swaps instantly with no visible fade. No 500ms wait. No 400ms wait.
Also verify: sidebar does not flicker or re-render (it stays stable as the Outlet swaps).
Stop the dev server.

### Task 4: Commit phase 0

- [ ] **Step 1:** Stage and commit.

```bash
cd /Users/rohithgilla/github.com/Rohithgilla12/data-peek
git add apps/docs/src/routes/docs.tsx \
        apps/docs/src/routes/docs/\$.tsx \
        apps/docs/src/routes/routeTree.gen.ts \
        apps/docs/src/styles/app.css
git commit -m "perf(docs): remove page fade-in and move tree to parent route

Framer Motion wrapper added a 500ms fade on every nav and the
sidebar tree was re-sent and re-transformed per navigation. Move
the tree to a new /docs parent layout route with staleTime:Infinity
and drop the motion wrapper + CSS fade-in on main.

Navigating /docs/* now feels instant."
```

---

## Phase 1 — Version upgrades

Goal: catch up to latest Fumadocs and TanStack Start. Each bump is its own commit so regressions can be bisected.

### Task 5: Bump Fumadocs packages

**Files:**
- Modify: `apps/docs/package.json` (dependencies)
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1:** Update `apps/docs/package.json` dependencies:

Change these three lines:
```json
"fumadocs-core": "16.2.1",
"fumadocs-mdx": "14.0.4",
"fumadocs-ui": "16.2.1",
```
to:
```json
"fumadocs-core": "^16.7.11",
"fumadocs-mdx": "^14.2.11",
"fumadocs-ui": "^16.7.11",
```

(If newer versions are available when you run this, use the latest minor within the same major: `16.x` for ui/core, `14.x` for mdx.)

- [ ] **Step 2:** Install.

Run: `cd /Users/rohithgilla/github.com/Rohithgilla12/data-peek && pnpm install`
Expected: lockfile updates, no resolution errors.

- [ ] **Step 3:** Typecheck and build.

Run: `cd apps/docs && pnpm typecheck`
Expected: exits 0.
Run: `cd apps/docs && pnpm build`
Expected: build succeeds, produces `.output/` directory.

- [ ] **Step 4:** Smoke test the built output.

Run: `cd apps/docs && pnpm start`
Open http://localhost:3000/docs/configuration/settings
Expected: page loads, navigation works, no console errors.
Stop the server.

- [ ] **Step 5:** Commit.

```bash
git add apps/docs/package.json pnpm-lock.yaml
git commit -m "chore(docs): bump fumadocs packages to 16.7

fumadocs-ui/core 16.2.1 -> 16.7.x and fumadocs-mdx 14.0.4 -> 14.2.x.
Minor version bumps within the same major line."
```

### Task 6: Bump TanStack Start + Router

**Files:**
- Modify: `apps/docs/package.json`
- Modify: `pnpm-lock.yaml`

**Risk note:** this is the biggest jump (34 minor versions). Do it in a dedicated commit. If it breaks, `git revert` and try a smaller target (e.g., `1.155.0`) until you find a working step.

- [ ] **Step 1:** Review the TanStack Start changelog between 1.134 and latest before bumping.

Run: `gh api repos/TanStack/router/releases --jq '.[] | select(.tag_name | startswith("v1.1")) | .tag_name' 2>/dev/null | head -40`
Or open https://github.com/TanStack/router/releases in a browser and scan releases from 1.135 through current.
Look for: breaking changes, anything about `createServerFn`, `createFileRoute`, `createRouter`, `loader` behavior, or hydration. Note anything suspicious for step 5.

- [ ] **Step 2:** Update `apps/docs/package.json`:

Change:
```json
"@tanstack/react-router": "^1.134.12",
"@tanstack/react-router-devtools": "^1.134.12",
"@tanstack/react-start": "^1.134.12",
```
to:
```json
"@tanstack/react-router": "^1.168.10",
"@tanstack/react-router-devtools": "^1.168.10",
"@tanstack/react-start": "^1.167.16",
```

(Use the latest versions `npm view @tanstack/react-router version` and `npm view @tanstack/react-start version` return at the time you run this.)

- [ ] **Step 3:** Install.

Run: `cd /Users/rohithgilla/github.com/Rohithgilla12/data-peek && pnpm install`
Expected: lockfile updates, no resolution errors.

- [ ] **Step 4:** Typecheck.

Run: `cd apps/docs && pnpm typecheck`
Expected: exits 0.
If there are type errors: resolve them using the changelog notes from step 1. Common sources: renamed options on `createRouter`, signature changes on `createFileRoute`, new required options on `createServerFn`. Fix in place, do not work around with `any`.

- [ ] **Step 5:** Build.

Run: `cd apps/docs && pnpm build`
Expected: build succeeds.

- [ ] **Step 6:** Smoke test.

Run: `cd apps/docs && pnpm start`
Open:
- http://localhost:3000/ (landing — has its own Framer Motion treatment, should still work)
- http://localhost:3000/docs (index)
- http://localhost:3000/docs/configuration/settings
- Click 5 different sidebar entries in a row.

Expected: all pages load, no hydration warnings in the browser console, dark mode toggles, sidebar preserves state across navigation.
Stop the server.

- [ ] **Step 7:** Commit.

```bash
git add apps/docs/package.json pnpm-lock.yaml
git commit -m "chore(docs): bump tanstack router/start to 1.168

Catches 34 minor versions of hydration and loader fixes. Each minor
within the same major line."
```

---

## Phase 2 — MDX brittleness + CI

Goal: numeric operators in prose no longer break MDX, and if anything else breaks MDX parsing, CI catches it before prod.

### Task 7: Add a lenient MDX remark config

**Files:**
- Modify: `apps/docs/source.config.ts`

**Why:** The numeric-operators bug (commit `60282cd`) was fixed by wrapping operators in backticks in prose. That's a workaround. A proper `remark-smartypants` + `remark-gfm` setup with explicit unified config handles these cases without author discipline.

- [ ] **Step 1:** Install needed plugins.

Run: `cd apps/docs && pnpm add -D remark-gfm remark-smartypants`
Expected: packages install, `apps/docs/package.json` devDependencies updates.

- [ ] **Step 2:** Replace `apps/docs/source.config.ts` content with:

```ts
import { defineConfig, defineDocs } from 'fumadocs-mdx/config'
import remarkGfm from 'remark-gfm'
import remarkSmartypants from 'remark-smartypants'

export const docs = defineDocs({
  dir: 'content/docs',
})

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkGfm, remarkSmartypants],
  },
})
```

- [ ] **Step 3:** Verify Fumadocs still parses all existing MDX.

Run: `cd apps/docs && pnpm types:check`
Expected: exits 0 (this command runs `fumadocs-mdx` which parses every MDX file, then `tsc --noEmit`).

- [ ] **Step 4:** Verify the hardening works on the file that originally broke.

Find the file touched in commit `60282cd` (the numeric-operators fix) and temporarily unwrap one of the backtick workarounds to prove the remark plugins now handle the raw form.

Run: `git show 60282cd --stat`
Pick one of the files listed. Open it, find a line where `` `2 > 1` `` or similar was wrapped, remove the backticks from one instance so it reads as prose.

Run: `cd apps/docs && pnpm types:check`
Expected: exits 0. No MDX parse error.

Restore the file: `git checkout -- <that-file>`

Run: `cd apps/docs && pnpm types:check` again
Expected: still exits 0. We're back to the committed state.

- [ ] **Step 5:** Commit.

```bash
git add apps/docs/source.config.ts \
        apps/docs/package.json \
        pnpm-lock.yaml
git commit -m "fix(docs): add remark-gfm + smartypants for resilient MDX parsing

Numeric operators, angle brackets, and comparisons in prose no longer
break the MDX parser. The backtick workarounds added in 60282cd are
no longer strictly needed, though we leave them in place."
```

### Task 8: Add CI workflow that runs `docs types:check`

**Files:**
- Create: `.github/workflows/docs-types.yml`

**Why:** The recent numeric-operators break reached prod because no CI gate ran `pnpm types:check` on the docs workspace. Add one that runs on every PR that touches `apps/docs/**`.

- [ ] **Step 1:** First, check the existing workflows to match the repo's conventions on Node version, package manager setup, and caching.

Run: `cat /Users/rohithgilla/github.com/Rohithgilla12/data-peek/.github/workflows/build.yml`
Note the Node version, pnpm version, and setup-node action version used.

- [ ] **Step 2:** Create `.github/workflows/docs-types.yml` using the same Node/pnpm versions you saw in step 1. Use this template, substituting `NODE_VERSION` and `PNPM_VERSION` to match the repo convention:

```yaml
name: docs types check

on:
  pull_request:
    paths:
      - 'apps/docs/**'
      - 'packages/**'
      - 'pnpm-lock.yaml'
      - '.github/workflows/docs-types.yml'
  push:
    branches:
      - main

jobs:
  types-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: PNPM_VERSION

      - uses: actions/setup-node@v4
        with:
          node-version: NODE_VERSION
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Run docs types:check
        run: pnpm --filter docs types:check
```

- [ ] **Step 3:** Validate the workflow file locally.

Run: `cd /Users/rohithgilla/github.com/Rohithgilla12/data-peek && cat .github/workflows/docs-types.yml`
Expected: file exists, shell interpretation of YAML works (no tabs, consistent indentation).

If `act` is installed, run: `act pull_request -W .github/workflows/docs-types.yml --dryrun`
If not, skip — GitHub will validate on push.

- [ ] **Step 4:** Commit.

```bash
git add .github/workflows/docs-types.yml
git commit -m "ci(docs): run types:check on every PR touching apps/docs

Catches MDX parse failures at the PR stage so broken prose syntax
never reaches prod."
```

---

## Phase 3 — Prerender + measurement

Goal: docs ship as static HTML, initial page load is instant, measured improvement vs phase 0 baseline.

### Task 9: Enable prerender in Vite config

**Files:**
- Modify: `apps/docs/vite.config.ts`

- [ ] **Step 1:** In `apps/docs/vite.config.ts`, change:

```ts
tanstackStart({
  prerender: {
    enabled: false,
  },
}),
```
to:
```ts
tanstackStart({
  prerender: {
    enabled: true,
    crawlLinks: true,
  },
}),
```

- [ ] **Step 2:** Build and inspect the output for static HTML.

Run: `cd apps/docs && pnpm build`
Expected: build completes, logs mention prerendering N routes.

Run: `ls apps/docs/.output/public 2>/dev/null || ls apps/docs/dist 2>/dev/null || find apps/docs -type d -name '.output' -o -name 'dist' | head`
Expected: find the built output dir, confirm it contains HTML files for doc routes (e.g. `docs/configuration/settings/index.html` or similar).

If prerender fails for specific routes: capture the errors, fall back to explicit routes using `source.getPages()` in the config. Specifically, replace `crawlLinks: true` with:

```ts
prerender: {
  enabled: true,
  routes: async () => {
    const { source } = await import('./src/lib/source')
    return ['/', '/docs', ...source.getPages().map((p) => `/docs${p.url}`)]
  },
},
```

Only switch to the explicit form if `crawlLinks: true` fails.

- [ ] **Step 3:** Smoke-test the built output.

Run: `cd apps/docs && pnpm start`
Open DevTools → Network tab → Disable cache → Reload http://localhost:3000/docs/configuration/settings
Expected: the initial HTML response contains the rendered docs content (not just a React shell). "View source" in the browser should show the page title and body text.

- [ ] **Step 4:** Commit.

```bash
git add apps/docs/vite.config.ts
git commit -m "perf(docs): enable prerender for static HTML output

Ships docs as pre-rendered HTML so initial loads and search engine
crawling see full content instead of a client-side shell."
```

### Task 10: Capture before/after perf numbers

**Files:**
- Create: `plans/2026-04-10-docs-perf-baseline.md`

**Why:** We asserted the docs felt slow. Record actual numbers so we know what "fast enough" looks like and can regress-check later.

- [ ] **Step 1:** Run Lighthouse against the production build.

Run: `cd apps/docs && pnpm build && pnpm start &`
Wait 2 seconds.
Run: `npx --yes lighthouse http://localhost:3000/docs/configuration/settings --only-categories=performance --output=json --output-path=/tmp/docs-lighthouse.json --chrome-flags="--headless"`
Expected: lighthouse writes a report.

Extract the key numbers:
```bash
node -e "const r=require('/tmp/docs-lighthouse.json'); const a=r.audits; console.log('LCP:', a['largest-contentful-paint'].displayValue); console.log('TBT:', a['total-blocking-time'].displayValue); console.log('CLS:', a['cumulative-layout-shift'].displayValue); console.log('Perf score:', r.categories.performance.score);"
```

Kill the background server: `kill %1` (or find the PID and kill it).

- [ ] **Step 2:** Record the numbers in `plans/2026-04-10-docs-perf-baseline.md`:

```markdown
# Docs perf baseline — 2026-04-10

Measured against `pnpm start` serving the production build on localhost.
Target page: `/docs/configuration/settings`
Tool: Lighthouse (performance category only, headless Chrome).

## After revamp (current)

- LCP: <paste value>
- TBT: <paste value>
- CLS: <paste value>
- Perf score: <paste value>

## Subjective

- Sidebar click → content visible: <estimate in ms, human-perceived>
- Hover-preload (intent) working: yes/no
- Hydration warnings in console: yes/no
```

Fill in the values from step 1.

- [ ] **Step 3:** Commit.

```bash
git add plans/2026-04-10-docs-perf-baseline.md
git commit -m "docs(plan): capture post-revamp docs perf baseline"
```

---

## Phase 4 — Typography and density polish

Goal: the docs site looks unmistakably like data-peek and reads dense-but-scannable. Brand tokens (OKLCH blue) are already set in `app.css` — this phase tightens the rest.

### Task 11: Tighten typography scale and main column width

**Files:**
- Modify: `apps/docs/src/styles/app.css`

**Context:** Current heading sizes (h1 `2.25rem`, h2 `1.5rem`) and default Fumadocs main column are on the roomy side for a technical docs audience. The CLAUDE.md design principles call for "dense but scannable" and "Linear/Raycast" energy.

- [ ] **Step 1:** In `apps/docs/src/styles/app.css`, update the typography section (around lines 234-258):

Replace:
```css
h1 {
  font-size: 2.25rem;
  line-height: 1.2;
}

h2 {
  font-size: 1.5rem;
  line-height: 1.3;
  margin-top: 2.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--dp-border-subtle);
}

h3 {
  font-size: 1.25rem;
  line-height: 1.4;
  margin-top: 2rem;
}
```

With:
```css
h1 {
  font-size: 1.875rem;
  line-height: 1.15;
  letter-spacing: -0.025em;
}

h2 {
  font-size: 1.25rem;
  line-height: 1.25;
  margin-top: 2rem;
  padding-bottom: 0.375rem;
  border-bottom: 1px solid var(--dp-border-subtle);
}

h3 {
  font-size: 1.0625rem;
  line-height: 1.35;
  margin-top: 1.5rem;
}
```

- [ ] **Step 2:** Also in `apps/docs/src/styles/app.css`, tighten body line-height and paragraph rhythm. Change the `body` rule (around line 195):

From:
```css
body {
  font-family: var(--dp-font-mono);
  background: var(--dp-background);
  color: var(--dp-text-primary);
  line-height: 1.7;
  ...
}
```

Change `line-height: 1.7` to `line-height: 1.6`. Leave everything else in the body rule alone.

- [ ] **Step 3:** Start the dev server and visually check.

Run: `cd apps/docs && pnpm dev`
Open http://localhost:3000/docs/configuration/settings
Expected: headings are visibly smaller and tighter, body prose has slightly tighter rhythm, overall page reads denser but still comfortable. No text overlaps.
Also check: http://localhost:3000/docs (if it exists) and http://localhost:3000/ (landing — should be unaffected since these rules target h1/h2/h3 globally — verify the landing hero still looks right).

If the landing page headings look wrong after the change, scope the new rules under `.docs-body` or similar instead of globally. Inspect the landing page element class in DevTools to find the scoping anchor.

Stop the dev server.

- [ ] **Step 4:** Commit.

```bash
git add apps/docs/src/styles/app.css
git commit -m "style(docs): tighten typography scale and body rhythm

Smaller h1/h2/h3 and tighter line-height match the 'dense but
scannable' principle in CLAUDE.md and bring the docs closer to
Linear/Raycast density without sacrificing readability."
```

---

## Phase 5 — Final validation

Goal: confirm the whole revamp actually meets the spec's acceptance criteria, not just passes individual tasks.

### Task 12: Walk the spec's validation checklist

**Files:**
- Modify: `plans/2026-04-10-docs-site-revamp-design.md` (check off items in the validation section)

- [ ] **Step 1:** Build the production site.

Run: `cd /Users/rohithgilla/github.com/Rohithgilla12/data-peek && pnpm --filter docs build`
Expected: build succeeds.

- [ ] **Step 2:** Start it.

Run: `cd apps/docs && pnpm start`

- [ ] **Step 3:** Walk the spec checklist, verifying each item:

Open http://localhost:3000/docs/configuration/settings from the sidebar of another doc page.
- [ ] Loads from sidebar without visible delay.

Click through 5 sidebar entries in a row.
- [ ] Feels instant. No 500ms fade. No 400ms fade.

In another terminal:
Run: `cd apps/docs && pnpm build`
- [ ] Build succeeded on all bumps.

Run: `cd apps/docs && pnpm types:check`
- [ ] types:check passes. (Deliberately break an MDX file with `2 > 1` *without* backticks, re-run — should now pass because of remark plugins. Restore the file.)

Toggle dark/light mode via the navbar toggle.
- [ ] Brand blue renders on links and active sidebar item. (The active sidebar item should use `var(--dp-accent)`.)

Open DevTools console, reload the page, navigate once.
- [ ] No hydration warnings on cold load or nav.

Open DevTools Network tab, disable cache, reload.
- [ ] Initial HTML contains rendered doc content (view source shows title/body text).

Check the Lighthouse baseline captured in Task 10.
- [ ] LCP under 1.5s on the built site (if not, capture the regression and decide whether to address it now or file as follow-up).

Check `apps/docs/package.json`.
- [ ] Framer Motion still listed as a dependency (yes, because `routes/index.tsx` landing page uses it). `motion.div` no longer imported in any file under `src/routes/docs/`.

Run: `cd apps/docs && grep -rn "framer-motion" src/routes/docs/`
Expected: no matches.

Stop the dev server.

- [ ] **Step 4:** Update the validation section of `plans/2026-04-10-docs-site-revamp-design.md` by checking off each completed item. If any item failed, add a note under "Risks" explaining what's outstanding.

- [ ] **Step 5:** Commit the final validation log.

```bash
git add plans/2026-04-10-docs-site-revamp-design.md
git commit -m "docs(plan): mark docs revamp validation checklist complete"
```

---

## Out of scope (follow-up PR)

The spec's Phase 5 (distinctive custom `/docs` landing, custom sidebar treatment, command-palette search, next/prev footer, "edit on GitHub" links) is **intentionally not in this plan.** It ships as a follow-up after this lands, once we have numbers showing the stability work held up. Revisit with a fresh spec when ready.

## Total estimated effort

- Phase 0: 1-2 hours
- Phase 1: 2-3 hours (gated on Tanstack changelog reading)
- Phase 2: 1-2 hours
- Phase 3: 1 hour
- Phase 4: 1 hour
- Phase 5: 30 minutes

Total: ~1 focused day of work.
