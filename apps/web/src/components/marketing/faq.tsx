"use client"

import Link from "next/link"
import { useState } from "react"
import { StructuredData } from "@/components/seo/structured-data"

const faqs = [
  {
    q: "Is data-peek really free?",
    a: "Yes. All features are unlocked for personal use — no credit card, no time limit, no feature flags. A Pro license is only required to use it commercially inside a for-profit team of two or more.",
  },
  {
    q: "How does the AI assistant work?",
    a: "You bring your own API key. data-peek sends the question and relevant schema to your chosen provider (OpenAI, Anthropic, Google, Groq) — or to a local Ollama model if you want the prompt to never leave your machine.",
  },
  {
    q: "Which databases are supported?",
    a: "PostgreSQL, MySQL, Microsoft SQL Server, and SQLite. Same interface, same shortcuts, same results grid across all four.",
  },
  {
    q: "What counts as commercial use?",
    a: "Using data-peek at a for-profit company with two or more people, freelancing for clients, or in agency work. Solo founders (company of one) are free.",
  },
  {
    q: "Is data-peek open source?",
    a: "The source is MIT-licensed on GitHub. You can build it yourself for any purpose. Pre-built signed binaries require a Pro license for commercial use — that's what funds development.",
  },
  {
    q: 'What does "perpetual fallback" mean?',
    a: "A Pro license includes one year of updates. If you don't renew, the version you have keeps working forever. Renew whenever you want new features.",
  },
  {
    q: "I'm a student or educator — can I use it for free?",
    a: "Yes, including for paid university coursework. DM @gillarohith on X or email gillarohith1@gmail.com for a free license.",
  },
  {
    q: "Is my data safe?",
    a: "Queries run directly from your machine to your database. Credentials live in the OS keychain. There is no telemetry, no usage tracking, no remote logging. For AI, use Ollama locally if you want nothing to leave the box.",
  },
]

function Row({
  faq,
  open,
  onToggle,
}: {
  faq: (typeof faqs)[number]
  open: boolean
  onToggle: () => void
}) {
  return (
    <div style={{ borderTop: "1px solid var(--n-line-soft)" }}>
      <button
        onClick={onToggle}
        className="w-full flex items-start justify-between gap-6 py-5 text-left"
        aria-expanded={open}
      >
        <span className="text-[14px] leading-[1.4] text-[var(--n-fg)]">
          {faq.q}
        </span>
        <span
          aria-hidden
          className="mt-0.5 shrink-0 h-5 w-5 inline-flex items-center justify-center text-[11px] text-[var(--n-fg-muted)] tabular-nums"
          style={{ border: "1px solid var(--n-line)" }}
        >
          {open ? "−" : "+"}
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <p className="pb-6 pr-8 max-w-[80ch] text-[13px] leading-[1.7] text-[var(--n-fg-muted)]">
            {faq.a}
          </p>
        </div>
      </div>
    </div>
  )
}

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section id="faq" className="relative">
      <StructuredData
        type="faq"
        data={{ faq: faqs.map((f) => ({ question: f.q, answer: f.a })) }}
      />
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-24 sm:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-4">
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--n-fg-faint)]">
              04 — questions
            </div>
            <h2 className="mt-4 text-[32px] sm:text-[40px] leading-[1.05] tracking-[-0.02em] text-[var(--n-fg)] font-medium">
              Straight answers,
              <br />
              no marketing speak.
            </h2>
            <p className="mt-5 text-[13px] leading-[1.65] text-[var(--n-fg-muted)] max-w-[40ch]">
              Still unsure?{" "}
              <Link
                href="https://x.com/gillarohith"
                target="_blank"
                className="text-[var(--n-fg)] underline underline-offset-4 decoration-[var(--n-line)]"
              >
                DM @gillarohith
              </Link>
              . Replies come from the person who wrote the code.
            </p>
          </div>
          <div
            className="lg:col-span-8"
            style={{ borderBottom: "1px solid var(--n-line-soft)" }}
          >
            {faqs.map((f, i) => (
              <Row
                key={f.q}
                faq={f}
                open={open === i}
                onToggle={() => setOpen(open === i ? null : i)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
