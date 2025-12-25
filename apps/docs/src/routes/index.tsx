import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { generateMetaTags, DOCS_CONFIG } from "@/lib/seo";
import {
  Book,
  ChevronRight,
  Github,
  Zap,
  Keyboard,
  Moon,
} from "lucide-static";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: generateMetaTags({
      title: DOCS_CONFIG.title,
      description: DOCS_CONFIG.description,
      keywords: [
        'data-peek documentation',
        'PostgreSQL client docs',
        'MySQL client docs',
        'SQL client documentation',
        'database client guide',
        'SQL editor documentation',
      ],
    }),
  }),
});

function Icon({
  svg,
  className,
}: {
  svg: string;
  className?: string;
}) {
  const styledSvg = svg.replace(
    /class="[^"]*"/,
    `class="${className ?? ""}"`
  );
  return <span dangerouslySetInnerHTML={{ __html: styledSvg }} />;
}

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
              <Icon svg={Book} className="w-4 h-4" />
              Read the Docs
              <span className="transition-transform group-hover:translate-x-1">
                <Icon svg={ChevronRight} className="w-4 h-4" />
              </span>
            </Link>
            <a
              href="https://github.com/Rohithgilla12/data-peek"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-border text-foreground font-medium text-sm transition-all hover:border-[#22d3ee] hover:text-[#22d3ee]"
            >
              <Icon svg={Github} className="w-4 h-4" />
              View on GitHub
            </a>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="relative z-10 mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="group p-6 rounded-xl border border-border bg-card/50 backdrop-blur transition-all hover:border-[#22d3ee]/30 hover:bg-card">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#22d3ee]/10 text-[#22d3ee] mb-4">
              <Icon svg={Zap} className="w-5 h-5" />
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
              <Icon svg={Keyboard} className="w-5 h-5" />
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
              <Icon svg={Moon} className="w-5 h-5" />
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
