const tables = [
  { name: "users", rows: "18,402" },
  { name: "orders", rows: "104,887" },
  { name: "order_items", rows: "412,301" },
  { name: "products", rows: "2,148" },
  { name: "inventory", rows: "5,902" },
  { name: "shipments", rows: "98,104" },
  { name: "refunds", rows: "1,221" },
  { name: "sessions", rows: "— view" },
]

const rows = [
  ["8142", "amelia.tan@…", "Paid", "$284.10", "2h ago"],
  ["8141", "j.ngo@…", "Paid", "$1,204.00", "2h ago"],
  ["8140", "kenji.s@…", "Refunded", "$74.20", "3h ago"],
  ["8139", "priya.v@…", "Paid", "$482.00", "3h ago"],
  ["8138", "max.ruiz@…", "Pending", "$90.00", "4h ago"],
  ["8137", "nadia.b@…", "Paid", "$1,998.00", "4h ago"],
  ["8136", "hiroki.w@…", "Paid", "$58.40", "5h ago"],
]

export function AppSurface() {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: "var(--n-bg-sunken)",
        border: "1px solid var(--n-line)",
        boxShadow:
          "0 1px 0 oklch(1 0 0 / 0.04) inset, 0 40px 80px -20px oklch(0 0 0 / 0.5)",
      }}
    >
      {/* Title bar */}
      <div
        className="flex items-center h-9 px-3"
        style={{ borderBottom: "1px solid var(--n-line-soft)", background: "var(--n-bg-raised)" }}
      >
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "oklch(0.68 0.14 20)" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "oklch(0.80 0.14 75)" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "oklch(0.75 0.14 145)" }} />
        </div>
        <div className="flex-1 text-center text-[11px] text-[var(--n-fg-faint)] tabular-nums">
          data-peek — main · shop_production · postgres 16.4
        </div>
        <div className="flex items-center gap-1 text-[10.5px] text-[var(--n-fg-faint)]">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--n-accent)" }} />
          <span>connected</span>
        </div>
      </div>

      {/* Tab strip */}
      <div
        className="flex items-stretch h-9 text-[11.5px]"
        style={{ borderBottom: "1px solid var(--n-line-soft)" }}
      >
        {[
          { label: "recent_orders.sql", active: true },
          { label: "backfill_emails.sql" },
          { label: "schema.prisma" },
        ].map((t) => (
          <div
            key={t.label}
            className="flex items-center gap-2 px-3"
            style={{
              borderRight: "1px solid var(--n-line-soft)",
              background: t.active ? "var(--n-bg-sunken)" : "transparent",
              color: t.active ? "var(--n-fg)" : "var(--n-fg-muted)",
              boxShadow: t.active ? "inset 0 1px 0 var(--n-accent)" : "none",
            }}
          >
            <span className="text-[var(--n-fg-faint)]">›</span>
            <span>{t.label}</span>
            <span className="text-[var(--n-fg-faint)] ml-1">×</span>
          </div>
        ))}
        <div className="flex-1" />
        <div className="flex items-center px-3 gap-4 text-[var(--n-fg-faint)]">
          <span>⌘K</span>
          <span>⌘↵ run</span>
        </div>
      </div>

      {/* Body */}
      <div className="grid grid-cols-[200px_1fr] min-h-[440px]">
        {/* Sidebar */}
        <aside
          className="py-3 text-[11.5px] select-none"
          style={{ borderRight: "1px solid var(--n-line-soft)" }}
        >
          <div className="px-3 pb-2 text-[10px] uppercase tracking-[0.14em] text-[var(--n-fg-faint)]">
            public
          </div>
          <ul>
            {tables.map((t, i) => (
              <li
                key={t.name}
                className="neat-row px-3 h-7 flex items-center justify-between"
                style={{
                  color: i === 1 ? "var(--n-fg)" : "var(--n-fg-muted)",
                  background: i === 1 ? "var(--n-accent-soft)" : undefined,
                }}
              >
                <span className="flex items-center gap-2">
                  <span className="text-[var(--n-fg-faint)]">▸</span>
                  <span>{t.name}</span>
                </span>
                <span className="text-[10.5px] text-[var(--n-fg-faint)] tabular-nums">
                  {t.rows}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 px-3 pb-2 text-[10px] uppercase tracking-[0.14em] text-[var(--n-fg-faint)]">
            connections
          </div>
          <ul className="text-[11px]">
            <li className="px-3 h-7 flex items-center gap-2 text-[var(--n-fg)]">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--n-accent)" }}
              />
              shop_production
            </li>
            <li className="px-3 h-7 flex items-center gap-2 text-[var(--n-fg-muted)]">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--n-fg-faint)" }}
              />
              shop_staging
            </li>
            <li className="px-3 h-7 flex items-center gap-2 text-[var(--n-fg-muted)]">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--n-fg-faint)" }}
              />
              analytics_mysql
            </li>
          </ul>
        </aside>

        {/* Main */}
        <div className="flex flex-col">
          {/* Editor */}
          <div
            className="px-5 py-4 text-[12.5px] leading-[1.75] neat-sql tabular-nums"
            style={{ borderBottom: "1px solid var(--n-line-soft)" }}
          >
            <div className="flex">
              <pre className="text-[var(--n-fg-faint)] select-none pr-4 text-right">{`1
2
3
4
5
6
7`}</pre>
              <pre className="text-[var(--n-fg)] whitespace-pre-wrap">
                <span className="c">-- last 24h of paid orders, joined to customer</span>{"\n"}
                <span className="k">select</span> o.id, u.email, o.status, o.total, o.created_at{"\n"}
                <span className="k">from</span> orders o{"\n"}
                <span className="k">join</span> users u <span className="k">on</span> u.id = o.user_id{"\n"}
                <span className="k">where</span> o.created_at {">"} <span className="k">now</span>() - <span className="k">interval</span> <span className="s">&apos;24 hours&apos;</span>{"\n"}
                <span className="k">order by</span> o.created_at <span className="k">desc</span>{"\n"}
                <span className="k">limit</span> <span className="n">50</span>
                <span className="neat-caret" aria-hidden />
              </pre>
            </div>
          </div>

          {/* Status / actions row */}
          <div
            className="flex items-center h-8 px-4 text-[11px] text-[var(--n-fg-muted)] tabular-nums"
            style={{ borderBottom: "1px solid var(--n-line-soft)", background: "var(--n-bg-raised)" }}
          >
            <span className="text-[var(--n-fg)]">7 rows</span>
            <span className="mx-3 text-[var(--n-fg-faint)]">·</span>
            <span>32 ms</span>
            <span className="mx-3 text-[var(--n-fg-faint)]">·</span>
            <span>index scan · orders_created_at_idx</span>
            <span className="flex-1" />
            <span className="text-[var(--n-fg-faint)]">export</span>
            <span className="mx-3 text-[var(--n-fg-faint)]">|</span>
            <span className="text-[var(--n-fg-faint)]">explain</span>
            <span className="mx-3 text-[var(--n-fg-faint)]">|</span>
            <span className="text-[var(--n-fg)]">live edit</span>
          </div>

          {/* Results */}
          <div className="flex-1 text-[12px]">
            <div
              className="grid text-[10.5px] uppercase tracking-[0.12em] text-[var(--n-fg-faint)]"
              style={{
                gridTemplateColumns: "80px 1fr 100px 120px 100px",
                borderBottom: "1px solid var(--n-line-soft)",
              }}
            >
              {["id", "email", "status", "total", "age"].map((h) => (
                <span key={h} className="px-4 py-2">
                  {h}
                </span>
              ))}
            </div>
            {rows.map((r, i) => (
              <div
                key={i}
                className="grid neat-row tabular-nums"
                style={{
                  gridTemplateColumns: "80px 1fr 100px 120px 100px",
                  borderBottom: "1px solid oklch(0.22 0.006 260 / 0.5)",
                }}
              >
                <span className="px-4 py-2 text-[var(--n-fg-faint)]">{r[0]}</span>
                <span className="px-4 py-2 text-[var(--n-fg)]">{r[1]}</span>
                <span
                  className="px-4 py-2"
                  style={{
                    color:
                      r[2] === "Paid"
                        ? "oklch(0.80 0.13 150)"
                        : r[2] === "Refunded"
                        ? "oklch(0.75 0.12 30)"
                        : "var(--n-fg-muted)",
                  }}
                >
                  {r[2]}
                </span>
                <span className="px-4 py-2 text-[var(--n-fg)]">{r[3]}</span>
                <span className="px-4 py-2 text-[var(--n-fg-muted)]">{r[4]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="flex items-center h-7 px-3 text-[10.5px] text-[var(--n-fg-faint)] tabular-nums"
        style={{ borderTop: "1px solid var(--n-line-soft)", background: "var(--n-bg-raised)" }}
      >
        <span>UTF-8</span>
        <span className="mx-3">·</span>
        <span>Ln 7, Col 11</span>
        <span className="flex-1" />
        <span>Format on save</span>
        <span className="mx-3">·</span>
        <span>AI: claude-sonnet-4 (BYOK)</span>
      </div>
    </div>
  )
}
