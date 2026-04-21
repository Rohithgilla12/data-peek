import Link from "next/link"

type Feature = { title: string; body: string; href?: string }

const categories: { id: string; label: string; items: Feature[] }[] = [
  {
    id: "editor",
    label: "Editor",
    items: [
      { title: "Command palette", body: "⌘K opens every action. Switch connections, run queries, jump to tables." },
      { title: "Monaco editor", body: "The engine that powers VS Code. Autocomplete, schema-aware lint, format on save." },
      { title: "Keyboard-first", body: "Every surface is reachable without the mouse. Shortcuts are discoverable in the palette." },
      { title: "Inline editing", body: "Click a cell, change the value, preview the SQL, commit or undo." },
      { title: "Saved queries", body: "Bookmark what you keep running. Organize in folders, sync across tabs." },
      { title: "Query history", body: "Every executed statement is captured automatically. Search, filter, re-run." },
    ],
  },
  {
    id: "performance",
    label: "Performance",
    items: [
      { title: "Cold start under 2s", body: "No splash, no warmup. Open the app, you're in your last connection." },
      { title: "Query telemetry", body: "Wall time, plan time, execute time. Waterfall and P90/P95/P99 benchmark mode." },
      { title: "Missing index hints", body: "Catch N+1 patterns and sequential scans. Suggested indexes are copy-pasteable." },
      { title: "Health monitor", body: "Active queries, cache hit ratios, locks, table sizes. Kill a stuck query live." },
      { title: "Column statistics", body: "One click profiles a column — min, max, avg, null rate, histogram, top values." },
      { title: "Query plans", body: "EXPLAIN ANALYZE rendered as a tree, not a wall of text." },
    ],
  },
  {
    id: "ai",
    label: "AI",
    items: [
      { title: "Plain-English to SQL", body: "Schema-aware. Ask what you want, get a runnable query back." },
      { title: "Charts from a sentence", body: "Bar, line, pie, area — generated from your result set." },
      { title: "Bring your own key", body: "OpenAI, Anthropic, Google, Groq — or Ollama for a local model. Keys never leave your machine." },
    ],
  },
  {
    id: "data",
    label: "Data",
    items: [
      { title: "Multi-database", body: "Postgres, MySQL, SQL Server, and SQLite. Same interface across all.", href: "/databases" },
      { title: "ER diagrams", body: "Interactive schema map. Filter to a table and see its graph of relationships." },
      { title: "CSV import", body: "Auto column mapping, type inference, batch insert, conflict handling." },
      { title: "Data generator", body: "Realistic fake data with Faker.js. FK-aware, preview before insert, up to 100k rows." },
      { title: "Data masking", body: "Blur sensitive columns for demos and screenshots. Regex-based auto rules." },
      { title: "PG notifications", body: "Subscribe to LISTEN/NOTIFY channels. Real-time event log, send payloads inline." },
      { title: "Export anywhere", body: "CSV, JSON, TSV, or copy rows as SQL INSERTs. No wizards." },
    ],
  },
  {
    id: "infra",
    label: "Infrastructure",
    items: [
      { title: "SSH tunnels", body: "Connect through a bastion with password or key auth. Tunnel lifetime tied to the connection." },
      { title: "Credentials encrypted locally", body: "Stored with the OS keychain. We never see your passwords or API keys." },
      { title: "No telemetry", body: "Zero analytics, zero remote logging. Your queries never leave your machine." },
      { title: "Dark & light", body: "Themes follow system preference. Both are designed, not an afterthought." },
    ],
  },
]

function Pillar({
  kicker,
  title,
  body,
  footer,
}: {
  kicker: string
  title: string
  body: string
  footer: React.ReactNode
}) {
  return (
    <div
      className="p-6 flex flex-col gap-3"
      style={{ border: "1px solid var(--n-line-soft)", background: "var(--n-bg-sunken)" }}
    >
      <div className="text-[10.5px] uppercase tracking-[0.16em] text-[var(--n-fg-faint)]">
        {kicker}
      </div>
      <h3 className="text-[20px] leading-[1.2] tracking-[-0.01em] text-[var(--n-fg)]">{title}</h3>
      <p className="text-[13px] leading-[1.6] text-[var(--n-fg-muted)] max-w-[42ch]">{body}</p>
      <div className="mt-2">{footer}</div>
    </div>
  )
}

export function Features() {
  return (
    <section id="features" className="relative">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-24 sm:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end mb-14">
          <div className="lg:col-span-7">
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--n-fg-faint)]">
              02 — capabilities
            </div>
            <h2 className="mt-4 text-[36px] sm:text-[48px] leading-[1.02] tracking-[-0.02em] text-[var(--n-fg)] font-medium">
              Built for the part of the day
              <br />
              <span className="text-[var(--n-fg-muted)]">you&apos;d rather not be debugging.</span>
            </h2>
          </div>
          <div className="lg:col-span-5">
            <p className="text-[14px] leading-[1.65] text-[var(--n-fg-muted)] max-w-[50ch]">
              Every feature earns its place by saving a keystroke, a tab switch,
              or a trip to the terminal. If it doesn&apos;t, it doesn&apos;t ship.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-20">
          <Pillar
            kicker="Speed"
            title="Opens in under two seconds."
            body="No splash screen. The binary is small, the IPC layer is thin, and the window appears before you're done alt-tabbing."
            footer={
              <div
                className="flex items-baseline gap-2 tabular-nums"
                style={{ borderTop: "1px solid var(--n-line-soft)", paddingTop: "12px" }}
              >
                <span className="text-[28px] text-[var(--n-fg)]">1.8s</span>
                <span className="text-[11px] text-[var(--n-fg-faint)] uppercase tracking-[0.12em]">
                  measured cold start, m2
                </span>
              </div>
            }
          />
          <Pillar
            kicker="Keyboard"
            title="Everything is under ⌘K."
            body="Switch connections, open a table, run a query, format SQL, export, activate AI — one input, every action."
            footer={
              <div
                className="flex items-center gap-1.5 pt-3"
                style={{ borderTop: "1px solid var(--n-line-soft)", paddingTop: "12px" }}
              >
                {["⌘", "K"].map((k) => (
                  <kbd
                    key={k}
                    className="h-7 min-w-7 px-2 inline-flex items-center justify-center text-[12px] text-[var(--n-fg)]"
                    style={{ border: "1px solid var(--n-line)", background: "var(--n-bg-raised)" }}
                  >
                    {k}
                  </kbd>
                ))}
                <span className="text-[11px] text-[var(--n-fg-faint)] ml-2">command palette</span>
              </div>
            }
          />
          <Pillar
            kicker="AI · BYOK"
            title="Intelligence on your terms."
            body="Bring a key from OpenAI, Anthropic, Google, Groq — or point at a local Ollama model. The app never brokers your traffic."
            footer={
              <div
                className="flex flex-wrap gap-1.5 pt-3"
                style={{ borderTop: "1px solid var(--n-line-soft)", paddingTop: "12px" }}
              >
                {["OpenAI", "Anthropic", "Google", "Groq", "Ollama"].map((p) => (
                  <span
                    key={p}
                    className="h-6 px-2 inline-flex items-center text-[10.5px] text-[var(--n-fg-muted)]"
                    style={{ border: "1px solid var(--n-line-soft)" }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            }
          />
        </div>

        {/* Index */}
        <div
          className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-x-10"
          style={{ borderTop: "1px solid var(--n-line)" }}
        >
          {categories.map((cat, catIdx) => (
            <div
              key={cat.id}
              className="contents"
            >
              <div
                className="pt-6 pb-2 md:py-8 flex items-start gap-3"
                style={{ borderBottom: "1px solid var(--n-line-soft)" }}
              >
                <span className="text-[10.5px] text-[var(--n-fg-faint)] tabular-nums pt-0.5">
                  {String(catIdx + 1).padStart(2, "0")}
                </span>
                <span className="text-[13px] text-[var(--n-fg)] uppercase tracking-[0.14em]">
                  {cat.label}
                </span>
                <span className="text-[11px] text-[var(--n-fg-faint)] tabular-nums ml-auto">
                  {cat.items.length}
                </span>
              </div>
              <dl
                className="md:py-6 divide-y"
                style={{
                  borderBottom: "1px solid var(--n-line-soft)",
                  // @ts-expect-error - CSS custom
                  "--tw-divide-opacity": 1,
                }}
              >
                {cat.items.map((f) => (
                  <div
                    key={f.title}
                    className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-1 sm:gap-8 py-3"
                    style={{ borderTop: "1px solid var(--n-line-soft)" }}
                  >
                    <dt className="text-[13px] text-[var(--n-fg)]">
                      {f.href ? (
                        <Link href={f.href} className="hover:text-[var(--n-accent)]">
                          {f.title}
                        </Link>
                      ) : (
                        f.title
                      )}
                    </dt>
                    <dd className="text-[12.5px] leading-[1.6] text-[var(--n-fg-muted)] max-w-[70ch]">
                      {f.body}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
