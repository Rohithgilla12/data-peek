import { createFileRoute, Link } from "@tanstack/react-router"
import { HomeLayout } from "fumadocs-ui/layouts/home"
import { baseOptions } from "@/lib/layout.shared"
import { generateMetaTags, DOCS_CONFIG } from "@/lib/seo"

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: generateMetaTags({
      title: DOCS_CONFIG.title,
      description: DOCS_CONFIG.description,
      keywords: [
        "data-peek documentation",
        "PostgreSQL client docs",
        "MySQL client docs",
        "SQL client documentation",
        "database client guide",
        "SQL editor documentation",
      ],
    }),
  }),
})

type Section = {
  number: string
  title: string
  blurb: string
  href: string
  leaves: string[]
}

const sections: Section[] = [
  {
    number: "01",
    title: "Getting started",
    blurb: "Install data-peek, connect your first database, and run a query.",
    href: "/docs/getting-started",
    leaves: ["Installation", "First connection", "Your first query", "Keyboard basics"],
  },
  {
    number: "02",
    title: "Features",
    blurb: "Command palette, AI assist, inline editing, telemetry, ER diagrams, and more.",
    href: "/docs/features",
    leaves: ["Command palette", "AI assistant", "Inline editing", "Query telemetry", "ER diagrams"],
  },
  {
    number: "03",
    title: "Database support",
    blurb: "Feature matrix and connection specifics for every supported engine.",
    href: "/docs/database-support",
    leaves: ["PostgreSQL", "MySQL", "SQL Server", "SQLite"],
  },
  {
    number: "04",
    title: "Configuration",
    blurb: "Themes, shortcuts, AI providers, SSH tunnels, and everything you can tune.",
    href: "/docs/configuration",
    leaves: ["Settings", "AI providers", "SSH tunnels", "Themes", "Shortcuts"],
  },
  {
    number: "05",
    title: "Reference",
    blurb: "Quick-lookup guides. Keyboard shortcuts, CLI flags, file formats.",
    href: "/docs/reference",
    leaves: ["Keyboard shortcuts"],
  },
]

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="relative min-h-[calc(100vh-4rem)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px] neat-grid-bg"
        />
        <div className="relative mx-auto max-w-[1040px] px-5 sm:px-8 pt-16 pb-24 sm:pt-24">
          {/* Heading block */}
          <div
            className="inline-flex items-center gap-2 h-7 px-2.5 text-[11px] text-[var(--n-fg-muted)]"
            style={{ border: "1px solid var(--n-line-soft)" }}
          >
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--n-accent)" }}
            />
            Docs · v0.21 · last updated today
          </div>

          <h1 className="mt-6 text-[36px] sm:text-[48px] leading-[1.02] tracking-[-0.02em] font-medium text-[var(--n-fg)]">
            The manual for data-peek.
            <br />
            <span className="text-[var(--n-fg-muted)]">
              Short sections. Real examples. No fluff.
            </span>
          </h1>

          <p className="mt-5 max-w-[58ch] text-[14px] leading-[1.65] text-[var(--n-fg-muted)]">
            Everything you need to install, connect, query, and configure
            data-peek across Postgres, MySQL, SQL Server, and SQLite. If a page
            is wrong or missing, the edit link goes straight to GitHub.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              to="/docs/$"
              params={{ _splat: "getting-started" }}
              className="inline-flex h-10 items-center gap-2 px-4 text-[13px] font-medium"
              style={{ background: "var(--n-accent)", color: "var(--n-accent-ink)" }}
            >
              Start with the intro
              <span aria-hidden>→</span>
            </Link>
            <a
              href="https://github.com/Rohithgilla12/data-peek"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 px-4 text-[13px] text-[var(--n-fg)]"
              style={{ border: "1px solid var(--n-line)" }}
            >
              <span aria-hidden>★</span> GitHub
            </a>
          </div>

          {/* Section index */}
          <div
            className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-3"
          >
            {sections.map((s) => (
              <Link
                key={s.number}
                to="/docs/$"
                params={{ _splat: s.href.replace(/^\/docs\//, "") }}
                className="group p-5 flex flex-col gap-3 transition-colors"
                style={{
                  border: "1px solid var(--n-line-soft)",
                  background: "var(--n-bg-sunken)",
                }}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[10.5px] uppercase tracking-[0.16em] text-[var(--n-fg-faint)] tabular-nums">
                    {s.number}
                  </span>
                  <span
                    aria-hidden
                    className="text-[13px] text-[var(--n-fg-faint)] group-hover:text-[var(--n-accent)] transition-colors"
                  >
                    →
                  </span>
                </div>
                <h2
                  className="text-[18px] leading-[1.2] tracking-[-0.01em] text-[var(--n-fg)] group-hover:text-[var(--n-accent)] transition-colors"
                  style={{ margin: 0, padding: 0, border: 0 }}
                >
                  {s.title}
                </h2>
                <p className="text-[12.5px] leading-[1.6] text-[var(--n-fg-muted)] max-w-[44ch]">
                  {s.blurb}
                </p>
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--n-fg-faint)]">
                  {s.leaves.map((leaf) => (
                    <li key={leaf}>{leaf}</li>
                  ))}
                </ul>
              </Link>
            ))}
          </div>

          {/* Help row */}
          <div
            className="mt-12 grid grid-cols-1 md:grid-cols-[1fr_auto] items-center gap-6 p-5"
            style={{ border: "1px solid var(--n-line-soft)" }}
          >
            <div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--n-fg-faint)]">
                Something off?
              </div>
              <p className="mt-2 text-[13px] leading-[1.6] text-[var(--n-fg-muted)] max-w-[72ch]">
                Docs live alongside the source. Open an issue, send a PR, or DM{" "}
                <a
                  href="https://x.com/gillarohith"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--n-fg)] underline underline-offset-4"
                  style={{ textDecorationColor: "var(--n-line)" }}
                >
                  @gillarohith
                </a>
                . Replies come from the person who wrote the code.
              </p>
            </div>
            <div className="flex gap-2 text-[11px]">
              <a
                href="https://github.com/Rohithgilla12/data-peek/issues/new"
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-3 inline-flex items-center text-[var(--n-fg-muted)] hover:text-[var(--n-fg)]"
                style={{ border: "1px solid var(--n-line-soft)" }}
              >
                Open issue
              </a>
              <a
                href="https://github.com/Rohithgilla12/data-peek"
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-3 inline-flex items-center text-[var(--n-fg-muted)] hover:text-[var(--n-fg)]"
                style={{ border: "1px solid var(--n-line-soft)" }}
              >
                Source
              </a>
            </div>
          </div>
        </div>
      </main>
    </HomeLayout>
  )
}
