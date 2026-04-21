import Link from "next/link"

export function Cta() {
  return (
    <section className="relative">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 pb-24 sm:pb-32">
        <div
          className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-center p-8 sm:p-12"
          style={{ border: "1px solid var(--n-line)", background: "var(--n-bg-sunken)" }}
        >
          <div>
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--n-fg-faint)]">
              Ready when you are
            </div>
            <h3 className="mt-3 text-[28px] sm:text-[34px] leading-[1.05] tracking-[-0.02em] text-[var(--n-fg)]">
              Stop babysitting your database client.
            </h3>
            <p className="mt-3 text-[13px] leading-[1.65] text-[var(--n-fg-muted)] max-w-[58ch]">
              Download the free build, run your next query in data-peek, and see
              if your current tool still deserves a dock icon.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/download"
              className="h-11 inline-flex items-center gap-2 px-5 text-[13px] font-medium"
              style={{ background: "var(--n-accent)", color: "var(--n-accent-ink)" }}
            >
              Download — free
              <span aria-hidden>↓</span>
            </Link>
            <Link
              href="https://github.com/Rohithgilla12/data-peek"
              target="_blank"
              rel="noopener noreferrer"
              className="h-11 inline-flex items-center gap-2 px-5 text-[13px] text-[var(--n-fg)]"
              style={{ border: "1px solid var(--n-line)" }}
            >
              <span aria-hidden>★</span> GitHub
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
