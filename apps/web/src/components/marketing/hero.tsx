import Link from "next/link"
import { AppSurface } from "./app-surface"

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-x-0 top-0 h-[560px] neat-grid-bg" />

      <div className="relative mx-auto max-w-[1240px] px-5 sm:px-8 pt-16 pb-10 sm:pt-24 sm:pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
          <div className="lg:col-span-7">
            <div
              className="inline-flex items-center gap-2 text-[11px] text-[var(--n-fg-muted)] h-7 px-2.5"
              style={{ border: "1px solid var(--n-line-soft)" }}
            >
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--n-accent)" }}
              />
              v0.21 — AI deps, SSH tunnel reliability
              <span aria-hidden className="text-[var(--n-fg-faint)]">→</span>
              <Link
                href="/blog"
                className="text-[var(--n-fg-muted)] hover:text-[var(--n-fg)]"
              >
                changelog
              </Link>
            </div>

            <h1
              className="mt-6 text-[40px] sm:text-[54px] lg:text-[62px] leading-[0.98] tracking-[-0.02em] font-medium text-[var(--n-fg)]"
              style={{ textWrap: "balance" } as React.CSSProperties}
            >
              A fast, keyboard-first
              <br />
              SQL client.{" "}
              <span className="text-[var(--n-fg-muted)]">
                Opens before
                <br className="hidden sm:inline" /> you finish thinking.
              </span>
            </h1>

            <p
              className="mt-6 max-w-[56ch] text-[15px] leading-[1.65] text-[var(--n-fg-muted)]"
            >
              Connect, query, and edit data across Postgres, MySQL, SQL Server,
              and SQLite. Inline edits, AI assist with your own key, and a
              command palette that knows every action.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/download"
                className="inline-flex h-10 items-center gap-2 px-4 text-[13px] font-medium"
                style={{ background: "var(--n-accent)", color: "var(--n-accent-ink)" }}
              >
                Download — free
                <span aria-hidden className="text-[var(--n-accent-ink)]/70">↓</span>
              </Link>
              <Link
                href="/#pricing"
                className="inline-flex h-10 items-center px-4 text-[13px] text-[var(--n-fg)]"
                style={{ border: "1px solid var(--n-line)" }}
              >
                Pro — $29/yr
              </Link>
              <Link
                href="https://github.com/Rohithgilla12/data-peek"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 px-4 text-[13px] text-[var(--n-fg-muted)] hover:text-[var(--n-fg)]"
              >
                <span aria-hidden>★</span> GitHub
              </Link>
            </div>

            <dl className="mt-10 grid grid-cols-3 gap-6 max-w-[520px]">
              <div>
                <dt className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--n-fg-faint)]">
                  Cold start
                </dt>
                <dd className="mt-1 text-[20px] text-[var(--n-fg)] tabular-nums">
                  &lt; 2.0s
                </dd>
              </div>
              <div>
                <dt className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--n-fg-faint)]">
                  Databases
                </dt>
                <dd className="mt-1 text-[20px] text-[var(--n-fg)] tabular-nums">4</dd>
              </div>
              <div>
                <dt className="text-[10.5px] uppercase tracking-[0.14em] text-[var(--n-fg-faint)]">
                  License
                </dt>
                <dd className="mt-1 text-[20px] text-[var(--n-fg)]">MIT</dd>
              </div>
            </dl>
          </div>

          <div className="lg:col-span-5 hidden lg:block">
            <ol className="space-y-3">
              {[
                { k: "⌘K", v: "Command palette" },
                { k: "⌘↵", v: "Run query" },
                { k: "⌘E", v: "Export results" },
                { k: "⌘/", v: "Ask AI (BYOK)" },
                { k: "⌘⇧F", v: "Format SQL" },
              ].map((s) => (
                <li
                  key={s.k}
                  className="flex items-center justify-between py-2 text-[12.5px]"
                  style={{ borderBottom: "1px solid var(--n-line-soft)" }}
                >
                  <span className="text-[var(--n-fg-muted)]">{s.v}</span>
                  <kbd
                    className="text-[11px] text-[var(--n-fg)] px-1.5 h-6 inline-flex items-center tabular-nums"
                    style={{ border: "1px solid var(--n-line)", background: "var(--n-bg-raised)" }}
                  >
                    {s.k}
                  </kbd>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="mt-14 sm:mt-20">
          <AppSurface />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 text-[11px] text-[var(--n-fg-faint)]">
          <span>Available for</span>
          <span className="text-[var(--n-fg-muted)]">macOS (Apple Silicon, Intel)</span>
          <span aria-hidden>·</span>
          <span className="text-[var(--n-fg-muted)]">Windows 10/11</span>
          <span aria-hidden>·</span>
          <span className="text-[var(--n-fg-muted)]">Linux (.deb, .rpm, .AppImage)</span>
        </div>
      </div>
    </section>
  )
}
