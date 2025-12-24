import { Metadata } from 'next'
import Link from 'next/link'
import { Header } from '@/components/marketing/header'
import { Footer } from '@/components/marketing/footer'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import { generateMetadata as generateSeoMetadata } from '@/lib/seo'
import { ArrowRight } from 'lucide-react'

const alternatives = [
  {
    slug: 'pgadmin',
    name: 'pgAdmin',
    description: 'Compare with pgAdmin - faster startup and better UX.',
    href: '/compare/pgadmin',
  },
  {
    slug: 'dbeaver',
    name: 'DBeaver',
    description: 'Compare with DBeaver - lighter and more focused.',
    href: '/compare/dbeaver',
  },
  {
    slug: 'tableplus',
    name: 'TablePlus',
    description: 'Compare with TablePlus - open source with AI features.',
    href: '/compare/tableplus',
  },
]

export const metadata: Metadata = generateSeoMetadata({
  title: 'Compare data-peek',
  description:
    'Compare data-peek with pgAdmin, DBeaver, and TablePlus. See why developers are switching to data-peek.',
  keywords: [
    'pgAdmin alternative',
    'DBeaver alternative',
    'TablePlus alternative',
    'database client comparison',
    'SQL editor comparison',
  ],
  path: '/compare',
})

export default function ComparePage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="pt-24 sm:pt-32 pb-16 sm:pb-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <Breadcrumbs items={[{ label: 'Compare', href: '/compare' }]} />

          {/* Hero Section */}
          <section className="text-center mb-12 sm:mb-16">
            <h1
              className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight mb-4"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Compare data-peek
            </h1>
            <p className="text-base sm:text-lg text-[--color-text-secondary] max-w-2xl mx-auto">
              See how data-peek compares to other database clients. Faster, lighter, and more focused.
            </p>
          </section>

          {/* Alternatives Grid */}
          <section>
            <div className="grid sm:grid-cols-3 gap-6">
              {alternatives.map((alt) => (
                <Link
                  key={alt.slug}
                  href={alt.href}
                  className="group relative p-6 sm:p-8 rounded-xl sm:rounded-2xl bg-[--color-surface] border border-[--color-border] hover:border-[--color-accent]/40 transition-all duration-300 hover:-translate-y-1"
                >
                  <div className="flex items-start justify-between mb-4">
                    <h2
                      className="text-xl sm:text-2xl font-semibold"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      vs {alt.name}
                    </h2>
                    <ArrowRight className="w-5 h-5 text-[--color-text-muted] group-hover:text-[--color-accent] group-hover:translate-x-1 transition-all" />
                  </div>
                  <p className="text-sm sm:text-base text-[--color-text-secondary]">
                    {alt.description}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}

