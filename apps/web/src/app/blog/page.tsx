import { Metadata } from 'next'
import Link from 'next/link'
import { Header } from '@/components/marketing/header'
import { Footer } from '@/components/marketing/footer'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import { getBlogPosts } from '@/lib/blog'
import { ArrowRight, Calendar, Clock, Terminal, Zap, BookOpen, Sparkles } from 'lucide-react'
import { generateMetadata as generateSeoMetadata } from '@/lib/seo'
import { FadeIn, StaggerContainer, StaggerItem, ScaleIn } from '@/components/ui/motion-wrapper'
import { DataSubstrate } from '@/components/marketing/data-substrate'

export const metadata: Metadata = generateSeoMetadata({
  title: 'Blog',
  description:
    'Technical insights, tutorials, and behind-the-scenes looks at building a modern database client. Learn about SQL optimization, database internals, and developer tooling.',
  keywords: [
    'database blog',
    'SQL tutorials',
    'PostgreSQL tips',
    'database optimization',
    'developer tools',
    'SQL performance',
  ],
  path: '/blog',
})

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function BlogPage() {
  const posts = getBlogPosts()
  const featuredPost = posts[0]
  const otherPosts = posts.slice(1)

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
              <Breadcrumbs items={[{ label: 'Blog', href: '/blog' }]} />
            </div>

            {/* Hero Section */}
            <section className="text-center mb-24 sm:mb-32">
              <div className="flex items-center justify-center gap-3 mb-8">
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 glass-card">
                  <Terminal className="w-3.5 h-3.5 text-(--color-accent)" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-(--color-text-secondary)">
                    Engineering Blog
                  </span>
                </div>
              </div>

              <h1
                className="text-6xl sm:text-8xl md:text-9xl font-bold tracking-tighter leading-[0.8] mb-10 text-white font-mono uppercase"
              >
                The
                <br />
                <span className="text-(--color-text-secondary)">Journal.</span>
              </h1>
              
              <p className="text-base sm:text-xl text-(--color-text-muted) max-w-2xl mx-auto font-mono leading-relaxed">
                Deep dives into database internals, performance optimization,
                and the craft of building professional developer tools.
              </p>
            </section>
          </FadeIn>

          {/* Featured Post */}
          {featuredPost && (
            <FadeIn className="mb-24 sm:mb-32">
              <Link href={`/blog/${featuredPost.slug}`} className="group block">
                <article className="relative overflow-hidden rounded-[3rem] bg-white/[0.03] border border-white/10 hover:bg-white/[0.05] transition-all duration-500 border-flow">
                  <div className="absolute inset-0 bg-gradient-to-br from-(--color-accent)/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  <div className="relative p-8 md:p-16">
                    <div className="flex items-center gap-4 mb-10 font-mono text-[10px] uppercase tracking-widest text-(--color-text-muted)">
                      <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500/50" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                        <div className="w-3 h-3 rounded-full bg-green-500/50" />
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-(--color-accent)">Latest Release</span>
                      <span>~/{featuredPost.slug}.mdx</span>
                    </div>

                    <h2
                      className="text-3xl md:text-6xl font-bold mb-8 text-white group-hover:text-(--color-accent) transition-colors duration-300 font-mono uppercase tracking-tighter leading-tight"
                    >
                      {featuredPost.title}
                    </h2>

                    <p className="text-(--color-text-secondary) text-lg md:text-xl mb-12 max-w-4xl leading-relaxed font-mono opacity-80 group-hover:opacity-100 transition-opacity">
                      {featuredPost.description}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-8 pt-8 border-t border-white/5">
                      <div className="flex flex-wrap items-center gap-6 text-[10px] font-mono uppercase tracking-widest text-(--color-text-muted)">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(featuredPost.date)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>{featuredPost.readingTime}</span>
                        </div>
                        {featuredPost.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 rounded bg-white/5 border border-white/10 text-(--color-text-secondary)"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-3 text-(--color-accent) font-bold font-mono uppercase tracking-widest group-hover:gap-5 transition-all duration-300">
                        <span>Read Entry</span>
                        <ArrowRight className="w-5 h-5" />
                      </div>
                    </div>
                  </div>
                </article>
              </Link>
            </FadeIn>
          )}

          {/* Other Posts Grid */}
          <StaggerContainer className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {otherPosts.map((post) => (
              <StaggerItem key={post.slug}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="group block h-full"
                >
                  <article className="relative h-full p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all duration-500 overflow-hidden border-flow">
                    <div className="flex items-center gap-2 mb-8 font-mono text-[10px] uppercase tracking-widest text-(--color-text-muted) opacity-60 group-hover:opacity-100 transition-opacity">
                      <div className="flex gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-white/20" />
                        <div className="w-2 h-2 rounded-full bg-white/20" />
                        <div className="w-2 h-2 rounded-full bg-white/20" />
                      </div>
                      <span className="ml-2">Entry: {post.slug}</span>
                    </div>

                    <h3
                      className="text-xl sm:text-2xl font-bold mb-4 text-white group-hover:text-(--color-accent) transition-colors font-mono uppercase tracking-tight leading-snug line-clamp-2"
                    >
                      {post.title}
                    </h3>

                    <p className="text-sm sm:text-base text-(--color-text-secondary) mb-8 line-clamp-2 leading-relaxed font-mono opacity-80 group-hover:opacity-100 transition-opacity">
                      {post.description}
                    </p>

                    <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-widest text-(--color-text-muted) mt-auto pt-6 border-t border-white/5">
                      <span>{formatDate(post.date)}</span>
                      <span className="w-1 h-1 rounded-full bg-white/20" />
                      <span>{post.readingTime}</span>
                    </div>

                    <div className="absolute bottom-8 right-8 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300">
                      <ArrowRight className="w-5 h-5 text-(--color-accent)" />
                    </div>
                  </article>
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
