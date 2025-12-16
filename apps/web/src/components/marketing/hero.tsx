import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Github, Zap, Download, Sparkles, Terminal } from 'lucide-react'

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-40" />
      <div className="absolute inset-0 noise-overlay" />
      <div className="absolute inset-0 scanlines" />
      <div className="absolute inset-0 mesh-gradient animate-pulse-glow" />

      <div
        className="absolute top-1/4 -left-48 w-[500px] h-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, var(--color-accent) 0%, transparent 60%)',
          filter: 'blur(120px)',
          opacity: 0.15,
        }}
      />
      <div
        className="absolute top-1/3 -right-48 w-[400px] h-[400px] rounded-full"
        style={{
          background: 'radial-gradient(circle, var(--color-accent-secondary) 0%, transparent 60%)',
          filter: 'blur(100px)',
          opacity: 0.1,
        }}
      />
      <div
        className="absolute bottom-1/4 left-1/3 w-[300px] h-[300px] rounded-full"
        style={{
          background: 'radial-gradient(circle, #8b5cf6 0%, transparent 60%)',
          filter: 'blur(80px)',
          opacity: 0.08,
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-28 sm:pt-36 pb-16 sm:pb-20">
        <div className="flex flex-col items-center text-center">
          <div className="animate-fade-in-down flex flex-wrap items-center justify-center gap-3 mb-10">
            <Badge variant="default" size="lg" className="animate-border-glow">
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Early Bird — 70% off
            </Badge>
            <Badge variant="secondary" size="lg">
              <Github className="w-3.5 h-3.5 mr-1.5" />
              Open Source
            </Badge>
          </div>

          <h1
            className="animate-blur-in delay-100 text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] xl:text-[6.5rem] font-normal tracking-tight leading-[0.95] mb-6 sm:mb-8 text-balance"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Peek at your data.
            <br />
            <span className="gradient-text italic">Fast. With AI.</span>
          </h1>

          <p
            className="animate-fade-in-up delay-200 text-base sm:text-lg md:text-xl text-[--color-text-secondary] max-w-2xl mb-10 sm:mb-12 leading-relaxed px-2"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            A lightning-fast database client with AI-powered querying.
            PostgreSQL, MySQL, SQL Server, and SQLite. Open source, free for personal use.
          </p>

          <div
            className="animate-fade-in-up delay-300 mb-12 relative group"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <div className="absolute -inset-px rounded-full bg-gradient-to-r from-[--color-accent]/30 via-transparent to-[--color-accent-secondary]/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm" />
            <div className="relative px-5 sm:px-8 py-3.5 rounded-full bg-[--color-surface]/80 backdrop-blur-sm border border-[--color-border] inline-flex flex-wrap sm:flex-nowrap items-center justify-center gap-4 sm:gap-6">
              <span className="flex items-center gap-2.5 text-xs sm:text-sm">
                <div className="w-6 h-6 rounded-lg bg-[#a855f7]/15 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-[#a855f7]" />
                </div>
                <span className="text-[--color-text-muted]">AI-powered</span>
              </span>
              <span className="hidden sm:block w-px h-5 bg-[--color-border]" />
              <span className="flex items-center gap-2.5 text-xs sm:text-sm">
                <div className="w-6 h-6 rounded-lg bg-[--color-warning]/15 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-[--color-warning]" />
                </div>
                <span className="text-[--color-text-muted]">&lt; 2s startup</span>
              </span>
              <span className="hidden sm:block w-px h-5 bg-[--color-border]" />
              <span className="flex items-center gap-2.5 text-xs sm:text-sm">
                <div className="w-6 h-6 rounded-lg bg-[--color-accent]/15 flex items-center justify-center">
                  <Terminal className="w-3.5 h-3.5 text-[--color-accent]" />
                </div>
                <span className="text-[--color-text-muted]">keyboard-first</span>
              </span>
            </div>
          </div>

          <div className="animate-fade-in-up delay-400 flex flex-col sm:flex-row items-center gap-4">
            <Button size="lg" className="group relative overflow-hidden" asChild>
              <Link href="/download">
                <span className="absolute inset-0 bg-gradient-to-r from-[--color-accent] to-[--color-accent-dim] opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="relative flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Download Free
                </span>
              </Link>
            </Button>
            <Button variant="secondary" size="lg" className="group" asChild>
              <Link href="/#pricing">
                <span>Get Pro — $29</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>

          <p
            className="animate-fade-in-up delay-500 mt-7 text-sm text-[--color-text-muted] flex items-center gap-3"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[--color-text-muted]" />
              macOS
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[--color-text-muted]" />
              Windows
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[--color-text-muted]" />
              Linux
            </span>
          </p>

          <div className="animate-scale-in delay-700 mt-12 sm:mt-20 w-full max-w-5xl">
            <div className="relative group">
              <div className="absolute -inset-1 sm:-inset-2 rounded-2xl sm:rounded-3xl bg-gradient-to-b from-[--color-accent]/20 via-transparent to-[--color-accent-secondary]/10 opacity-60 group-hover:opacity-100 transition-opacity duration-500 blur-xl" />

              <div className="relative rounded-xl sm:rounded-2xl overflow-hidden border border-[--color-border] shadow-2xl shadow-black/60">
                <img
                  src="https://pub-84538e6ab6f94b80b94b8aa308ad1270.r2.dev/hero.png"
                  alt="Data Peek - SQL client with AI-powered querying"
                  className="w-full h-auto"
                  loading="eager"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[--color-background] to-transparent pointer-events-none" />
    </section>
  )
}
