import Image from 'next/image'
import Link from 'next/link'
import { AnimateOnScroll } from '@/components/ui/animate-on-scroll'
import { DataSubstrate } from './data-substrate'
import { ScrambleText } from './scramble-text'
import { type Feature, features } from './feature-data'

type BentoSize = 'large' | 'tall' | 'wide' | 'default'

function getBentoSize(feature: Feature): BentoSize {
  if (feature.title === 'AI Assistant') return 'large'
  if (feature.tier === 'strong' && feature.screenshot) return 'tall'
  if (feature.title === 'Health Monitor') return 'wide'
  return 'default'
}

function getBentoClasses(size: BentoSize): string {
  switch (size) {
    case 'large':
      return 'md:col-span-2 md:row-span-2'
    case 'tall':
      return 'md:row-span-2'
    case 'wide':
      return 'md:col-span-2'
    default:
      return ''
  }
}

function BentoCard({ feature }: { feature: Feature }) {
  const size = getBentoSize(feature)
  const isLarge = size === 'large'
  const isTall = size === 'tall'
  const isWide = size === 'wide'
  const hasScreenshot = !!feature.screenshot
  const isLightning = feature.title === 'Lightning Fast'

  return (
    <div
      className={`group relative rounded-xl bg-[--color-surface] border border-[--color-border] overflow-hidden hover:bg-[--color-surface-elevated] transition-all duration-300 hover:-translate-y-0.5 flex flex-col ${getBentoClasses(size)}`}
      style={{
        '--feature-color': feature.color,
      } as React.CSSProperties}
    >
      <div className={`p-4 sm:p-5 ${isLarge ? 'sm:p-6' : ''} flex-1`}>
        <div
          className={`${isLarge ? 'w-11 h-11' : 'w-9 h-9'} sm:${isLarge ? 'w-12 h-12' : 'w-10 h-10'} rounded-lg flex items-center justify-center mb-3 transition-transform group-hover:scale-110 ${feature.hoverEffect ? `effect-${feature.hoverEffect}` : ''}`}
          style={{
            backgroundColor: `${feature.color}15`,
            border: `1px solid ${feature.color}30`,
          }}
        >
          <feature.icon
            className={`${isLarge ? 'w-5 h-5 sm:w-6 sm:h-6' : 'w-4 h-4 sm:w-5 sm:h-5'} effect-icon ${feature.hoverEffect === 'color-cycle' ? 'effect-color-cycle-icon' : ''}`}
            style={{ color: feature.color }}
          />
        </div>

        {feature.hoverEffect === 'key-press' && (
          <div className="absolute top-4 right-4 sm:top-5 sm:right-5 hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <kbd className="effect-key-cap text-[9px] px-1.5 py-0.5 rounded bg-[--color-surface-elevated] border border-[--color-border] text-[--color-text-muted] font-mono">⌘</kbd>
            <kbd className="effect-key-cap effect-key-cap-delayed text-[9px] px-1.5 py-0.5 rounded bg-[--color-surface-elevated] border border-[--color-border] text-[--color-text-muted] font-mono">K</kbd>
          </div>
        )}

        <h3
          className={`${isLarge ? 'text-base sm:text-lg' : 'text-sm sm:text-base'} font-semibold tracking-tight mb-1 sm:mb-1.5`}
        >
          {feature.title}
        </h3>
        <p
          className={`${isLarge ? 'text-[13px] sm:text-sm' : 'text-xs sm:text-[13px]'} text-[--color-text-muted] leading-[1.6]`}
        >
          {feature.hoverEffect === 'scramble' ? (
            <ScrambleText text={feature.description} />
          ) : feature.title === 'Multi-Database' ? (
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
              className="text-3xl sm:text-4xl font-bold tracking-tighter"
              style={{ color: feature.color }}
            >
              &lt; 2s
            </span>
            <span className="text-xs text-[--color-text-muted]">startup</span>
          </div>
        )}
      </div>

      {hasScreenshot && (isLarge || isTall) && (
        <div className="border-t border-[--color-border] mt-auto">
          <Image
            src={feature.screenshot!}
            alt={feature.screenshotAlt || feature.title}
            width={isLarge ? 800 : 600}
            height={isLarge ? 533 : 400}
            className="w-full h-auto"
            loading="lazy"
            quality={85}
          />
        </div>
      )}

      {hasScreenshot && !isLarge && !isTall && feature.tier === 'hero' && (
        <div className="border-t border-[--color-border] mt-auto">
          <Image
            src={feature.screenshot!}
            alt={feature.screenshotAlt || feature.title}
            width={600}
            height={400}
            className="w-full h-auto"
            loading="lazy"
            quality={85}
          />
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

export function FeaturesBento() {
  const orderedFeatures = [
    ...features.filter((f) => f.title === 'AI Assistant'),
    ...features.filter((f) => f.title === 'Lightning Fast'),
    ...features.filter((f) => f.title === 'Command Palette'),
    ...features.filter((f) => f.title === 'Query Telemetry'),
    ...features.filter((f) => f.title === 'ER Diagrams'),
    ...features.filter((f) => f.title === 'Health Monitor'),
    ...features.filter((f) => f.title === 'Monaco Editor'),
    ...features.filter((f) => f.title === 'AI Charts'),
    ...features.filter(
      (f) =>
        f.tier === 'strong' &&
        !['AI Assistant', 'Lightning Fast', 'Command Palette', 'Query Telemetry', 'ER Diagrams', 'Health Monitor', 'Monaco Editor', 'AI Charts'].includes(f.title)
    ),
    ...features.filter((f) => f.tier === 'solid'),
  ]

  return (
    <section id="features" className="relative py-20 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-30" />
      <DataSubstrate />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
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

        {/* Bento Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {orderedFeatures.map((feature, index) => (
            <AnimateOnScroll key={feature.title} delay={(index % 4) * 60}>
              <BentoCard feature={feature} />
            </AnimateOnScroll>
          ))}
        </div>
      </div>
    </section>
  )
}
