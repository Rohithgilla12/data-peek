'use client'

import Link from 'next/link'
import { Check, Sparkles, Zap, Shield, ZapIcon, Terminal, Globe, Cpu, Github, Heart, Star, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FadeIn, StaggerContainer, StaggerItem } from '@/components/ui/motion-wrapper'
import { CheckoutButton } from "./checkout-button"

const tiers = [
  {
    name: 'Personal',
    price: '$0',
    description: 'Perfect for individual developers and side projects.',
    features: [
      'All features unlocked',
      'AI Assistant (BYOK)',
      'PostgreSQL, MySQL, SQL Server',
      'Unlimited connections',
      'Unlimited query history',
      'All future updates',
    ],
    buttonText: 'Download Free',
    buttonHref: '/download',
    variant: 'outline' as const,
    icon: Terminal,
    color: 'var(--color-text-muted)',
    isCheckout: false,
  },
  {
    name: 'Pro',
    price: '$29',
    oldPrice: '$99',
    description: 'Commercial use and advanced productivity features.',
    features: [
      'Everything in Personal',
      'Commercial use allowed',
      'Use at work & for clients',
      '1 year of updates included',
      '3 device activations',
      'Perpetual fallback license',
      '30-day money-back guarantee',
    ],
    buttonText: 'Get Pro License',
    buttonHref: '/#pricing',
    variant: 'primary' as const,
    featured: true,
    icon: Sparkles,
    color: 'var(--color-accent)',
    isCheckout: true,
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="relative py-32 sm:py-48 overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-10" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
        <FadeIn className="text-center mb-16 sm:mb-24">
          <p className="text-[12px] uppercase tracking-[0.4em] text-[--color-accent] mb-6 font-bold font-mono">
            // Investment
          </p>
          <h2 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.9] mb-8">
            Simple, honest
            <br />
            <span className="text-[--color-text-secondary]">
              Pricing.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-[--color-text-muted] max-w-[50ch] mx-auto px-2 leading-relaxed font-mono">
            Free for personal use. Pay once for commercial use.
            No subscriptions, no tricks. Just great software.
          </p>
        </FadeIn>

        <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {tiers.map((tier) => (
            <StaggerItem
              key={tier.name}
              className={`relative flex flex-col p-8 rounded-[2.5rem] border transition-all duration-500 hover:-translate-y-2 ${
                tier.featured
                  ? 'bg-white/[0.04] border-[--color-accent]/30 shadow-2xl shadow-[--color-accent]/10 border-flow'
                  : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.03]'
              }`}
              style={{ '--feature-color': tier.color } as React.CSSProperties}
            >
              {tier.featured && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-[--color-accent] text-[--color-background] text-[10px] font-bold font-mono uppercase tracking-widest shadow-lg z-20">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" />
                    Early Bird — 70% off
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between mb-8">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: `${tier.color}15`, border: `1px solid ${tier.color}30` }}
                >
                  <tier.icon className="w-6 h-6" style={{ color: tier.color }} />
                </div>
                <div className="text-right">
                  <div className="flex items-baseline gap-2 justify-end">
                    {tier.oldPrice && <span className="text-lg text-[--color-text-muted] line-through font-mono">{tier.oldPrice}</span>}
                    <span className="text-4xl font-bold tracking-tighter">{tier.price}</span>
                  </div>
                  <div className="text-[10px] font-mono text-[--color-text-muted] uppercase tracking-widest">
                    one-time payment
                  </div>
                </div>
              </div>

              <h3 className="text-2xl font-bold mb-2 font-mono uppercase tracking-widest">{tier.name}</h3>
              <p className="text-sm text-[--color-text-muted] mb-8 font-mono leading-relaxed opacity-80">
                {tier.description}
              </p>

              <div className="space-y-4 mb-10 flex-1">
                {tier.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3">
                    <div className="mt-1 p-0.5 rounded-full bg-white/5">
                      <Check className="w-3 h-3 text-[--color-accent]" />
                    </div>
                    <span className="text-[13px] text-[--color-text-secondary] font-mono leading-tight">
                      {feature}
                    </span>
                  </div>
                ))}
              </div>

              {tier.isCheckout ? (
                <CheckoutButton className="w-full rounded-2xl py-6 font-mono uppercase tracking-widest font-bold transition-all duration-500 bg-[--color-accent] text-[--color-background] hover:bg-[--color-accent]/90 shadow-xl shadow-[--color-accent]/20" />
              ) : (
                <Button
                  variant={tier.variant}
                  className="w-full rounded-2xl py-6 font-mono uppercase tracking-widest font-bold bg-white/5 border-white/10 hover:bg-white/10 transition-all duration-500"
                  asChild
                >
                  <Link href={tier.buttonHref}>{tier.buttonText}</Link>
                </Button>
              )}
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Honor System & Bottom Links */}
        <FadeIn className="mt-24 max-w-3xl mx-auto">
          <div className="p-8 rounded-[2rem] bg-white/[0.02] border border-white/5 backdrop-blur-sm">
             <div className="flex flex-col sm:flex-row items-start gap-6">
                <div className="w-12 h-12 rounded-2xl bg-[--color-accent]/10 flex items-center justify-center shrink-0 border border-[--color-accent]/20">
                  <Heart className="w-6 h-6 text-[--color-accent]" />
                </div>
                <div>
                  <h4 className="text-lg font-bold mb-3 font-mono uppercase tracking-widest text-[--color-text-primary]">
                    Honor System Licensing
                  </h4>
                  <p className="text-sm text-[--color-text-secondary] mb-4 font-mono leading-relaxed opacity-80">
                    Inspired by sustainable indie software. No aggressive enforcement, no DRM, no tracking. We trust our fellow developers.
                  </p>
                  <p className="text-sm text-[--color-text-secondary] font-mono opacity-80">
                    <strong>Students & educators:</strong> data-peek is free for you. {" "}
                    <Link href="https://x.com/gillarohith" target="_blank" className="text-[--color-accent] hover:underline">DM me</Link> for a free license.
                  </p>
                </div>
             </div>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-6">
             <Link href="https://github.com/Rohithgilla12/data-peek" target="_blank" className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-mono uppercase tracking-widest text-[--color-text-muted] hover:text-[--color-text-primary] transition-all">
                <Github className="w-3.5 h-3.5" />
                <span>MIT Licensed</span>
             </Link>
             <Link href="https://github.com/sponsors/Rohithgilla12" target="_blank" className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-mono uppercase tracking-widest text-[--color-text-muted] hover:text-[#db61a2] transition-all">
                <Heart className="w-3.5 h-3.5" />
                <span>Sponsor Indie</span>
             </Link>
          </div>
        </FadeIn>
      </div>
    </section>
  )
}
