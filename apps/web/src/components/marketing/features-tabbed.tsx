'use client'

import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import {
  Sparkles,
  Zap,
  Gauge,
  Activity,
  Shield,
} from 'lucide-react'
import { FadeIn, ScaleIn, StaggerContainer, StaggerItem } from '@/components/ui/motion-wrapper'
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
    color: '#6b8cf5',
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
    <StaggerItem className="h-full">
      <div
        className="group relative p-6 rounded-[2rem] bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-all duration-500 h-full border-flow overflow-hidden"
        style={{
          '--feature-color': feature.color,
        } as React.CSSProperties}
      >
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 ${feature.hoverEffect ? `effect-${feature.hoverEffect}` : ''}`}
          style={{
            backgroundColor: `${feature.color}20`,
            border: `1px solid ${feature.color}40`,
          }}
        >
          <feature.icon
            className={`w-6 h-6 effect-icon ${feature.hoverEffect === 'color-cycle' ? 'effect-color-cycle-icon' : ''}`}
            style={{ color: feature.color }}
          />
        </div>

        {feature.hoverEffect === 'key-press' && (
          <div className="absolute top-6 right-6 hidden sm:flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <kbd className="effect-key-cap text-[10px] px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-white font-mono shadow-sm">
              ⌘
            </kbd>
            <kbd className="effect-key-cap effect-key-cap-delayed text-[10px] px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-white font-mono shadow-sm">
              K
            </kbd>
          </div>
        )}

        <h3 className="text-base sm:text-lg font-bold tracking-tight mb-2 font-mono uppercase tracking-widest text-white">
          {feature.title}
        </h3>
        <p className="text-sm text-[--color-text-secondary] leading-relaxed font-mono group-hover:text-white/90 transition-colors">
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
          <div className="mt-4 flex items-baseline gap-2">
            <span
              className="text-3xl font-bold tracking-tighter"
              style={{ color: feature.color }}
            >
              &lt; 2s
            </span>
            <span className="text-xs text-[--color-text-muted] font-mono uppercase tracking-widest group-hover:text-[--color-text-secondary]">startup</span>
          </div>
        )}

        {/* Floating background glow */}
        <div
          className="absolute -inset-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10 blur-2xl"
          style={{
            background: `radial-gradient(circle at center, ${feature.color}15 0%, transparent 70%)`,
          }}
        />
      </div>
    </StaggerItem>
  )
}

function TabContent({ category }: { category: Category }) {
  const screenshotFeatures = category.features.filter((f) => f.screenshot)
  const hasScreenshots = screenshotFeatures.length > 0

  if (!hasScreenshots) {
    return (
      <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {category.features.map((feature) => (
          <FeatureCard key={feature.title} feature={feature} />
        ))}
      </StaggerContainer>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
      {/* Screenshots panel */}
      <div className="lg:col-span-3 space-y-6">
        <AnimatePresence mode="wait">
          {screenshotFeatures.map((f) => (
            <ScaleIn
              key={f.title}
              className="rounded-[2.5rem] overflow-hidden border border-white/10 screenshot-hover bg-[--color-surface] shadow-2xl shadow-black/50"
            >
              <div className="flex items-center gap-3 px-6 pt-6 pb-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    backgroundColor: `${f.color}15`,
                    border: `1px solid ${f.color}25`,
                  }}
                >
                  <f.icon className="w-4 h-4" style={{ color: f.color }} />
                </div>
                <span className="text-sm font-bold tracking-widest font-mono uppercase">
                  {f.title}
                </span>
              </div>
              <Image
                src={f.screenshot!}
                alt={f.screenshotAlt || f.title}
                width={800}
                height={533}
                className="w-full h-auto opacity-90 hover:opacity-100 transition-opacity"
                loading="lazy"
                quality={90}
              />
            </ScaleIn>
          ))}
        </AnimatePresence>
      </div>

      {/* Feature cards panel */}
      <StaggerContainer className="lg:col-span-2 grid grid-cols-1 gap-4 content-start">
        {category.features.map((feature) => (
          <FeatureCard key={feature.title} feature={feature} />
        ))}
      </StaggerContainer>
    </div>
  )
}

export function FeaturesTabbed() {
  const [activeTab, setActiveTab] = useState('ai')
  const activeCategory = categories.find((c) => c.id === activeTab)!

  return (
    <section id="features" className="relative py-32 sm:py-48 overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <DataSubstrate />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
        <FadeIn className="text-center mb-16 sm:mb-24">
          <p className="text-[12px] uppercase tracking-[0.4em] text-[--color-accent] mb-6 font-bold font-mono">
            // Core Engine
          </p>
          <h2 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.9] mb-8">
            Query smarter.
            <br />
            <span className="text-[--color-text-secondary]">
              Move faster.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-[--color-text-muted] max-w-[50ch] mx-auto px-2 leading-relaxed font-mono">
            Engineered for developers who prioritize performance and productivity.
            The only client you'll ever need.
          </p>
        </FadeIn>

        {/* Tab Bar */}
        <div className="mb-12 sm:mb-16">
          <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 sm:justify-center">
            {categories.map((cat) => {
              const isActive = activeTab === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveTab(cat.id)}
                  className={`
                    flex items-center gap-3 px-5 py-3 rounded-2xl text-xs font-bold
                    whitespace-nowrap transition-all duration-300 shrink-0 font-mono uppercase tracking-widest
                    ${
                      isActive
                        ? 'bg-white/10 text-white border border-white/20 shadow-xl'
                        : 'text-[--color-text-secondary] hover:text-white hover:bg-white/[0.04] border border-transparent'
                    }
                  `}
                  style={
                    isActive
                      ? ({
                          '--feature-color': cat.color,
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  <cat.icon
                    className="w-4 h-4"
                    style={{ color: isActive ? cat.color : undefined }}
                  />
                  <span>{cat.label}</span>
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-[--color-accent] text-[--color-background]'
                        : 'bg-white/5 text-[--color-text-muted]'
                    }`}
                  >
                    {cat.features.length}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Active Tab Content */}
        <AnimatePresence mode="wait">
          <FadeIn
            key={activeTab}
          >
            <TabContent category={activeCategory} />
          </FadeIn>
        </AnimatePresence>
      </div>
    </section>
  )
}
