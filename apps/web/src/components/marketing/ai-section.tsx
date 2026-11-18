import Link from "next/link";

const ways = [
  {
    kicker: "Your subscription",
    title: "Claude Code, Codex, Antigravity",
    body: "data-peek finds the CLI you're already signed in to and drives it on your login. No key to paste, nothing stored, no second bill.",
  },
  {
    kicker: "API key",
    title: "OpenAI, Anthropic, Google, and 5 more",
    body: "Groq, DeepSeek, Mistral, xAI, and GLM too. Keys sit in your OS keychain and go straight to the provider.",
  },
  {
    kicker: "Local",
    title: "Ollama",
    body: "Run a model on your own machine and the prompt never leaves it.",
  },
];

const moves = [
  { k: "⌘T", v: "Ask in plain English, or type SQL in the same box" },
  { k: "⌘I", v: "Describe an edit to your SQL, review it as a diff" },
  { k: "⇥", v: "Tab flips between asking and running SQL" },
];

function ChooseAiMock() {
  return (
    <div
      aria-hidden
      className="relative p-5 sm:p-6"
      style={{
        border: "1px solid var(--n-line)",
        background: "var(--n-bg-sunken)",
      }}
    >
      <div
        className="flex min-w-0 items-center gap-2 pb-4"
        style={{ borderBottom: "1px solid var(--n-line-soft)" }}
      >
        <span className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--n-line)" }}
            />
          ))}
        </span>
        <span className="ml-3 min-w-0 truncate text-[11px] text-[var(--n-fg-faint)]">
          data-peek · prod-replica
        </span>
        <span
          className="ml-auto shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 h-6 px-2 text-[11px]"
          style={{
            color: "var(--n-accent)",
            background: "var(--n-bg-raised)",
            border: "1px solid var(--n-line-soft)",
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ border: "1px solid var(--n-accent)" }}
          />
          Choose AI
          <span className="text-[9px] opacity-60">▼</span>
        </span>
      </div>

      <div className="flex justify-end pt-2">
        <div
          className="w-[220px] py-1.5 text-[12.5px]"
          style={{
            border: "1px solid var(--n-line)",
            background: "var(--n-bg-raised)",
            boxShadow: "0 12px 32px -12px rgb(0 0 0 / 0.45)",
          }}
        >
          <div className="px-3 py-1 text-[11px] text-[var(--n-fg-faint)]">
            Use your subscription
          </div>
          {["Claude", "Codex", "Antigravity"].map((name, i) => (
            <div
              key={name}
              className="flex items-center gap-2 px-3 h-7 text-[var(--n-fg)]"
              style={i === 0 ? { background: "var(--n-bg-sunken)" } : undefined}
            >
              <span
                className="text-[10px]"
                style={{ color: "var(--n-accent)" }}
              >
                ✦
              </span>
              {name}
            </div>
          ))}
          <div
            className="my-1.5"
            style={{ borderTop: "1px solid var(--n-line-soft)" }}
          />
          <div className="px-3 h-7 flex items-center text-[var(--n-fg-muted)]">
            Other providers…
          </div>
        </div>
      </div>

      <div
        className="mt-6 pt-4 flex items-center gap-2 text-[11px] text-[var(--n-fg-muted)]"
        style={{ borderTop: "1px solid var(--n-line-soft)" }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--n-accent)" }}
        />
        Claude
        <span className="text-[var(--n-fg-faint)]">your subscription</span>
        <span className="ml-auto text-[var(--n-fg-faint)]">
          after one click
        </span>
      </div>
    </div>
  );
}

export function AiSection() {
  return (
    <section id="ai" className="relative">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-24 sm:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          <div className="lg:col-span-6">
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--n-fg-faint)]">
              03 — ai
            </div>
            <h2 className="mt-4 text-[36px] sm:text-[48px] leading-[1.02] tracking-[-0.02em] text-[var(--n-fg)] font-medium">
              Already pay for Claude Code?
              <br />
              <span className="text-[var(--n-fg-muted)]">
                Your database can use it.
              </span>
            </h2>
            <p className="mt-6 text-[14px] leading-[1.65] text-[var(--n-fg-muted)] max-w-[52ch]">
              Ask your database questions in plain English on the Claude Code,
              Codex, or Antigravity plan you already have. data-peek spots the
              CLI on launch, and one click puts it to work. No API key, no
              per-token meter, and no AI add-on to buy from us.
            </p>

            <ul className="mt-8 max-w-[52ch]">
              {moves.map((m) => (
                <li
                  key={m.k}
                  className="flex items-center gap-4 py-2.5 text-[13px] text-[var(--n-fg)]"
                  style={{ borderTop: "1px solid var(--n-line-soft)" }}
                >
                  <kbd
                    className="w-11 shrink-0 h-6 inline-flex items-center justify-center text-[11px] tabular-nums"
                    style={{
                      border: "1px solid var(--n-line)",
                      background: "var(--n-bg-raised)",
                    }}
                  >
                    {m.k}
                  </kbd>
                  {m.v}
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-6">
            <ChooseAiMock />
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-4">
          {ways.map((w, i) => (
            <div
              key={w.kicker}
              className="p-6 flex flex-col gap-2"
              style={{
                border: "1px solid var(--n-line-soft)",
                background: i === 0 ? "var(--n-bg-raised)" : "transparent",
              }}
            >
              <div className="text-[10.5px] uppercase tracking-[0.16em] text-[var(--n-fg-faint)]">
                {w.kicker}
              </div>
              <h3 className="text-[16px] leading-[1.3] text-[var(--n-fg)]">
                {w.title}
              </h3>
              <p className="text-[13px] leading-[1.6] text-[var(--n-fg-muted)]">
                {w.body}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-6 text-[12px] text-[var(--n-fg-faint)]">
          AI-written SQL that only reads runs on its own. Writes wait for you.
          AI is free for personal use and included in Pro, and data-peek never
          proxies your prompts.{" "}
          <Link
            href="https://docs.datapeek.dev/docs/features/ai-assistant"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--n-fg-muted)] underline underline-offset-4 decoration-[var(--n-line)] hover:text-[var(--n-fg)]"
          >
            How it works
          </Link>
        </p>
      </div>
    </section>
  );
}
