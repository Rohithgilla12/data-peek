"use client";

import { Button } from "@/components/ui/button";
import { Database, Github, Menu, Star, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const navLinks = [
  { href: "https://docs.datapeek.dev/docs", label: "Docs", external: true },
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on scroll
  useEffect(() => {
    if (isMobileMenuOpen) {
      const handleScroll = () => setIsMobileMenuOpen(false);
      window.addEventListener("scroll", handleScroll);
      return () => window.removeEventListener("scroll", handleScroll);
    }
  }, [isMobileMenuOpen]);

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled && !isMobileMenuOpen
            ? "bg-[--color-background]/80 backdrop-blur-xl border-b border-[--color-border]"
            : isMobileMenuOpen
              ? "bg-[--color-background] border-b border-[--color-border]"
              : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-[--color-accent] flex items-center justify-center group-hover:scale-110 transition-transform">
                <Database className="w-4 h-4 text-[--color-background]" />
              </div>
              <span
                className="text-lg font-semibold tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                data-peek
              </span>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  {...(link.external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className="text-sm text-[--color-text-secondary] hover:text-[--color-text-primary] transition-colors"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="hidden md:flex items-center gap-3">
              <Link
                href="https://github.com/Rohithgilla12/data-peek"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[--color-text-secondary] hover:text-[--color-text-primary] hover:bg-[--color-surface] transition-colors"
                style={{ fontFamily: "var(--font-body)" }}
              >
                <Github className="w-4 h-4" />
                <Star className="w-3 h-3" />
                <span className="hidden lg:inline">Star</span>
              </Link>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/download">Download</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="#pricing">Get Pro — $29</Link>
              </Button>
            </div>

            {/* Mobile Menu Toggle */}
            <button
              className="md:hidden p-2 text-[--color-text-secondary] hover:text-[--color-text-primary]"
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

      {/* Mobile Menu - Rendered outside header to avoid backdrop-blur containing block issue */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-x-0 top-16 bottom-0 z-[100] overflow-y-auto"
          style={{ backgroundColor: '#0a0a0b' }}
        >
          <div className="flex flex-col gap-4 px-6 py-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                {...(link.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="text-lg text-[--color-text-secondary] hover:text-[--color-text-primary] transition-colors py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="https://github.com/Rohithgilla12/data-peek"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-lg text-[--color-text-secondary] hover:text-[--color-text-primary] transition-colors py-2"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <Github className="w-5 h-5" />
              <Star className="w-4 h-4" />
              Star on GitHub
            </Link>
            <div className="flex flex-col gap-3 pt-6 mt-4 border-t border-[--color-border]">
              <Button variant="secondary" size="lg" asChild>
                <Link href="/download" onClick={() => setIsMobileMenuOpen(false)}>
                  Download Free
                </Link>
              </Button>
              <Button size="lg" asChild>
                <Link href="/#pricing" onClick={() => setIsMobileMenuOpen(false)}>
                  Get Pro — $29
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
