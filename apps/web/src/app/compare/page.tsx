import { Metadata } from 'next'
import Link from 'next/link'
import { Header } from '@/components/marketing/header'
import { Footer } from '@/components/marketing/footer'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import { generateMetadata as generateSeoMetadata } from '@/lib/seo'
import { ArrowRight, BarChart3 } from 'lucide-react'
import { FadeIn, StaggerContainer, StaggerItem } from '@/components/ui/motion-wrapper'
import { DataSubstrate } from '@/components/marketing/data-substrate'

const alternatives = [
  {
    slug: 'pgadmin',
    name: 'pgAdmin',
    description: 'Stop waiting for pgAdmin to load. data-peek is lighter, faster, and built for modern engineering workflows.',
    href: '/compare/pgadmin',
    color: '#336791',
  },
  {
    slug: 'dbeaver',
    name: 'DBeaver',
    description: 'Ditch the enterprise Java bloat. data-peek offers a focused, clean, and AI-powered experience for modern developers.',
    href: '/compare/dbeaver',
    color: '#fbbf24',
  },
  {
    slug: 'tableplus',
    name: 'TablePlus',
    description: 'Similar philosophy, but data-peek is open source and includes deeper AI-powered integrations.',
    href: '/compare/tableplus',
    color: '#10b981',
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
      <main className="relative pt-32 sm:pt-48 pb-24 overflow-hidden">
        {/* Backgrounds */}
        <div className="absolute inset-0 grid-pattern opacity-20" />
        <DataSubstrate />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
          <FadeIn>
            <div className="mb-12 flex justify-center">
              <Breadcrumbs items={[{ label: 'Compare', href: '/compare' }]} />
            </div>

            {/* Hero Section */}
            <section className="text-center mb-24 sm:mb-32">
              <div className="flex items-center justify-center gap-3 mb-8">
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 glass-card">
                  <BarChart3 className="w-3.5 h-3.5 text-(--color-accent)" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-(--color-text-secondary)">
                    Benchmarked
                  </span>
                </div>
              </div>

              <h1
                className="text-6xl sm:text-8xl md:text-9xl font-bold tracking-tighter leading-[0.8] mb-10 text-white font-mono uppercase"
              >
                The
                <br />
                <span className="text-(--color-text-secondary)">Standard.</span>
              </h1>
              
              <p className="text-base sm:text-xl text-(--color-text-muted) max-w-2xl mx-auto font-mono leading-relaxed">
                See how data-peek stacks up against the competition. 
                Engineered to be faster, lighter, and more productive.
              </p>
            </section>
          </FadeIn>

          {/* Alternatives Grid */}
          <StaggerContainer className="grid sm:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
            {alternatives.map((alt) => (
              <StaggerItem key={alt.slug}>
                <Link
                  href={alt.href}
                  className="group relative p-8 rounded-[2.5rem] bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-all duration-500 border-flow overflow-hidden block h-full"
                  style={{ '--feature-color': alt.color } as React.CSSProperties}
                >
                  <div className="flex items-center justify-between mb-8">
                    <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono uppercase tracking-widest text-(--color-text-muted) group-hover:text-white transition-colors">
                      VS {alt.name}
                    </div>
                    <ArrowRight className="w-5 h-5 text-(--color-text-muted) group-hover:text-(--color-accent) group-hover:translate-x-1 transition-all" />
                  </div>
                  
                  <h2
                    className="text-2xl sm:text-3xl font-bold mb-4 font-mono uppercase tracking-widest text-white"
                  >
                    {alt.name}
                  </h2>
                  <p className="text-sm sm:text-base text-(--color-text-secondary) font-mono leading-relaxed group-hover:text-white/90 transition-colors">
                    {alt.description}
                  </p>

                  <div className="mt-8 flex items-center gap-4 opacity-40 group-hover:opacity-100 transition-opacity duration-500">
                    <div className="h-px flex-1 bg-white/10" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-(--color-accent)">Details</span>
                  </div>
                </Link>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </main>
      <Footer />
    </div>
  )
}
