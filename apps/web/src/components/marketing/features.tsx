import {
  Zap,
  Keyboard,
  Eye,
  Shield,
  Moon,
  Database,
  Code2,
  Table2,
  GitBranch,
  Pencil,
  FileJson,
  Clock,
  Sparkles,
  BarChart3,
  Command,
  Bookmark,
} from 'lucide-react'

const features = [
  {
    icon: Sparkles,
    title: 'AI Assistant',
    description: 'Ask questions in plain English, get SQL queries. Generate charts and insights from your data.',
    color: '#a855f7',
    highlight: true,
  },
  {
    icon: Zap,
    title: 'Lightning Fast',
    description: 'Opens in under 2 seconds. No splash screens, no waiting. Just you and your data.',
    color: '#fbbf24',
  },
  {
    icon: Command,
    title: 'Command Palette',
    description: 'Cmd+K to access everything. Find commands, switch connections, run queries instantly.',
    color: '#22d3ee',
  },
  {
    icon: Keyboard,
    title: 'Keyboard-First',
    description: 'Power users can do everything without touching the mouse. Cmd+Enter to run, done.',
    color: '#60a5fa',
  },
  {
    icon: Code2,
    title: 'Monaco Editor',
    description: 'The same editor engine that powers VS Code. Syntax highlighting, autocomplete, formatting.',
    color: '#f472b6',
  },
  {
    icon: Table2,
    title: 'Smart Results',
    description: 'Sortable tables, type indicators, pagination, and one-click cell copying.',
    color: '#4ade80',
  },
  {
    icon: GitBranch,
    title: 'ER Diagrams',
    description: 'Visualize your schema with interactive diagrams. See relationships at a glance.',
    color: '#fb923c',
  },
  {
    icon: Pencil,
    title: 'Inline Editing',
    description: 'Click to edit. Add, update, delete rows directly. Preview SQL before commit.',
    color: '#fbbf24',
  },
  {
    icon: Bookmark,
    title: 'Saved Queries',
    description: 'Bookmark your favorite queries. Organize with folders. Quick access when you need them.',
    color: '#c084fc',
  },
  {
    icon: Eye,
    title: 'Query Plans',
    description: 'EXPLAIN ANALYZE visualized. See exactly how your database executes queries.',
    color: '#2dd4bf',
  },
  {
    icon: BarChart3,
    title: 'AI Charts',
    description: 'Generate bar, line, pie, and area charts from your data with natural language.',
    color: '#a855f7',
  },
  {
    icon: Clock,
    title: 'Query History',
    description: 'Every query saved automatically. Search, filter, and re-run past queries instantly.',
    color: '#94a3b8',
  },
  {
    icon: FileJson,
    title: 'Export Anywhere',
    description: 'CSV, JSON, copy as SQL. Get your data out in the format you need.',
    color: '#4ade80',
  },
  {
    icon: Moon,
    title: 'Dark & Light',
    description: 'Beautiful themes that match your system preference. Easy on the eyes, day or night.',
    color: '#60a5fa',
  },
  {
    icon: Shield,
    title: 'Privacy-First',
    description: 'No telemetry, no tracking. Your credentials stay encrypted on your machine.',
    color: '#22d3ee',
  },
  {
    icon: Database,
    title: 'Multi-Database',
    description: 'PostgreSQL, MySQL, and SQL Server. One client for all your databases.',
    color: '#fb923c',
  },
]

export function Features() {
  return (
    <section id="features" className="relative py-20 sm:py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 grid-pattern opacity-50" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center mb-12 sm:mb-20">
          <p
            className="text-xs uppercase tracking-[0.2em] text-[--color-accent] mb-3 sm:mb-4"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Features
          </p>
          <h2
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-4 sm:mb-6 px-2"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Everything you need.
            <br />
            <span className="text-[--color-text-secondary]">Nothing you don&apos;t.</span>
          </h2>
          <p
            className="text-base sm:text-lg text-[--color-text-secondary] max-w-2xl mx-auto px-2"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Built for developers who want to query their database, not fight their tools.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group relative p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-[--color-surface] border border-[--color-border] hover:border-[--color-border] hover:bg-[--color-surface-elevated] transition-all duration-300 hover:-translate-y-1"
              style={{
                animationDelay: `${index * 50}ms`,
              }}
            >
              {/* Icon */}
              <div
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center mb-3 sm:mb-4 transition-transform group-hover:scale-110"
                style={{
                  backgroundColor: `${feature.color}15`,
                  border: `1px solid ${feature.color}30`,
                }}
              >
                <feature.icon
                  className="w-4 h-4 sm:w-5 sm:h-5"
                  style={{ color: feature.color }}
                />
              </div>

              {/* Content */}
              <h3
                className="text-base sm:text-lg font-medium mb-1.5 sm:mb-2"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {feature.title}
              </h3>
              <p
                className="text-xs sm:text-sm text-[--color-text-secondary] leading-relaxed"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {feature.description}
              </p>

              {/* Hover Glow */}
              <div
                className="absolute inset-0 rounded-xl sm:rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10"
                style={{
                  background: `radial-gradient(circle at center, ${feature.color}08 0%, transparent 70%)`,
                }}
              />
            </div>
          ))}
        </div>

        {/* Feature Screenshots */}
        <div className="mt-16 sm:mt-24 grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {/* AI Assistant Screenshot - Charts */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#a855f7]/10 border border-[#a855f7]/20 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#a855f7]" />
              </div>
              <h3
                className="text-base sm:text-lg font-medium"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                AI Charts & Metrics
              </h3>
            </div>
            <div className="rounded-lg sm:rounded-xl overflow-hidden border border-[--color-border]">
              <img
                src="https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev/ai-assitant.png"
                alt="AI Assistant generating charts and metrics"
                className="w-full h-auto"
                loading="lazy"
              />
            </div>
          </div>

          {/* AI Assistant Screenshot - Queries */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[--color-accent]/10 border border-[--color-accent]/20 flex items-center justify-center">
                <Code2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[--color-accent]" />
              </div>
              <h3
                className="text-base sm:text-lg font-medium"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                AI Query Generation
              </h3>
            </div>
            <div className="rounded-lg sm:rounded-xl overflow-hidden border border-[--color-border]">
              <img
                src="https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev/ai-assitant-2.png"
                alt="AI Assistant generating SQL queries"
                className="w-full h-auto"
                loading="lazy"
              />
            </div>
          </div>
        </div>

        {/* Second row of screenshots */}
        <div className="mt-6 sm:mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {/* ER Diagram Screenshot */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#fb923c]/10 border border-[#fb923c]/20 flex items-center justify-center">
                <GitBranch className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#fb923c]" />
              </div>
              <h3
                className="text-base sm:text-lg font-medium"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                ER Diagrams
              </h3>
            </div>
            <div className="rounded-lg sm:rounded-xl overflow-hidden border border-[--color-border]">
              <img
                src="https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev/erd.png"
                alt="Interactive ER diagram visualization"
                className="w-full h-auto"
                loading="lazy"
              />
            </div>
          </div>

          {/* Command Palette Screenshot */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#22d3ee]/10 border border-[#22d3ee]/20 flex items-center justify-center">
                <Command className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#22d3ee]" />
              </div>
              <h3
                className="text-base sm:text-lg font-medium"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Command Palette
              </h3>
            </div>
            <div className="rounded-lg sm:rounded-xl overflow-hidden border border-[--color-border]">
              <img
                src="https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev/command-bar.png"
                alt="Command palette for quick actions"
                className="w-full h-auto"
                loading="lazy"
              />
            </div>
          </div>
        </div>

        {/* Third row - Light Mode */}
        <div className="mt-6 sm:mt-8">
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#60a5fa]/10 border border-[#60a5fa]/20 flex items-center justify-center">
                <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#60a5fa]" />
              </div>
              <h3
                className="text-base sm:text-lg font-medium"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Light Mode
              </h3>
            </div>
            <div className="rounded-lg sm:rounded-xl overflow-hidden border border-[--color-border]">
              <img
                src="https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev/light-mode.png"
                alt="Data Peek in light mode"
                className="w-full h-auto"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
