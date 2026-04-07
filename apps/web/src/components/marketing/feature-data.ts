import {
  Zap,
  Keyboard,
  Eye,
  EyeOff,
  Shield,
  Moon,
  Database,
  Code2,
  Table2,
  GitBranch,
  Pencil,
  FileJson,
  FileUp,
  Clock,
  Sparkles,
  BarChart3,
  Command,
  Bookmark,
  Gauge,
  Lock,
  Activity,
  Bell,
  FlaskConical,
} from 'lucide-react'

export type HoverEffect =
  | 'flash'
  | 'orbit'
  | 'rotate'
  | 'wiggle'
  | 'color-cycle'
  | 'slide-swap'
  | 'key-press'
  | 'scramble'

export type FeatureTier = 'hero' | 'strong' | 'solid'

export interface Feature {
  icon: typeof Sparkles
  title: string
  description: string
  color: string
  tier: FeatureTier
  hoverEffect?: HoverEffect
  screenshot?: string
  screenshotAlt?: string
}

const R2 = 'https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev'

export const features: Feature[] = [
  {
    icon: Sparkles,
    title: 'AI Assistant',
    description:
      'Ask questions in plain English, get SQL queries. Generate charts and insights from your data.',
    color: '#a855f7',
    tier: 'hero',
    hoverEffect: 'orbit',
    screenshot: `${R2}/ai-assitant.png`,
    screenshotAlt: 'AI Assistant generating charts and metrics',
  },
  {
    icon: Zap,
    title: 'Lightning Fast',
    description:
      'Opens in under 2 seconds. No splash screens, no waiting. Just you and your data.',
    color: '#fbbf24',
    tier: 'hero',
    hoverEffect: 'flash',
  },
  {
    icon: Command,
    title: 'Command Palette',
    description:
      'Cmd+K to access everything. Find commands, switch connections, run queries instantly.',
    color: '#6b8cf5',
    tier: 'hero',
    hoverEffect: 'key-press',
    screenshot: `${R2}/command-bar.png`,
    screenshotAlt: 'Command palette for quick actions',
  },
  {
    icon: Gauge,
    title: 'Query Telemetry',
    description:
      'Detailed timing breakdown with waterfall visualization. Benchmark mode for P90/P95/P99 stats.',
    color: '#10b981',
    tier: 'strong',
    screenshot: `${R2}/query-telemetry.png`,
    screenshotAlt: 'Query telemetry with waterfall visualization',
  },
  {
    icon: Activity,
    title: 'Health Monitor',
    description:
      'Dashboard with active queries, table sizes, cache hit ratios, and lock detection. Kill queries live.',
    color: '#ef4444',
    tier: 'strong',
  },
  {
    icon: Eye,
    title: 'Performance Indicator',
    description:
      'Detect missing indexes, N+1 patterns, and slow queries. Auto-generated index suggestions.',
    color: '#ef4444',
    tier: 'strong',
  },
  {
    icon: GitBranch,
    title: 'ER Diagrams',
    description:
      'Visualize your schema with interactive diagrams. See relationships at a glance.',
    color: '#fb923c',
    tier: 'strong',
    screenshot: `${R2}/erd.png`,
    screenshotAlt: 'Interactive ER diagram visualization',
  },
  {
    icon: Code2,
    title: 'Monaco Editor',
    description:
      'The same editor engine that powers VS Code. Syntax highlighting, autocomplete, formatting.',
    color: '#f472b6',
    tier: 'strong',
  },
  {
    icon: Pencil,
    title: 'Inline Editing',
    description:
      'Click to edit. Add, update, delete rows directly. Preview SQL before commit.',
    color: '#fbbf24',
    tier: 'strong',
    hoverEffect: 'wiggle',
  },
  {
    icon: BarChart3,
    title: 'AI Charts',
    description:
      'Generate bar, line, pie, and area charts from your data with natural language.',
    color: '#a855f7',
    tier: 'strong',
    screenshot: `${R2}/ai-assitant-2.png`,
    screenshotAlt: 'AI Assistant generating SQL queries',
  },
  {
    icon: Keyboard,
    title: 'Keyboard-First',
    description:
      'Power users can do everything without touching the mouse. Cmd+Enter to run, done.',
    color: '#60a5fa',
    tier: 'solid',
  },
  {
    icon: Table2,
    title: 'Smart Results',
    description:
      'Sortable tables, type indicators, pagination, and one-click cell copying.',
    color: '#4ade80',
    tier: 'solid',
  },
  {
    icon: Eye,
    title: 'Query Plans',
    description:
      'EXPLAIN ANALYZE visualized. See exactly how your database executes queries.',
    color: '#2dd4bf',
    tier: 'solid',
  },
  {
    icon: Bookmark,
    title: 'Saved Queries',
    description:
      'Bookmark your favorite queries. Organize with folders. Quick access when you need them.',
    color: '#c084fc',
    tier: 'solid',
  },
  {
    icon: Clock,
    title: 'Query History',
    description:
      'Every query saved automatically. Search, filter, and re-run past queries instantly.',
    color: '#94a3b8',
    tier: 'solid',
    hoverEffect: 'rotate',
  },
  {
    icon: Lock,
    title: 'SSH Tunnels',
    description:
      'Connect securely through bastion hosts. Password or key-based authentication.',
    color: '#8b5cf6',
    tier: 'solid',
  },
  {
    icon: BarChart3,
    title: 'Column Statistics',
    description:
      'One-click data profiling. Min/max/avg, histograms, top values, null rates per column.',
    color: '#5570d9',
    tier: 'solid',
  },
  {
    icon: EyeOff,
    title: 'Data Masking',
    description:
      'Blur sensitive columns for demos and screenshots. Auto-mask rules with regex patterns.',
    color: '#f59e0b',
    tier: 'solid',
  },
  {
    icon: FileUp,
    title: 'CSV Import',
    description:
      'Import CSV files with auto column mapping, type inference, batch insert, and conflict handling.',
    color: '#10b981',
    tier: 'solid',
  },
  {
    icon: FlaskConical,
    title: 'Data Generator',
    description:
      'Generate realistic fake data with Faker.js. FK-aware, preview before insert, up to 100k rows.',
    color: '#8b5cf6',
    tier: 'solid',
  },
  {
    icon: Bell,
    title: 'PG Notifications',
    description:
      'Subscribe to PostgreSQL LISTEN/NOTIFY channels. Real-time event log with send support.',
    color: '#3b82f6',
    tier: 'solid',
  },
  {
    icon: FileJson,
    title: 'Export Anywhere',
    description:
      'CSV, JSON, copy as SQL. Get your data out in the format you need.',
    color: '#4ade80',
    tier: 'solid',
    hoverEffect: 'slide-swap',
  },
  {
    icon: Moon,
    title: 'Dark & Light',
    description:
      'Beautiful themes that match your system preference. Easy on the eyes, day or night.',
    color: '#60a5fa',
    tier: 'solid',
    screenshot: `${R2}/light-mode.png`,
    screenshotAlt: 'Data Peek in light mode',
  },
  {
    icon: Shield,
    title: 'Privacy-First',
    description:
      'No telemetry, no tracking. Your credentials stay encrypted on your machine.',
    color: '#6b8cf5',
    tier: 'solid',
    hoverEffect: 'scramble',
  },
  {
    icon: Database,
    title: 'Multi-Database',
    description:
      'PostgreSQL, MySQL, SQL Server, and SQLite. One client for all your databases.',
    color: '#fb923c',
    tier: 'solid',
    hoverEffect: 'color-cycle',
  },
]

export const heroFeatures = features.filter((f) => f.tier === 'hero')
export const strongFeatures = features.filter((f) => f.tier === 'strong')
export const solidFeatures = features.filter((f) => f.tier === 'solid')
