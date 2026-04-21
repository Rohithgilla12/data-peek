"use client"

import Link from "next/link"
import { useState } from "react"

const personal = {
  name: "Personal",
  price: "$0",
  tagline: "Solo devs, OSS, side projects, students.",
  features: [
    "All features unlocked",
    "AI assistant (bring your own key)",
    "Postgres, MySQL, SQL Server, SQLite",
    "Unlimited connections & history",
    "All future updates",
  ],
}

const pro = {
  name: "Pro",
  price: "$29",
  priceMeta: "/ year",
  oldPrice: "$99",
  tagline: "Commercial use inside a for-profit team.",
  features: [
    "Everything in Personal",
    "Commercial use at work & for clients",
    "1 year of updates included",
    "3 device activations",
    "Perpetual fallback license",
    "30-day money-back guarantee",
  ],
}

function Check() {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center h-4 w-4 mt-[3px] shrink-0 text-[10px]"
      style={{ border: "1px solid var(--n-line)", color: "var(--n-accent)" }}
    >
      ✓
    </span>
  )
}

type TierShape = {
  name: string
  price: string
  priceMeta?: string
  oldPrice?: string
  tagline: string
  features: string[]
}

function Tier({
  tier,
  featured,
  children,
}: {
  tier: TierShape
  featured?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className="flex flex-col p-8"
      style={{
        border: "1px solid var(--n-line)",
        background: featured ? "var(--n-bg-raised)" : "var(--n-bg-sunken)",
      }}
    >
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] uppercase tracking-[0.16em] text-[var(--n-fg)]">
            {tier.name}
          </h3>
          {featured && (
            <span
              className="text-[10px] uppercase tracking-[0.14em] h-5 px-1.5 inline-flex items-center"
              style={{ background: "var(--n-accent)", color: "var(--n-accent-ink)" }}
            >
              70% off
            </span>
          )}
        </div>
        <div className="text-right tabular-nums">
          {tier.oldPrice && (
            <span className="mr-2 text-[13px] text-[var(--n-fg-faint)] line-through">
              {tier.oldPrice}
            </span>
          )}
          <span className="text-[32px] leading-none text-[var(--n-fg)]">
            {tier.price}
          </span>
          {tier.priceMeta && (
            <span className="ml-1 text-[12px] text-[var(--n-fg-muted)]">
              {tier.priceMeta}
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 text-[13px] text-[var(--n-fg-muted)]">{tier.tagline}</p>

      <ul className="mt-6 space-y-2.5 flex-1">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-3 text-[13px] text-[var(--n-fg)]">
            <Check />
            <span className="leading-[1.55]">{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">{children}</div>
    </div>
  )
}

function ProCheckoutButton() {
  const [loading, setLoading] = useState(false)

  const go = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/checkout", { method: "POST" })
      const data = await res.json()
      if (data.checkout_url) window.location.href = data.checkout_url
      else setLoading(false)
    } catch {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={go}
      disabled={loading}
      className="w-full h-11 inline-flex items-center justify-center text-[13px] font-medium disabled:opacity-60"
      style={{ background: "var(--n-accent)", color: "var(--n-accent-ink)" }}
    >
      {loading ? "Opening checkout…" : "Get Pro license →"}
    </button>
  )
}

export function Pricing() {
  return (
    <section id="pricing" className="relative">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-24 sm:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end mb-12">
          <div className="lg:col-span-7">
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--n-fg-faint)]">
              03 — pricing
            </div>
            <h2 className="mt-4 text-[36px] sm:text-[48px] leading-[1.02] tracking-[-0.02em] text-[var(--n-fg)] font-medium">
              Free for personal use.
              <br />
              <span className="text-[var(--n-fg-muted)]">Pay once for work.</span>
            </h2>
          </div>
          <div className="lg:col-span-5">
            <p className="text-[14px] leading-[1.65] text-[var(--n-fg-muted)] max-w-[48ch]">
              No seats, no subscriptions dressed up as perpetual licenses, no
              telemetry checking whether you&apos;re still allowed to use the
              thing you bought.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Tier tier={personal}>
            <Link
              href="/download"
              className="w-full h-11 inline-flex items-center justify-center text-[13px] text-[var(--n-fg)]"
              style={{ border: "1px solid var(--n-line)" }}
            >
              Download — free
            </Link>
          </Tier>
          <Tier tier={pro} featured>
            <ProCheckoutButton />
          </Tier>
        </div>

        {/* Honor system */}
        <div
          className="mt-10 grid grid-cols-1 md:grid-cols-[1fr_auto] items-center gap-6 p-6"
          style={{ border: "1px solid var(--n-line-soft)" }}
        >
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--n-fg-faint)]">
              Honor system
            </div>
            <p className="mt-2 text-[13px] leading-[1.6] text-[var(--n-fg-muted)] max-w-[80ch]">
              No DRM, no license-server shakedowns. If you&apos;re a solo
              founder, student, educator, or contributor to OSS — it&apos;s free,
              no questions.{" "}
              <Link href="https://x.com/gillarohith" target="_blank" className="text-[var(--n-fg)] underline underline-offset-4 decoration-[var(--n-line)]">
                DM @gillarohith
              </Link>{" "}
              for a license.
            </p>
          </div>
          <div className="flex gap-3 text-[11px] text-[var(--n-fg-muted)]">
            <Link
              href="https://github.com/Rohithgilla12/data-peek"
              target="_blank"
              className="h-8 px-3 inline-flex items-center gap-2 hover:text-[var(--n-fg)]"
              style={{ border: "1px solid var(--n-line-soft)" }}
            >
              MIT source
            </Link>
            <Link
              href="https://github.com/sponsors/Rohithgilla12"
              target="_blank"
              className="h-8 px-3 inline-flex items-center gap-2 hover:text-[var(--n-fg)]"
              style={{ border: "1px solid var(--n-line-soft)" }}
            >
              Sponsor
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
