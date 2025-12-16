import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Download, Check } from 'lucide-react'

export function CTA() {
  return (
    <section className="relative py-24 sm:py-36 overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="absolute inset-0 mesh-gradient" />

      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] sm:w-[900px] h-[500px] sm:h-[700px] rounded-full animate-pulse-glow"
        style={{
          background: 'radial-gradient(circle, var(--color-accent) 0%, transparent 50%)',
          filter: 'blur(120px)',
          opacity: 0.15,
        }}
      />

      <div
        className="absolute top-1/3 left-1/4 w-[200px] h-[200px] rounded-full"
        style={{
          background: 'radial-gradient(circle, var(--color-accent-secondary) 0%, transparent 60%)',
          filter: 'blur(80px)',
          opacity: 0.1,
        }}
      />

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <h2
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-normal tracking-tight mb-5 sm:mb-7"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Ready to <span className="italic gradient-text-static">peek</span>?
        </h2>
        <p
          className="text-base sm:text-lg md:text-xl text-[--color-text-secondary] max-w-xl mx-auto mb-10 sm:mb-12 px-2"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          Download for free and start querying in seconds.
          <br className="hidden sm:block" />
          <span className="sm:hidden"> </span>
          No sign-up required.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button size="lg" className="w-full sm:w-auto group relative overflow-hidden" asChild>
            <Link href="/download">
              <span className="absolute inset-0 bg-gradient-to-r from-[--color-accent] to-[--color-accent-dim] opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="relative flex items-center gap-2">
                <Download className="w-4 h-4" />
                Download Free
              </span>
            </Link>
          </Button>
          <Button variant="secondary" size="lg" className="w-full sm:w-auto group" asChild>
            <Link href="#pricing">
              <span>Get Pro — $29</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        </div>

        <div
          className="mt-10 sm:mt-14 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-4 sm:gap-8 text-sm text-[--color-text-muted]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <span className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-full bg-[--color-success]/10 flex items-center justify-center">
              <Check className="w-3 h-3 text-[--color-success]" />
            </div>
            No credit card required
          </span>
          <span className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-full bg-[--color-success]/10 flex items-center justify-center">
              <Check className="w-3 h-3 text-[--color-success]" />
            </div>
            30-day money-back guarantee
          </span>
          <span className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-full bg-[--color-success]/10 flex items-center justify-center">
              <Check className="w-3 h-3 text-[--color-success]" />
            </div>
            Works offline
          </span>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[--color-border] to-transparent" />
    </section>
  )
}
