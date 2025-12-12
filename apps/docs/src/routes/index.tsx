import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-6 py-20">
        {/* Hero Section */}
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 blur-2xl opacity-30 bg-[#22d3ee] rounded-full scale-150" />
              <img
                src="https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev/data-peek-icon.png"
                alt="data-peek"
                className="relative h-20 w-20 rounded-2xl shadow-lg shadow-[#22d3ee]/20"
              />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
            <span className="text-foreground">data-peek</span>{" "}
            <span className="text-[#22d3ee]">docs</span>
          </h1>

          {/* Tagline */}
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
            Everything you need to know about the minimal, fast, and lightweight
            SQL client for <span className="text-[#22d3ee]">PostgreSQL</span>,{" "}
            <span className="text-[#22d3ee]">MySQL</span>,{" "}
            <span className="text-[#22d3ee]">SQL Server</span>, and{" "}
            <span className="text-[#22d3ee]">SQLite</span>.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              to="/docs/$"
              params={{ _splat: "" }}
              className="group relative inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#22d3ee] font-semibold text-sm transition-all hover:bg-[#67e8f9] hover:shadow-lg hover:shadow-[#22d3ee]/20"
              style={{ color: "#0f172a" }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
              >
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
              </svg>
              Read the Docs
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4 transition-transform group-hover:translate-x-1"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
            <a
              href="https://github.com/Rohithgilla12/data-peek"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-border text-foreground font-medium text-sm transition-all hover:border-[#22d3ee] hover:text-[#22d3ee]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              View on GitHub
            </a>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="relative z-10 mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="group p-6 rounded-xl border border-border bg-card/50 backdrop-blur transition-all hover:border-[#22d3ee]/30 hover:bg-card">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#22d3ee]/10 text-[#22d3ee] mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5"
              >
                <path d="m13 2-2 2.5h3L12 7" />
                <path d="M10 14v-3" />
                <path d="M14 14v-3" />
                <path d="M11 19c-1.7 0-3-1.3-3-3v-2h8v2c0 1.7-1.3 3-3 3z" />
                <path d="M12 22v-3" />
              </svg>
            </div>
            <h3 className="text-foreground font-semibold mb-2">
              Lightning Fast
            </h3>
            <p className="text-muted-foreground text-sm">
              Optimized for speed. Opens instantly and executes queries in
              milliseconds.
            </p>
          </div>

          <div className="group p-6 rounded-xl border border-border bg-card/50 backdrop-blur transition-all hover:border-[#22d3ee]/30 hover:bg-card">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#22d3ee]/10 text-[#22d3ee] mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="m9 8 6 4-6 4Z" />
              </svg>
            </div>
            <h3 className="text-foreground font-semibold mb-2">
              Keyboard First
            </h3>
            <p className="text-muted-foreground text-sm">
              Navigate and execute everything with keyboard shortcuts for
              maximum productivity.
            </p>
          </div>

          <div className="group p-6 rounded-xl border border-border bg-card/50 backdrop-blur transition-all hover:border-[#22d3ee]/30 hover:bg-card">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#22d3ee]/10 text-[#22d3ee] mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5"
              >
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            </div>
            <h3 className="text-foreground font-semibold mb-2">
              Beautiful Dark UI
            </h3>
            <p className="text-muted-foreground text-sm">
              Terminal-inspired design that's easy on the eyes for long coding
              sessions.
            </p>
          </div>
        </div>

        {/* Terminal decoration */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-muted-foreground text-sm font-mono opacity-50">
          <span className="text-[#22d3ee]">$</span> data-peek --help
          <span className="inline-block w-2 h-4 bg-[#22d3ee] ml-1 animate-pulse" />
        </div>
      </main>
    </HomeLayout>
  );
}
