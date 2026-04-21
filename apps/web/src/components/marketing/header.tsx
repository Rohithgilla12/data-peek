"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

const nav = [
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
  { href: "/blog", label: "Changelog" },
  { href: "https://docs.datapeek.dev/docs", label: "Docs", external: true },
]

export function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener("scroll", on, { passive: true })
    return () => window.removeEventListener("scroll", on)
  }, [])

  return (
    <header
      className={`neat sticky top-0 z-50 transition-colors duration-200 ${
        scrolled
          ? "bg-[var(--n-bg)]/90 backdrop-blur-md"
          : "bg-transparent"
      }`}
      style={{
        borderBottom: scrolled ? "1px solid var(--n-line-soft)" : "1px solid transparent",
      }}
    >
      <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-10">
          <Link
            href="/"
            className="flex items-center gap-2 text-[13px] tracking-tight"
          >
            <span
              aria-hidden
              className="inline-block h-[10px] w-[10px]"
              style={{ background: "var(--n-accent)" }}
            />
            <span className="font-medium text-[var(--n-fg)]">data-peek</span>
            <span className="text-[11px] text-[var(--n-fg-faint)]">v0.21</span>
          </Link>

          <nav className="hidden md:flex items-center gap-7">
            {nav.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="text-[12.5px] text-[var(--n-fg-muted)] hover:text-[var(--n-fg)] transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="https://github.com/Rohithgilla12/data-peek"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex h-8 items-center gap-2 px-3 text-[12px] text-[var(--n-fg-muted)] hover:text-[var(--n-fg)] transition-colors"
            style={{ border: "1px solid var(--n-line-soft)" }}
          >
            <span aria-hidden>★</span>
            <span>Star</span>
          </Link>
          <Link
            href="/download"
            className="hidden sm:inline-flex h-8 items-center px-3 text-[12px] text-[var(--n-fg-muted)] hover:text-[var(--n-fg)] transition-colors"
          >
            Download
          </Link>
          <Link
            href="/#pricing"
            className="inline-flex h-8 items-center px-3.5 text-[12px] font-medium"
            style={{ background: "var(--n-accent)", color: "var(--n-accent-ink)" }}
          >
            Get Pro
          </Link>
          <button
            className="md:hidden ml-1 h-8 w-8 grid place-items-center text-[var(--n-fg-muted)]"
            style={{ border: "1px solid var(--n-line-soft)" }}
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span aria-hidden>{open ? "×" : "≡"}</span>
          </button>
        </div>
      </div>

      {open && (
        <div
          className="md:hidden"
          style={{ borderTop: "1px solid var(--n-line-soft)", background: "var(--n-bg)" }}
        >
          <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-4 flex flex-col gap-3">
            {nav.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-[13px] text-[var(--n-fg-muted)] hover:text-[var(--n-fg)]"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}
