'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import {
  Sparkles,
  Zap,
  Gauge,
  Activity,
  Shield,
} from 'lucide-react'
import { AnimateOnScroll } from '@/components/ui/animate-on-scroll'
import { DataSubstrate } from './data-substrate'
import { ScrambleText } from './scramble-text'
import { type Feature, features } from './feature-data'

interface Category {
  id: string
  label: string
  icon: typeof Sparkles
  color: string
  features: Feature[]
}

const categories: Category[] = [
  {
    id: 'ai',
    label: 'AI & Intelligence',
    icon: Sparkles,
    color: '#a855f7',
    features: features.filter((f) =>
      ['AI Assistant', 'AI Charts', 'Query Plans'].includes(f.title)
    ),
  },
  {
    id: 'performance',
    label: 'Performance',
    icon: Zap,
    color: '#fbbf24',
    features: features.filter((f) =>
      [
        'Lightning Fast',
        'Query Telemetry',
        'Performance Indicator',
        'Health Monitor',
        'Column Statistics',
      ].includes(f.title)
    ),
  },
  {
    id: 'editor',
    label: 'Editor & Query',
    icon: Gauge,
    color: '#22d3ee',
    features: features.filter((f) =>
      [
        'Monaco Editor',
        'Command Palette',
        'Keyboard-First',
        'Inline Editing',
        'Smart Results',
        'Saved Queries',
        'Query History',
      ].includes(f.title)
    ),
  },
  {
    id: 'data',
    label: 'Data Tools',
    icon: Activity,
    color: '#10b981',
    features: features.filter((f) =>
      [
        'Export Anywhere',
        'CSV Import',
        'Data Generator',
        'Data Masking',
        'ER Diagrams',
        'PG Notifications',
      ].includes(f.title)
    ),
  },
  {
    id: 'infra',
    label: 'Security & Infra',
    icon: Shield,
    color: '#60a5fa',
    features: features.filter((f) =>
      [
        'Privacy-First',
        'SSH Tunnels',
        'Multi-Database',
        'Dark & Light',
      ].includes(f.title)
    ),
  },
]

function FeatureCard({ feature }: { feature: Feature }) {
  const isMultiDB = feature.title === 'Multi-Database'
  const isLightning = feature.title === 'Lightning Fast'

  return (
    <div
      className="group relative p-4 sm:p-5 rounded-xl bg-[--color-surface] border border-[--color-border] hover:bg-[--color-surface-elevated] transition-all duration-300 hover:-translate-y-0.5 h-full"
      style={{
        '--feature-color': feature.color,
      } as React.CSSProperties}
    >
      <div
        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center mb-3 transition-transform group-hover:scale-110 ${feature.hoverEffect ? `effect-${feature.hoverEffect}` : ''}`}
        style={{
          backgroundColor: `${feature.color}15`,
          border: `1px solid ${feature.color}30`,
        }}
      >
        <feature.icon
          className={`w-4 h-4 sm:w-5 sm:h-5 effect-icon ${feature.hoverEffect === 'color-cycle' ? 'effect-color-cycle-icon' : ''}`}
          style={{ color: feature.color }}
        />
      </div>

      {feature.hoverEffect === 'key-press' && (
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <kbd className="effect-key-cap text-[9px] px-1.5 py-0.5 rounded bg-[--color-surface-elevated] border border-[--color-border] text-[--color-text-muted] font-mono">
            ⌘
          </kbd>
          <kbd className="effect-key-cap effect-key-cap-delayed text-[9px] px-1.5 py-0.5 rounded bg-[--color-surface-elevated] border border-[--color-border] text-[--color-text-muted] font-mono">
            K
          </kbd>
        </div>
      )}

      <h3 className="text-sm sm:text-base font-semibold tracking-tight mb-1 sm:mb-1.5">
        {feature.title}
      </h3>
      <p className="text-xs sm:text-[13px] text-[--color-text-muted] leading-[1.6]">
        {feature.hoverEffect === 'scramble' ? (
          <ScrambleText text={feature.description} />
        ) : isMultiDB ? (
          <>
            <Link href="/databases/postgresql" className="text-[--color-accent] hover:underline">PostgreSQL</Link>,{' '}
            <Link href="/databases/mysql" className="text-[--color-accent] hover:underline">MySQL</Link>,{' '}
            <Link href="/databases/sql-server" className="text-[--color-accent] hover:underline">SQL Server</Link>, and{' '}
            <Link href="/databases/sqlite" className="text-[--color-accent] hover:underline">SQLite</Link>.
            One client for all your databases.
          </>
        ) : (
          feature.description
        )}
      </p>

      {isLightning && (
        <div className="mt-3 flex items-baseline gap-2">
          <span
            className="text-2xl font-bold tracking-tighter"
            style={{ color: feature.color }}
          >
            &lt; 2s
          </span>
          <span className="text-[10px] text-[--color-text-muted]">startup</span>
        </div>
      )}

      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10"
        style={{
          background: `radial-gradient(circle at center, ${feature.color}08 0%, transparent 70%)`,
        }}
      />
    </div>
  )
}

function TabContent({ category }: { category: Category }) {
  const screenshotFeatures = category.features.filter((f) => f.screenshot)
  const hasScreenshots = screenshotFeatures.length > 0

  if (!hasScreenshots) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {category.features.map((feature) => (
          <FeatureCard key={feature.title} feature={feature} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Screenshots panel */}
      <div className="lg:col-span-3 space-y-4">
        {screenshotFeatures.map((f) => (
          <div
            key={f.title}
            className="rounded-xl overflow-hidden border border-[--color-border] screenshot-hover bg-[--color-surface]"
          >
            <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center"
                style={{
                  backgroundColor: `${f.color}15`,
                  border: `1px solid ${f.color}25`,
                }}
              >
                <f.icon className="w-3.5 h-3.5" style={{ color: f.color }} />
              </div>
              <span className="text-xs font-semibold tracking-tight">
                {f.title}
              </span>
            </div>
            <Image
              src={f.screenshot!}
              alt={f.screenshotAlt || f.title}
              width={800}
              height={533}
              className="w-full h-auto"
              loading="lazy"
              quality={85}
            />
          </div>
        ))}
      </div>

      {/* Feature cards panel */}
      <div className="lg:col-span-2 grid grid-cols-1 gap-3 content-start">
        {category.features.map((feature) => (
          <FeatureCard key={feature.title} feature={feature} />
        ))}
      </div>
    </div>
  )
}

export function FeaturesTabbed() {
  const [activeTab, setActiveTab] = useState('ai')
  const activeCategory = categories.find((c) => c.id === activeTab)!

  return (
    <section id="features" className="relative py-20 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-30" />
      <DataSubstrate />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
        <AnimateOnScroll className="text-center mb-10 sm:mb-16">
          <p className="text-[11px] uppercase tracking-[0.25em] text-[--color-accent] mb-4 sm:mb-5 font-medium">
            Features
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter leading-[1.05] mb-5 sm:mb-7 px-2">
            Everything you need.
            <br />
            <span className="text-[--color-text-secondary]">
              Nothing you don&apos;t.
            </span>
          </h2>
          <p className="text-sm sm:text-base text-[--color-text-muted] max-w-[48ch] mx-auto px-2 leading-relaxed">
            Built for developers who want to query their database, not fight
            their tools.
          </p>
        </AnimateOnScroll>

        {/* Tab Bar */}
        <AnimateOnScroll className="mb-8 sm:mb-10">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 sm:justify-center">
            {categories.map((cat) => {
              const isActive = activeTab === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveTab(cat.id)}
                  className={`
                    flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-lg text-xs sm:text-[13px] font-medium
                    whitespace-nowrap transition-all duration-200 shrink-0
                    ${
                      isActive
                        ? 'bg-[--color-surface-elevated] text-[--color-text-primary] border border-[--color-border]'
                        : 'text-[--color-text-muted] hover:text-[--color-text-secondary] hover:bg-[--color-surface]/50 border border-transparent'
                    }
                  `}
                  style={
                    isActive
                      ? ({
                          '--feature-color': cat.color,
                          boxShadow: `0 0 0 1px ${cat.color}20, 0 1px 3px ${cat.color}10`,
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  <cat.icon
                    className="w-3.5 h-3.5"
                    style={{ color: isActive ? cat.color : undefined }}
                  />
                  <span>{cat.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-[--color-surface] text-[--color-text-secondary]'
                        : 'bg-transparent text-[--color-text-muted]'
                    }`}
                  >
                    {cat.features.length}
                  </span>
                </button>
              )
            })}
          </div>
        </AnimateOnScroll>

        {/* Active Tab Content */}
        <div
          key={activeTab}
          style={{
            animation: 'fade-in-up 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          <TabContent category={activeCategory} />
        </div>
      </div>
    </section>
  )
}
