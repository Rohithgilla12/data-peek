'use client'

import Link from 'next/link'
import { Github, Twitter, Linkedin, Database, Command, Heart } from 'lucide-react'
import { FadeIn } from '@/components/ui/motion-wrapper'

const footerLinks = {
  Product: [
    { label: "Features", href: "/#features" },
    { label: "Pricing", href: "/#pricing" },
    { label: "Download", href: "/download" },
    { label: "Databases", href: "/databases" },
    { label: "Compare", href: "/compare" },
    {
      label: "GitHub",
      href: "https://github.com/Rohithgilla12/data-peek",
      external: true,
    },
  ],
  Databases: [
    { label: "PostgreSQL", href: "/databases/postgresql" },
    { label: "MySQL", href: "/databases/mysql" },
    { label: "SQL Server", href: "/databases/sql-server" },
    { label: "SQLite", href: "/databases/sqlite" },
  ],
  Resources: [
    {
      label: "Documentation",
      href: "https://docs.datapeek.dev/docs",
      external: true,
    },
    { label: "Blog", href: "/blog" },
    { label: "FAQ", href: "/#faq" },
    { label: "Support", href: "mailto:gillarohith1@gmail.com", external: true },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    {
      label: "License (MIT)",
      href: "https://github.com/Rohithgilla12/data-peek/blob/main/LICENSE",
      external: true,
    },
  ],
};

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="relative py-20 overflow-hidden border-t border-white/5 bg-white/[0.01]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-12 mb-16">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-6 group">
              <div className="w-8 h-8 rounded-lg bg-[--color-accent] flex items-center justify-center text-[--color-background] shadow-lg group-hover:scale-110 transition-transform">
                <Database className="w-4 h-4" />
              </div>
              <span className="text-lg font-bold tracking-tight font-mono text-[--color-text-primary]">
                data-peek
              </span>
            </Link>
            <p className="text-sm text-[--color-text-muted] font-mono leading-relaxed mb-8 opacity-80">
              The database client built for developers who want to move fast.
              AI-powered, keyboard-first, and insanely fast.
            </p>
            <div className="flex gap-4">
              <Link href="https://github.com/Rohithgilla12/data-peek" target="_blank" className="p-2 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 text-[--color-text-muted] hover:text-[--color-text-primary] transition-all">
                <Github className="w-5 h-5" />
              </Link>
              <Link href="https://x.com/gillarohith" target="_blank" className="p-2 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 text-[--color-text-muted] hover:text-[--color-text-primary] transition-all">
                <Twitter className="w-5 h-5" />
              </Link>
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-[10px] font-mono uppercase tracking-[0.25em] text-[--color-text-primary] mb-6 font-bold">
                {category}
              </h4>
              <ul className="space-y-4">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      {...('external' in link && link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="text-[11px] font-mono text-[--color-text-muted] hover:text-[--color-accent] transition-colors uppercase tracking-widest"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-12 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
          <p className="text-[10px] font-mono text-[--color-text-muted] uppercase tracking-widest">
            © {currentYear} data-peek. All rights reserved.
          </p>
          <div className="flex items-center gap-2 text-[10px] font-mono text-[--color-text-muted] uppercase tracking-widest">
            <span>Built with</span>
            <Heart className="w-3 h-3 text-pink-500 fill-pink-500" />
            <span>by</span>
            <Link href="https://x.com/gillarohith" target="_blank" className="text-[--color-text-primary] hover:text-[--color-accent]">@gillarohith</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
