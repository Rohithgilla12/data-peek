import Link from "next/link";
import { Database, Github, Twitter } from "lucide-react";

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
  return (
    <footer className="relative border-t border-[--color-border] bg-[--color-surface]/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-6 gap-8 sm:gap-12">
          {/* Brand */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-3 sm:mb-4">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[--color-accent] flex items-center justify-center">
                <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[--color-background]" />
              </div>
              <span
                className="text-base sm:text-lg font-semibold tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                data-peek
              </span>
            </Link>
            <p
              className="text-xs sm:text-sm text-[--color-text-secondary] max-w-xs mb-4 sm:mb-6"
              style={{ fontFamily: "var(--font-body)" }}
            >
              A fast, AI-powered database client for developers who value
              simplicity.
            </p>

            {/* Social Links */}
            <div className="flex items-center gap-3 sm:gap-4">
              <Link
                href="https://github.com/Rohithgilla12/data-peek"
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[--color-surface] border border-[--color-border] flex items-center justify-center text-[--color-text-muted] hover:text-[--color-text-primary] hover:border-[--color-text-muted] transition-colors"
              >
                <Github className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </Link>
              <Link
                href="https://x.com/gillarohith"
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[--color-surface] border border-[--color-border] flex items-center justify-center text-[--color-text-muted] hover:text-[--color-text-primary] hover:border-[--color-text-muted] transition-colors"
              >
                <Twitter className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </Link>
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4
                className="text-[10px] sm:text-xs uppercase tracking-[0.15em] text-[--color-text-muted] mb-3 sm:mb-4"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {category}
              </h4>
              <ul className="space-y-2 sm:space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      {...(typeof link === "object" &&
                      "external" in link &&
                      link.external
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                      className="text-xs sm:text-sm text-[--color-text-secondary] hover:text-[--color-text-primary] transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="mt-10 sm:mt-16 pt-6 sm:pt-8 border-t border-[--color-border] flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4">
          <p
            className="text-xs sm:text-sm text-[--color-text-muted]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            © {new Date().getFullYear()} data-peek. All rights reserved.
          </p>
          <p className="text-xs sm:text-sm text-[--color-text-muted]">
            Made with <span className="text-[--color-error]">♥</span> for
            developers
          </p>
        </div>
      </div>
    </footer>
  );
}
