import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Check,
  Github,
  Heart,
  Shield,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { CheckoutButton } from "./checkout-button";

export function Pricing() {
  return (
    <section id="pricing" className="relative py-20 sm:py-32 overflow-x-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[--color-surface]/50 to-transparent" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center mb-10 sm:mb-16">
          <p
            className="text-xs uppercase tracking-[0.2em] text-[--color-accent] mb-3 sm:mb-4"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Pricing
          </p>
          <h2
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-4 sm:mb-6 px-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Simple, honest pricing.
          </h2>
          <p
            className="text-base sm:text-lg text-[--color-text-secondary] max-w-xl mx-auto px-2"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Free for personal use. Pay once for commercial use.
            <br />
            No subscriptions, no tricks.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto pt-4">
          {/* Personal - Free */}
          <div className="relative rounded-2xl p-6 sm:p-8 bg-[--color-surface] border border-[--color-border] flex flex-col">
            <div className="mb-6">
              <h3
                className="text-xl font-medium mb-4"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Personal
              </h3>
              <div className="flex items-baseline gap-2 mb-2">
                <span
                  className="text-5xl font-bold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  $0
                </span>
                <span className="text-[--color-text-muted]">forever</span>
              </div>
              <p className="text-sm text-[--color-text-secondary]">
                For personal projects, learning, and open source
              </p>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {[
                "All features unlocked",
                "AI Assistant (BYOK)",
                "PostgreSQL, MySQL, SQL Server",
                "Unlimited connections",
                "Unlimited query history",
                "All future updates",
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-3">
                  <Check className="w-4 h-4 text-[--color-success] shrink-0" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>

            <Button variant="secondary" size="lg" className="w-full" asChild>
              <Link href="/download">
                Download Free
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>

          {/* Pro - Highlighted */}
          <div className="relative rounded-2xl flex flex-col overflow-visible">
            {/* Gradient background container */}
            <div className="absolute inset-0 rounded-2xl bg-linear-to-br from-[--color-accent]/20 via-transparent to-[#a855f7]/20" />
            <div className="absolute inset-0 rounded-2xl border border-[--color-accent]/40" />

            {/* Badge */}
            <div className="absolute -top-3.5 inset-x-0 flex justify-center z-20">
              <span
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium bg-background border border-[--color-border] text-white shadow-lg shadow-[--color-accent]/30"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Early Bird — 70% off
              </span>
            </div>

            <div className="relative p-6 sm:p-8 flex flex-col flex-1">
              <div className="mb-6">
                <h3
                  className="text-xl font-medium mb-4"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Pro
                </h3>
                <div className="flex items-baseline gap-3 mb-2">
                  <span
                    className="text-5xl font-bold text-[--color-accent]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    $29
                  </span>
                  <span className="text-xl text-[--color-text-muted] line-through">
                    $99
                  </span>
                  <span className="text-[--color-text-muted]">one-time</span>
                </div>
                <p className="text-sm text-[--color-text-secondary]">
                  For commercial use at work
                </p>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {[
                  "Everything in Personal",
                  "Commercial use allowed",
                  "Use at work & for clients",
                  "1 year of updates included",
                  "3 device activations",
                  "Perpetual fallback license",
                  "30-day money-back guarantee",
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <Check className="w-4 h-4 text-[--color-accent] shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <CheckoutButton className="w-full text-base" />
            </div>
          </div>
        </div>

        {/* Trust badges */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-[--color-text-muted]">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span>No DRM</span>
          </div>
          <div className="w-px h-4 bg-[--color-border]" />
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>30-day refund</span>
          </div>
          <div className="w-px h-4 bg-[--color-border]" />
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4" />
            <span>Indie built</span>
          </div>
        </div>

        {/* Honor System Notice */}
        <div className="mt-10 sm:mt-12 p-5 sm:p-6 rounded-xl bg-[--color-surface] border border-[--color-border] max-w-2xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[--color-accent]/10 flex items-center justify-center shrink-0">
              <Heart className="w-5 h-5 text-[--color-accent]" />
            </div>
            <div>
              <h4
                className="text-base font-medium mb-2"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Honor System Licensing
              </h4>
              <p className="text-sm text-[--color-text-secondary] mb-3">
                Inspired by{" "}
                <Link
                  href="https://yaak.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[--color-accent] hover:underline"
                >
                  Yaak
                </Link>{" "}
                and sustainable indie software. No aggressive enforcement — we
                trust you.
              </p>
              <p className="text-sm text-[--color-text-secondary]">
                <strong>Students & educators:</strong> Use it free!{" "}
                <Link
                  href="https://x.com/gillarohith"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[--color-accent] hover:underline"
                >
                  DM me
                </Link>{" "}
                for a free license.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom links */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="https://github.com/Rohithgilla12/data-peek"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[--color-surface] border border-[--color-border] text-sm text-[--color-text-secondary] hover:text-[--color-text-primary] hover:border-[--color-text-muted] transition-colors"
          >
            <Github className="w-4 h-4" />
            <span>View source — MIT Licensed</span>
          </Link>
          <Link
            href="https://github.com/sponsors/Rohithgilla12"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[--color-surface] border border-[--color-border] text-sm text-[--color-text-secondary] hover:text-[#db61a2] hover:border-[#db61a2]/50 transition-colors"
          >
            <Heart className="w-4 h-4" />
            <span>Sponsor on GitHub</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
