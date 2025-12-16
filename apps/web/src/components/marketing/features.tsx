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
  Gauge,
  Lock,
  Activity,
  ArrowRight,
} from 'lucide-react'
import Link from 'next/link'

const primaryFeatures = [
  {
    icon: Zap,
    title: 'Lightning Fast',
    description: 'Opens in under 2 seconds with minimal memory footprint.',
    color: '#f59e0b',
  },
  {
    icon: Activity,
    title: 'Performance Indicator',
    description: 'Detect missing indexes, N+1 patterns, and slow queries.',
    color: '#ef4444',
  },
  {
    icon: Gauge,
    title: 'Query Telemetry',
    description: 'Timing breakdown with waterfall visualization and benchmarks.',
    color: '#10b981',
  },
  {
    icon: GitBranch,
    title: 'ER Diagrams',
    description: 'Interactive schema visualization with foreign key relationships.',
    color: '#fb923c',
  },
  {
    icon: Database,
    title: 'Multi-Database',
    description: 'PostgreSQL, MySQL, SQL Server, and SQLite in one client.',
    color: '#22d3ee',
  },
  {
    icon: Lock,
    title: 'SSH Tunnels',
    description: 'Connect securely through bastion hosts with key auth.',
    color: '#8b5cf6',
  },
]

const secondaryFeatures = [
  {
    category: 'Editor',
    items: [
      { icon: Code2, name: 'Monaco Editor', color: '#f472b6' },
      { icon: Command, name: 'Command Palette', color: '#60a5fa' },
      { icon: Keyboard, name: 'Keyboard-First', color: '#94a3b8' },
      { icon: Bookmark, name: 'Saved Queries', color: '#c084fc' },
    ],
  },
  {
    category: 'Data',
    items: [
      { icon: Table2, name: 'Smart Results', color: '#4ade80' },
      { icon: Pencil, name: 'Inline Editing', color: '#fbbf24' },
      { icon: Eye, name: 'Query Plans', color: '#2dd4bf' },
      { icon: FileJson, name: 'Export CSV/JSON', color: '#fb923c' },
    ],
  },
  {
    category: 'Experience',
    items: [
      { icon: Clock, name: 'Query History', color: '#94a3b8' },
      { icon: BarChart3, name: 'AI Charts', color: '#a855f7' },
      { icon: Moon, name: 'Dark & Light', color: '#60a5fa' },
      { icon: Shield, name: 'Privacy-First', color: '#22d3ee' },
    ],
  },
]

export function Features() {
  return (
    <section id="features" className="relative py-24 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-20" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-16 sm:mb-20">
          <p
            className="text-xs uppercase tracking-[0.3em] text-[--color-accent] mb-4"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Features
          </p>
          <h2
            className="text-4xl sm:text-5xl md:text-6xl font-normal tracking-tight mb-5"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Built for developers.
          </h2>
          <p
            className="text-base sm:text-lg text-[--color-text-secondary] max-w-xl mx-auto"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Query your database, not fight your tools.
          </p>
        </div>

        <div className="mb-16 sm:mb-20">
          <div className="relative rounded-2xl border border-[--color-border] bg-gradient-to-br from-[--color-surface] to-[--color-surface-elevated] overflow-hidden">
            <div className="absolute top-0 right-0 w-1/2 h-full opacity-20">
              <div
                className="absolute inset-0"
                style={{
                  background: 'radial-gradient(circle at 70% 30%, #a855f7 0%, transparent 50%)',
                  filter: 'blur(60px)',
                }}
              />
            </div>

            <div className="relative p-8 sm:p-12 md:p-16">
              <div className="flex flex-col md:flex-row md:items-center gap-8 md:gap-12">
                <div className="flex-1">
                  <div
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#a855f7]/10 border border-[#a855f7]/20 text-xs text-[#a855f7] mb-6"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    AI-Powered
                  </div>

                  <h3
                    className="text-3xl sm:text-4xl font-normal mb-4"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    Ask in English,
                    <br />
                    <span className="text-[#a855f7]">get SQL.</span>
                  </h3>

                  <p
                    className="text-[--color-text-secondary] mb-6 max-w-md"
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    Generate queries, charts, and insights from natural language.
                    Schema-aware for accurate results. Bring your own API key.
                  </p>

                  <div
                    className="flex flex-wrap gap-2 text-xs text-[--color-text-muted]"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {['OpenAI', 'Anthropic', 'Google', 'Groq', 'Ollama'].map((provider) => (
                      <span
                        key={provider}
                        className="px-2.5 py-1 rounded-md bg-[--color-surface-elevated] border border-[--color-border]"
                      >
                        {provider}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex-shrink-0 md:w-[280px]">
                  <div className="rounded-xl border border-[--color-border] bg-[--color-background] p-4 shadow-2xl shadow-black/20">
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[--color-border]">
                      <Sparkles className="w-4 h-4 text-[#a855f7]" />
                      <span className="text-xs text-[--color-text-muted]" style={{ fontFamily: 'var(--font-mono)' }}>
                        AI Assistant
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="p-2.5 rounded-lg bg-[--color-surface] text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
                        <span className="text-[--color-text-muted]">&quot;</span>
                        Show me users who signed up last week
                        <span className="text-[--color-text-muted]">&quot;</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[--color-text-muted]">
                        <ArrowRight className="w-3 h-3" />
                        <span style={{ fontFamily: 'var(--font-mono)' }}>Generating SQL...</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {primaryFeatures.map((feature) => (
            <div
              key={feature.title}
              className="group p-6 rounded-xl bg-[--color-surface]/50 border border-[--color-border] hover:border-[--color-border-glow]/50 hover:bg-[--color-surface] transition-all duration-300"
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110"
                style={{
                  backgroundColor: `${feature.color}12`,
                  border: `1px solid ${feature.color}25`,
                }}
              >
                <feature.icon className="w-5 h-5" style={{ color: feature.color }} />
              </div>

              <h4
                className="text-base font-medium mb-1.5"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {feature.title}
              </h4>

              <p
                className="text-sm text-[--color-text-secondary] leading-relaxed"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-16 sm:mt-20 pt-16 sm:pt-20 border-t border-[--color-border]">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12">
            {secondaryFeatures.map((group) => (
              <div key={group.category}>
                <h4
                  className="text-sm text-[--color-text-muted] mb-5 uppercase tracking-wider"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {group.category}
                </h4>
                <div className="space-y-3">
                  {group.items.map((item) => (
                    <div key={item.name} className="flex items-center gap-3 group">
                      <div
                        className="w-8 h-8 rounded-md flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
                        style={{
                          backgroundColor: `${item.color}10`,
                        }}
                      >
                        <item.icon className="w-4 h-4" style={{ color: item.color }} />
                      </div>
                      <span
                        className="text-sm text-[--color-text-secondary] group-hover:text-[--color-text-primary] transition-colors"
                        style={{ fontFamily: 'var(--font-body)' }}
                      >
                        {item.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-20 sm:mt-28">
          <h3
            className="text-2xl sm:text-3xl font-normal text-center mb-10 sm:mb-12"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            See it in action
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                src: 'https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev/ai-assitant.png',
                alt: 'AI Assistant generating charts',
                label: 'AI-generated charts & metrics',
              },
              {
                src: 'https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev/ai-assitant-2.png',
                alt: 'AI Assistant generating SQL queries',
                label: 'Natural language to SQL',
              },
              {
                src: 'https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev/query-telemetry.png',
                alt: 'Query telemetry visualization',
                label: 'Query telemetry & benchmarks',
              },
              {
                src: 'https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev/erd.png',
                alt: 'Interactive ER diagram',
                label: 'ER diagram visualization',
              },
              {
                src: 'https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev/command-bar.png',
                alt: 'Command palette',
                label: 'Command palette (Cmd+K)',
              },
              {
                src: 'https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev/light-mode.png',
                alt: 'Light mode theme',
                label: 'Light mode',
              },
            ].map((screenshot) => (
              <div key={screenshot.label} className="group">
                <div className="aspect-video rounded-xl overflow-hidden border border-[--color-border] hover:border-[--color-border-glow]/50 transition-colors bg-[--color-surface]">
                  <img
                    src={screenshot.src}
                    alt={screenshot.alt}
                    className="w-full h-full object-cover object-top"
                    loading="lazy"
                  />
                </div>
                <p
                  className="mt-3 text-sm text-[--color-text-muted] text-center"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {screenshot.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
