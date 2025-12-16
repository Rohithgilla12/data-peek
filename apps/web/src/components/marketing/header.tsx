'use client'

import { Button } from '@/components/ui/button'
import { Database, Github, Menu, Star, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const navLinks = [
  { href: 'https://docs.datapeek.dev/docs', label: 'Docs', external: true },
  { href: '/#features', label: 'Features' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
]

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (isMobileMenuOpen) {
      const handleScroll = () => setIsMobileMenuOpen(false)
      window.addEventListener('scroll', handleScroll)
      return () => window.removeEventListener('scroll', handleScroll)
    }
  }, [isMobileMenuOpen])

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isScrolled && !isMobileMenuOpen
            ? 'bg-[--color-background]/90 backdrop-blur-xl border-b border-[--color-border]'
            : isMobileMenuOpen
              ? 'bg-[--color-background] border-b border-[--color-border]'
              : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex items-center justify-between h-16 md:h-20">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[--color-accent] to-[--color-accent-dim] flex items-center justify-center group-hover:scale-105 transition-transform shadow-lg shadow-[--color-accent]/20">
                <Database className="w-4.5 h-4.5 text-[--color-background]" />
              </div>
              <span
                className="text-lg font-normal tracking-tight"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                data-peek
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-10">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  {...(link.external
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                  className="text-sm text-[--color-text-secondary] hover:text-[--color-text-primary] transition-colors relative group"
                  style={{ fontFamily: 'var(--font-body)' }}
                >
                  {link.label}
                  <span className="absolute -bottom-1 left-0 w-0 h-px bg-[--color-accent] transition-all duration-300 group-hover:w-full" />
                </Link>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-3">
              <Link
                href="https://github.com/Rohithgilla12/data-peek"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm text-[--color-text-secondary] hover:text-[--color-text-primary] hover:bg-[--color-surface] transition-all duration-300"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                <Github className="w-4 h-4" />
                <Star className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Star</span>
              </Link>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/download">Download</Link>
              </Button>
              <Button size="sm" className="shadow-lg shadow-[--color-accent]/20" asChild>
                <Link href="#pricing">Get Pro — $29</Link>
              </Button>
            </div>

            <button
              className="md:hidden p-2.5 text-[--color-text-secondary] hover:text-[--color-text-primary] rounded-lg hover:bg-[--color-surface] transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </nav>
        </div>
      </header>

      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-x-0 top-16 bottom-0 z-[100] overflow-y-auto"
          style={{ backgroundColor: '#050506' }}
        >
          <div className="flex flex-col gap-2 px-6 py-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                {...(link.external
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
                className="text-lg text-[--color-text-secondary] hover:text-[--color-text-primary] transition-colors py-3 border-b border-[--color-border]/50"
                style={{ fontFamily: 'var(--font-display)' }}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="https://github.com/Rohithgilla12/data-peek"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 text-lg text-[--color-text-secondary] hover:text-[--color-text-primary] transition-colors py-3 border-b border-[--color-border]/50"
              style={{ fontFamily: 'var(--font-display)' }}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <Github className="w-5 h-5" />
              <Star className="w-4 h-4" />
              Star on GitHub
            </Link>
            <div className="flex flex-col gap-3 pt-8 mt-4">
              <Button variant="secondary" size="lg" asChild>
                <Link href="/download" onClick={() => setIsMobileMenuOpen(false)}>
                  Download Free
                </Link>
              </Button>
              <Button size="lg" className="shadow-lg shadow-[--color-accent]/20" asChild>
                <Link href="/#pricing" onClick={() => setIsMobileMenuOpen(false)}>
                  Get Pro — $29
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
