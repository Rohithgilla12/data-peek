import { Link } from "@tanstack/react-router"
import { HomeLayout } from "fumadocs-ui/layouts/home"
import { baseOptions } from "@/lib/layout.shared"

export function NotFound() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="mx-auto max-w-[640px] px-5 sm:px-8 py-24 sm:py-32">
        <div className="text-[10.5px] uppercase tracking-[0.16em] text-[var(--n-fg-faint)]">
          404 · page not found
        </div>

        <h1 className="mt-5 text-[30px] sm:text-[36px] leading-[1.05] tracking-[-0.02em] text-[var(--n-fg)] font-medium">
          We can&apos;t find that page.
        </h1>

        <p className="mt-4 text-[14px] leading-[1.65] text-[var(--n-fg-muted)] max-w-[56ch]">
          Either the URL is wrong, the page was renamed, or it never existed.
          Jump back to the docs index or head to the landing page.
        </p>

        <pre
          className="mt-8 p-4 text-[12.5px] leading-[1.55] tabular-nums"
          style={{
            border: "1px solid var(--n-line)",
            background: "var(--n-bg-sunken)",
            color: "var(--n-fg-muted)",
            borderRadius: 4,
            margin: 0,
          }}
        >
          <span style={{ color: "var(--n-fg-faint)" }}>$ </span>
          <span style={{ color: "var(--n-fg)" }}>data-peek docs</span>
          <span>{" open "}</span>
          <span style={{ color: "var(--n-accent)" }}>{"<that-url>"}</span>
          {"\n"}
          <span style={{ color: "var(--n-err)" }}>ENOENT</span>
          <span>{" "}no such page or directory</span>
        </pre>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            to="/"
            className="inline-flex h-10 items-center gap-2 px-4 text-[13px] font-medium"
            style={{ background: "var(--n-accent)", color: "var(--n-accent-ink)" }}
          >
            <span aria-hidden>←</span> Back to docs
          </Link>
          <a
            href="https://datapeek.dev"
            className="inline-flex h-10 items-center px-4 text-[13px] text-[var(--n-fg)]"
            style={{ border: "1px solid var(--n-line)" }}
          >
            datapeek.dev
          </a>
        </div>
      </div>
    </HomeLayout>
  )
}
