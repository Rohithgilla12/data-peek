'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Github, Menu, X, Command, Database, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'

const navLinks = [
  { href: "https://docs.datapeek.dev/docs", label: "Docs", external: true },
  { href: "/blog", label: "Blog" },
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

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

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled ? 'py-3' : 'py-6'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <nav
          className={`flex items-center justify-between px-6 py-2 rounded-2xl transition-all duration-500 ${
            isScrolled ? 'glass' : 'bg-transparent border-transparent'
          }`}
        >
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative">
              <div className="absolute -inset-1 rounded-lg bg-[--color-accent] opacity-20 blur group-hover:opacity-40 transition-opacity" />
              <div className="relative w-8 h-8 rounded-lg bg-[--color-accent] flex items-center justify-center text-[--color-background] shadow-lg">
                <Database className="w-4 h-4" />
              </div>
            </div>
            <span className="text-lg font-bold tracking-tight font-mono">
              data-peek
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="text-xs font-medium text-[--color-text-secondary] hover:text-white transition-colors font-mono uppercase tracking-widest"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Link
              href="https://github.com/Rohithgilla12/data-peek"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors text-[--color-text-muted] hover:text-[--color-text-primary]"
            >
              <Github className="w-5 h-5" />
              <Star className="w-4 h-4" />
            </Link>
            <Button variant="ghost" size="sm" className="hidden sm:flex rounded-xl font-mono text-xs uppercase tracking-wider" asChild>
              <Link href="/download">Download</Link>
            </Button>
            <Button size="sm" className="rounded-xl font-mono bg-[--color-accent] hover:bg-[--color-accent]/90 text-[--color-background] border-none text-xs uppercase tracking-wider font-bold" asChild>
              <Link href="/#pricing">Get Pro</Link>
            </Button>

            {/* Mobile Menu Toggle */}
            <button
              className="md:hidden p-2 rounded-lg hover:bg-white/5 transition-colors text-[--color-text-secondary]"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden absolute top-full left-4 right-4 mt-2 glass rounded-3xl border border-white/10 overflow-hidden shadow-2xl"
          >
            <div className="px-6 py-8 flex flex-col gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-lg font-medium text-[--color-text-secondary] font-mono uppercase tracking-widest"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <hr className="border-white/5" />
              <div className="flex flex-col gap-4">
                <Button variant="secondary" className="w-full rounded-2xl py-6 font-mono uppercase tracking-widest" asChild>
                  <Link href="/download">Download Free</Link>
                </Button>
                <Button className="w-full rounded-2xl py-6 bg-[--color-accent] text-[--color-background] font-mono uppercase tracking-widest font-bold" asChild>
                  <Link href="/#pricing">Get Pro — $29</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
