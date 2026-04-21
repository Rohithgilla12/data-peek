import Link from "next/link"

const cols: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Download", href: "/download" },
      { label: "Compare", href: "/compare" },
    ],
  },
  {
    title: "Databases",
    links: [
      { label: "PostgreSQL", href: "/databases/postgresql" },
      { label: "MySQL", href: "/databases/mysql" },
      { label: "SQL Server", href: "/databases/sql-server" },
      { label: "SQLite", href: "/databases/sqlite" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "https://docs.datapeek.dev/docs", external: true },
      { label: "Changelog", href: "/blog" },
      { label: "FAQ", href: "/#faq" },
      { label: "Students & OSS", href: "/community" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      {
        label: "License (MIT)",
        href: "https://github.com/Rohithgilla12/data-peek/blob/main/LICENSE",
        external: true,
      },
    ],
  },
]

export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer
      className="neat relative"
      style={{ borderTop: "1px solid var(--n-line)", background: "var(--n-bg-sunken)" }}
    >
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-10">
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 text-[14px]">
              <span
                aria-hidden
                className="inline-block h-[10px] w-[10px]"
                style={{ background: "var(--n-accent)" }}
              />
              <span className="text-[var(--n-fg)] font-medium">data-peek</span>
            </Link>
            <p className="mt-4 max-w-[40ch] text-[12.5px] leading-[1.6] text-[var(--n-fg-muted)]">
              A minimal SQL client that opens fast, edits inline, and never
              phones home. Built by one person who was tired of the alternatives.
            </p>
            <div className="mt-5 flex gap-2 text-[11px]">
              <Link
                href="https://github.com/Rohithgilla12/data-peek"
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-3 inline-flex items-center gap-2 text-[var(--n-fg-muted)] hover:text-[var(--n-fg)]"
                style={{ border: "1px solid var(--n-line-soft)" }}
              >
                <span aria-hidden>★</span> GitHub
              </Link>
              <Link
                href="https://x.com/gillarohith"
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-3 inline-flex items-center gap-2 text-[var(--n-fg-muted)] hover:text-[var(--n-fg)]"
                style={{ border: "1px solid var(--n-line-soft)" }}
              >
                X · @gillarohith
              </Link>
            </div>
          </div>

          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="text-[10.5px] uppercase tracking-[0.16em] text-[var(--n-fg-faint)] mb-4">
                {c.title}
              </h4>
              <ul className="space-y-2.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      {...(l.external
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                      className="text-[12.5px] text-[var(--n-fg-muted)] hover:text-[var(--n-fg)] transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="mt-14 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px] text-[var(--n-fg-faint)] tabular-nums"
          style={{ borderTop: "1px solid var(--n-line-soft)" }}
        >
          <span>© {year} data-peek · MIT Licensed</span>
          <span>
            Built by{" "}
            <Link
              href="https://x.com/gillarohith"
              target="_blank"
              className="text-[var(--n-fg-muted)] hover:text-[var(--n-fg)]"
            >
              @gillarohith
            </Link>
          </span>
        </div>
      </div>
    </footer>
  )
}
