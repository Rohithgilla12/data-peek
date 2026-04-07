'use client'

import Image from 'next/image'
import { useState } from 'react'
import { AnimateOnScroll } from '@/components/ui/animate-on-scroll'
import { DataSubstrate } from './data-substrate'
import { ScrambleText } from './scramble-text'
import {
  type Feature,
  heroFeatures,
  strongFeatures,
  solidFeatures,
} from './feature-data'

function HeroCard({ feature }: { feature: Feature }) {
  const isLightning = feature.title === 'Lightning Fast'

  return (
    <div
      className="group relative rounded-xl bg-[--color-surface] border border-[--color-border] overflow-hidden hover:bg-[--color-surface-elevated] transition-all duration-300 h-full flex flex-col"
      style={{
        '--feature-color': feature.color,
        borderTopColor: `${feature.color}66`,
        borderTopWidth: '2px',
      } as React.CSSProperties}
    >
      <div className="p-5 sm:p-6 flex-1">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${feature.hoverEffect ? `effect-${feature.hoverEffect}` : ''}`}
          style={{
            backgroundColor: `${feature.color}15`,
            border: `1px solid ${feature.color}30`,
          }}
        >
          <feature.icon
            className={`w-5 h-5 effect-icon ${feature.hoverEffect === 'color-cycle' ? 'effect-color-cycle-icon' : ''}`}
            style={{ color: feature.color }}
          />
        </div>

        {feature.hoverEffect === 'key-press' && (
          <div className="absolute top-5 right-5 sm:top-6 sm:right-6 hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <kbd className="effect-key-cap text-[9px] px-1.5 py-0.5 rounded bg-[--color-surface-elevated] border border-[--color-border] text-[--color-text-muted] font-mono">⌘</kbd>
            <kbd className="effect-key-cap effect-key-cap-delayed text-[9px] px-1.5 py-0.5 rounded bg-[--color-surface-elevated] border border-[--color-border] text-[--color-text-muted] font-mono">K</kbd>
          </div>
        )}

        <h3 className="text-base font-semibold tracking-tight mb-2">
          {feature.title}
        </h3>
        <p className="text-[13px] text-[--color-text-muted] leading-[1.6]">
          {feature.description}
        </p>

        {isLightning && (
          <div className="mt-4 flex items-baseline gap-2">
            <span
              className="text-4xl font-bold tracking-tighter"
              style={{ color: feature.color }}
            >
              &lt; 2s
            </span>
            <span className="text-xs text-[--color-text-muted]">startup</span>
          </div>
        )}
      </div>

      {feature.screenshot && (
        <div className="border-t border-[--color-border]">
          <Image
            src={feature.screenshot}
            alt={feature.screenshotAlt || feature.title}
            width={600}
            height={400}
            className="w-full h-auto"
            loading="lazy"
            quality={85}
          />
        </div>
      )}
    </div>
  )
}

function FeatureShowcase() {
  const [activeScreenshot, setActiveScreenshot] = useState(
    strongFeatures.find((f) => f.screenshot)?.screenshot || ''
  )
  const [activeAlt, setActiveAlt] = useState(
    strongFeatures.find((f) => f.screenshot)?.screenshotAlt || ''
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-xl overflow-hidden border border-[--color-border] bg-[--color-surface]">
          {activeScreenshot && (
            <Image
              src={activeScreenshot}
              alt={activeAlt}
              width={800}
              height={533}
              className="w-full h-auto transition-opacity duration-200"
              loading="lazy"
              quality={85}
            />
          )}
        </div>
      </div>

      <div className="space-y-0">
        {strongFeatures.map((feature, index) => (
          <div
            key={feature.title}
            className="group flex items-start gap-3 px-4 py-3.5 rounded-lg hover:bg-[--color-surface] transition-colors duration-200 cursor-default"
            style={{
              '--feature-color': feature.color,
            } as React.CSSProperties}
            onMouseEnter={() => {
              if (feature.screenshot) {
                setActiveScreenshot(feature.screenshot)
                setActiveAlt(feature.screenshotAlt || feature.title)
              }
            }}
          >
            <div
              className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 mt-0.5 transition-transform group-hover:scale-110 ${feature.hoverEffect ? `effect-${feature.hoverEffect}` : ''}`}
              style={{
                backgroundColor: `${feature.color}15`,
                border: `1px solid ${feature.color}25`,
              }}
            >
              <feature.icon
                className={`w-4 h-4 effect-icon ${feature.hoverEffect === 'color-cycle' ? 'effect-color-cycle-icon' : ''}`}
                style={{ color: feature.color }}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold tracking-tight">
                  {feature.title}
                </h4>
                {feature.screenshot && (
                  <span className="text-[9px] text-[--color-text-muted] opacity-0 group-hover:opacity-100 transition-opacity">
                    ↙ preview
                  </span>
                )}
              </div>
              <p className="text-xs text-[--color-text-muted] leading-[1.5] mt-0.5">
                {feature.description}
              </p>
            </div>
            {index < strongFeatures.length - 1 && (
              <div className="absolute bottom-0 left-4 right-4" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function CompactCard({ feature }: { feature: Feature }) {
  return (
    <div
      className="group flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[--color-surface]/50 border border-transparent hover:border-[--color-border] hover:bg-[--color-surface] transition-all duration-200"
      style={{
        '--feature-color': feature.color,
        borderLeftColor: `${feature.color}40`,
        borderLeftWidth: '2px',
      } as React.CSSProperties}
    >
      <feature.icon
        className="w-3.5 h-3.5 shrink-0"
        style={{ color: feature.color }}
      />
      <span className="text-[13px] font-medium tracking-tight truncate">
        {feature.title}
      </span>
      <p className="hidden group-hover:block absolute left-0 right-0 -bottom-8 text-[11px] text-[--color-text-muted] px-3 z-10">
        {feature.hoverEffect === 'scramble' ? (
          <ScrambleText text={feature.description} />
        ) : (
          feature.description
        )}
      </p>
    </div>
  )
}

export function FeaturesManifest() {
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

        {/* Band 1: Hero Features */}
        <AnimateOnScroll>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {heroFeatures.map((feature) => (
              <HeroCard key={feature.title} feature={feature} />
            ))}
          </div>
        </AnimateOnScroll>

        {/* Band 2: Strong Features — Showcase + Manifest */}
        <AnimateOnScroll className="mt-16 sm:mt-20">
          <p className="text-[11px] uppercase tracking-[0.25em] text-[--color-text-muted] mb-6 font-medium">
            Power tools
          </p>
          <FeatureShowcase />
        </AnimateOnScroll>

        {/* Band 3: Solid Features — Compact Grid */}
        <AnimateOnScroll className="mt-16 sm:mt-20">
          <p className="text-[11px] uppercase tracking-[0.25em] text-[--color-text-muted] mb-6 font-medium">
            And everything else
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {solidFeatures.map((feature) => (
              <CompactCard key={feature.title} feature={feature} />
            ))}
          </div>
        </AnimateOnScroll>

        {/* Light Mode Closer */}
        {solidFeatures.find((f) => f.screenshot && f.title === 'Dark & Light') && (
          <AnimateOnScroll className="mt-12 sm:mt-16">
            <div className="rounded-xl overflow-hidden border border-[--color-border] screenshot-hover">
              <Image
                src={solidFeatures.find((f) => f.title === 'Dark & Light')!.screenshot!}
                alt="Data Peek in light mode"
                width={1200}
                height={800}
                className="w-full h-auto"
                loading="lazy"
                quality={85}
              />
            </div>
          </AnimateOnScroll>
        )}
      </div>
    </section>
  )
}
