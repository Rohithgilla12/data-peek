import { Metadata } from 'next'
import Link from 'next/link'
import { Header } from '@/components/marketing/header'
import { Footer } from '@/components/marketing/footer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import {
  Download,
  Apple,
  Monitor,
  Terminal,
  Check,
  ArrowRight,
  Cpu,
} from 'lucide-react'
import { generateMetadata as generateSeoMetadata } from '@/lib/seo'

export const metadata: Metadata = generateSeoMetadata({
  title: 'Download data-peek',
  description:
    'Download data-peek for macOS, Windows, or Linux. Free to download, no sign-up required. Start querying your databases in seconds.',
  keywords: [
    'download data-peek',
    'PostgreSQL client download',
    'database client macOS',
    'database client Windows',
    'database client Linux',
    'SQL editor download',
  ],
  path: '/download',
})

const platforms = [
  {
    name: 'macOS',
    icon: Apple,
    description: 'Apple Silicon & Intel',
    variants: [
      {
        label: 'Apple Silicon',
        sublabel: 'M1, M2, M3, M4',
        filename: 'data-peek-mac-arm64.dmg',
        size: '~85 MB',
        recommended: true,
      },
      {
        label: 'Intel',
        sublabel: 'x86_64',
        filename: 'data-peek-mac-x64.dmg',
        size: '~90 MB',
        recommended: false,
      },
    ],
    color: '#a1a1aa',
  },
  {
    name: 'Windows',
    icon: Monitor,
    description: 'Windows 10/11',
    variants: [
      {
        label: 'Installer',
        sublabel: '.exe',
        filename: 'data-peek-win-setup.exe',
        size: '~75 MB',
        recommended: true,
      },
      {
        label: 'Portable',
        sublabel: '.zip',
        filename: 'data-peek-win-portable.zip',
        size: '~80 MB',
        recommended: false,
      },
    ],
    color: '#60a5fa',
  },
  {
    name: 'Linux',
    icon: Terminal,
    description: 'Ubuntu, Debian, Fedora',
    variants: [
      {
        label: 'AppImage',
        sublabel: 'Universal',
        filename: 'data-peek-linux.AppImage',
        size: '~95 MB',
        recommended: true,
      },
      {
        label: '.deb',
        sublabel: 'Debian/Ubuntu',
        filename: 'data-peek-linux.deb',
        size: '~85 MB',
        recommended: false,
      },
    ],
    color: '#fbbf24',
  },
]

const requirements = [
  'macOS 11+ (Big Sur or later)',
  'Windows 10/11 (64-bit)',
  'Linux with glibc 2.31+',
  '4 GB RAM minimum',
  '200 MB disk space',
]

export default function DownloadPage() {
  return (
    <div className="min-h-screen">
      <Header />

      <main className="pt-24 sm:pt-32 pb-16 sm:pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 mb-6">
          <Breadcrumbs items={[{ label: 'Download', href: '/download' }]} />
        </div>
        {/* Hero Section */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 text-center mb-12 sm:mb-20">
          <Badge variant="default" size="lg" className="mb-4 sm:mb-6 text-xs sm:text-sm">
            <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-1.5" />
            v1.0.0 — Latest Release
          </Badge>

          <h1
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-4 sm:mb-6"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Download data-peek
          </h1>

          <p
            className="text-base sm:text-lg text-[--color-text-secondary] max-w-xl mx-auto mb-6 sm:mb-8 px-2"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Free to download. No sign-up required.
            <br className="hidden sm:block" />
            <span className="sm:hidden"> </span>
            Start querying in seconds.
          </p>
        </section>

        {/* Platform Cards */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 mb-12 sm:mb-20">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {platforms.map((platform) => (
              <div
                key={platform.name}
                className="rounded-xl sm:rounded-2xl bg-[--color-surface] border border-[--color-border] p-4 sm:p-6 hover:border-[--color-border] hover:bg-[--color-surface-elevated] transition-all"
              >
                {/* Platform Header */}
                <div className="flex items-center gap-2.5 sm:gap-3 mb-4 sm:mb-6">
                  <div
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center"
                    style={{
                      backgroundColor: `${platform.color}15`,
                      border: `1px solid ${platform.color}30`,
                    }}
                  >
                    <platform.icon
                      className="w-5 h-5 sm:w-6 sm:h-6"
                      style={{ color: platform.color }}
                    />
                  </div>
                  <div>
                    <h3
                      className="text-base sm:text-lg font-medium"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {platform.name}
                    </h3>
                    <p className="text-xs sm:text-sm text-[--color-text-muted]">
                      {platform.description}
                    </p>
                  </div>
                </div>

                {/* Download Variants */}
                <div className="space-y-2 sm:space-y-3">
                  {platform.variants.map((variant) => (
                    <Link
                      key={variant.filename}
                      href="https://github.com/Rohithgilla12/data-peek/releases"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center justify-between p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-[--color-background] border border-[--color-border] hover:border-[--color-accent]/50 hover:bg-[--color-accent]/5 transition-all"
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-[--color-surface] flex items-center justify-center">
                          <Cpu className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[--color-text-muted]" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <span
                              className="text-xs sm:text-sm font-medium"
                              style={{ fontFamily: 'var(--font-display)' }}
                            >
                              {variant.label}
                            </span>
                            {variant.recommended && (
                              <Badge variant="default" size="sm" className="text-[10px] sm:text-xs">
                                Recommended
                              </Badge>
                            )}
                          </div>
                          <span
                            className="text-[10px] sm:text-xs text-[--color-text-muted]"
                            style={{ fontFamily: 'var(--font-mono)' }}
                          >
                            {variant.sublabel} • {variant.size}
                          </span>
                        </div>
                      </div>
                      <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[--color-text-muted] group-hover:text-[--color-accent] transition-colors flex-shrink-0" />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* System Requirements */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 mb-12 sm:mb-20">
          <div className="rounded-xl sm:rounded-2xl bg-[--color-surface] border border-[--color-border] p-5 sm:p-8">
            <h2
              className="text-lg sm:text-xl font-medium mb-4 sm:mb-6"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              System Requirements
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
              {requirements.map((req) => (
                <li key={req} className="flex items-center gap-2 sm:gap-3">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[--color-success]/10 flex items-center justify-center flex-shrink-0">
                    <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[--color-success]" />
                  </div>
                  <span className="text-xs sm:text-sm text-[--color-text-secondary]">{req}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Pro Upsell */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="rounded-xl sm:rounded-2xl bg-gradient-to-r from-[--color-accent]/10 to-transparent border border-[--color-accent]/20 p-5 sm:p-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
              <div>
                <h2
                  className="text-lg sm:text-xl font-medium mb-1.5 sm:mb-2"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Want unlimited everything?
                </h2>
                <p className="text-xs sm:text-sm text-[--color-text-secondary]">
                  Get Pro for unlimited connections, tabs, and advanced features.
                </p>
              </div>
              <Button className="w-full sm:w-auto" asChild>
                <Link href="/#pricing">
                  Get Pro — $29
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
