import Link from "next/link";
import { MotionLoop } from "./motion-loop";

const ways = [
  {
    kicker: "Your subscription",
    title: "Claude Code, Codex, Antigravity",
    body: "data-peek finds the installed CLI and runs it on the login you already have. No key to paste and no second bill.",
  },
  {
    kicker: "API key",
    title: "OpenAI, Anthropic, Google, and 5 more",
    body: "Groq, DeepSeek, Mistral, xAI, and GLM too. Keys stay on your machine and go straight to the provider.",
  },
  {
    kicker: "Local",
    title: "Ollama",
    body: "Run Ollama on the same machine and the prompt never leaves it.",
  },
];

const moves = [
  { k: "⌘T", v: "Ask in plain English, or type SQL in the same box" },
  { k: "⌘I", v: "Describe an edit to your SQL, review it as a diff" },
  { k: "⇥", v: "Tab flips what you typed between a question and SQL" },
];

export function AiSection() {
  return (
    <section id="ai" className="relative">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8 py-24 sm:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-end">
          <div className="lg:col-span-7">
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
              Codex, or Antigravity plan you already have. With no AI set up,
              data-peek finds the installed CLI, and one click puts it to work.
              No API key to set up and no AI add-on to buy from us.
            </p>
          </div>

          <div className="lg:col-span-5">
            <ul className="max-w-[52ch]">
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
        </div>

        <div className="mt-12">
          <MotionLoop
            name="ask-ai"
            label="In data-peek, Claude is picked from the Choose AI menu. A plain-English question comes back as SQL that runs on its own, with five rows and a chart. A write stops at Run it."
          />
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
          AI-written reads run on their own unless the AI flags them for review.
          Writes always wait for you. AI is free for personal use and included
          in Pro, and data-peek never proxies your prompts.{" "}
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
