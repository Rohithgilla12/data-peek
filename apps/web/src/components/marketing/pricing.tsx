import { Button } from '@/components/ui/button'
import {
  ArrowRight,
  Check,
  Github,
  Heart,
  Shield,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import { CheckoutButton } from './checkout-button'

export function Pricing() {
  return (
    <section id="pricing" className="relative py-24 sm:py-36 overflow-x-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[--color-surface]/30 to-transparent" />
      <div className="absolute inset-0 mesh-gradient opacity-30" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12 sm:mb-20">
          <p
            className="text-xs uppercase tracking-[0.25em] text-[--color-accent] mb-4 sm:mb-5"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Pricing
          </p>
          <h2
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-normal tracking-tight mb-5 sm:mb-7 px-2"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Simple, honest pricing.
          </h2>
          <p
            className="text-base sm:text-lg text-[--color-text-secondary] max-w-xl mx-auto px-2"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Free for personal use. Pay once for commercial use.
            <br />
            No subscriptions, no tricks.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto pt-6">
          <div className="relative rounded-2xl p-7 sm:p-9 bg-[--color-surface] border border-[--color-border] flex flex-col card-glow">
            <div className="mb-7">
              <h3
                className="text-2xl font-normal mb-5"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Personal
              </h3>
              <div className="flex items-baseline gap-2 mb-3">
                <span
                  className="text-6xl font-normal"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  $0
                </span>
                <span className="text-[--color-text-muted]" style={{ fontFamily: 'var(--font-mono)' }}>forever</span>
              </div>
              <p className="text-sm text-[--color-text-secondary]" style={{ fontFamily: 'var(--font-body)' }}>
                For personal projects, learning, and open source
              </p>
            </div>

            <ul className="space-y-3.5 mb-9 flex-1">
              {[
                'All features unlocked',
                'AI Assistant (BYOK)',
                'PostgreSQL, MySQL, SQL Server',
                'Unlimited connections',
                'Unlimited query history',
                'All future updates',
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-[--color-success]/10 flex items-center justify-center">
                    <Check className="w-3 h-3 text-[--color-success]" />
                  </div>
                  <span className="text-sm" style={{ fontFamily: 'var(--font-body)' }}>{feature}</span>
                </li>
              ))}
            </ul>

            <Button variant="secondary" size="lg" className="w-full group" asChild>
              <Link href="/download">
                Download Free
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>

          <div className="relative rounded-2xl flex flex-col overflow-visible">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[--color-accent]/15 via-transparent to-[--color-accent-secondary]/10" />
            <div className="absolute inset-0 rounded-2xl border border-[--color-accent]/30" />

            <div className="absolute -top-4 inset-x-0 flex justify-center z-20">
              <span
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium bg-[--color-background] border border-[--color-accent]/40 text-white shadow-lg shadow-[--color-accent]/20"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <Sparkles className="w-4 h-4 text-[--color-accent]" />
                Early Bird — 70% off
              </span>
            </div>

            <div className="relative p-7 sm:p-9 flex flex-col flex-1">
              <div className="mb-7">
                <h3
                  className="text-2xl font-normal mb-5"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Pro
                </h3>
                <div className="flex items-baseline gap-3 mb-3">
                  <span
                    className="text-6xl font-normal gradient-text-static"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    $29
                  </span>
                  <span className="text-xl text-[--color-text-muted] line-through" style={{ fontFamily: 'var(--font-mono)' }}>
                    $99
                  </span>
                  <span className="text-[--color-text-muted]" style={{ fontFamily: 'var(--font-mono)' }}>one-time</span>
                </div>
                <p className="text-sm text-[--color-text-secondary]" style={{ fontFamily: 'var(--font-body)' }}>
                  For commercial use at work
                </p>
              </div>

              <ul className="space-y-3.5 mb-9 flex-1">
                {[
                  'Everything in Personal',
                  'Commercial use allowed',
                  'Use at work & for clients',
                  '1 year of updates included',
                  '3 device activations',
                  'Perpetual fallback license',
                  '30-day money-back guarantee',
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-[--color-accent]/10 flex items-center justify-center">
                      <Check className="w-3 h-3 text-[--color-accent]" />
                    </div>
                    <span className="text-sm" style={{ fontFamily: 'var(--font-body)' }}>{feature}</span>
                  </li>
                ))}
              </ul>

              <CheckoutButton className="w-full text-base" />
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-sm text-[--color-text-muted]" style={{ fontFamily: 'var(--font-mono)' }}>
          <div className="flex items-center gap-2.5">
            <Shield className="w-4 h-4" />
            <span>No DRM</span>
          </div>
          <div className="w-px h-4 bg-[--color-border]" />
          <div className="flex items-center gap-2.5">
            <Check className="w-4 h-4" />
            <span>30-day refund</span>
          </div>
          <div className="w-px h-4 bg-[--color-border]" />
          <div className="flex items-center gap-2.5">
            <Heart className="w-4 h-4" />
            <span>Indie built</span>
          </div>
        </div>

        <div className="mt-14 sm:mt-16 p-6 sm:p-8 rounded-2xl bg-[--color-surface] border border-[--color-border] max-w-2xl mx-auto card-glow">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <div className="w-12 h-12 rounded-xl bg-[--color-accent]/10 border border-[--color-accent]/20 flex items-center justify-center shrink-0">
              <Heart className="w-6 h-6 text-[--color-accent]" />
            </div>
            <div>
              <h4
                className="text-lg font-normal mb-3"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Honor System Licensing
              </h4>
              <p className="text-sm text-[--color-text-secondary] mb-4" style={{ fontFamily: 'var(--font-body)' }}>
                Inspired by{' '}
                <Link
                  href="https://yaak.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[--color-accent] hover:underline"
                >
                  Yaak
                </Link>{' '}
                and sustainable indie software. No aggressive enforcement — we
                trust you.
              </p>
              <p className="text-sm text-[--color-text-secondary]" style={{ fontFamily: 'var(--font-body)' }}>
                <strong>Students & educators:</strong> Use it free!{' '}
                <Link
                  href="https://x.com/gillarohith"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[--color-accent] hover:underline"
                >
                  DM me
                </Link>{' '}
                for a free license.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="https://github.com/Rohithgilla12/data-peek"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-[--color-surface] border border-[--color-border] text-sm text-[--color-text-secondary] hover:text-[--color-text-primary] hover:border-[--color-text-muted] transition-all duration-300"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <Github className="w-4 h-4" />
            <span>View source — MIT Licensed</span>
          </Link>
          <Link
            href="https://github.com/sponsors/Rohithgilla12"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-[--color-surface] border border-[--color-border] text-sm text-[--color-text-secondary] hover:text-[#db61a2] hover:border-[#db61a2]/50 transition-all duration-300"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <Heart className="w-4 h-4" />
            <span>Sponsor on GitHub</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
