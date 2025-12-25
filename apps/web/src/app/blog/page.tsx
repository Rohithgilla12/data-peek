import { Metadata } from 'next'
import Link from 'next/link'
import { Header } from '@/components/marketing/header'
import { Footer } from '@/components/marketing/footer'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import { getBlogPosts } from '@/lib/blog'
import { ArrowRight, Calendar, Clock, Terminal, Zap } from 'lucide-react'
import { generateMetadata as generateSeoMetadata } from '@/lib/seo'

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
      <main className="pt-20 md:pt-24">
        <div className="max-w-6xl mx-auto px-6 mb-6">
          <Breadcrumbs items={[{ label: 'Blog', href: '/blog' }]} />
        </div>
        <section className="relative py-16 md:py-24 overflow-hidden">
          <div className="absolute inset-0 grid-pattern opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[--color-background]" />

          <div className="absolute top-20 left-1/4 w-96 h-96 bg-[--color-accent]/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-[--color-accent]/3 rounded-full blur-3xl pointer-events-none" />

          <div className="relative max-w-6xl mx-auto px-6">
            <div className="animate-fade-in-up">
              <div className="flex items-center gap-3 mb-8">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[--color-surface] border border-[--color-border] text-xs text-[--color-text-muted]">
                  <Terminal className="w-3 h-3 text-[--color-accent]" />
                  <span className="font-medium">Engineering Blog</span>
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-[--color-border] to-transparent max-w-32" />
              </div>

              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                <div>
                  <h1
                    className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tighter mb-4"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    <span className="text-[--color-text-muted] opacity-60">$</span>
                    <span className="bg-gradient-to-r from-[--color-text-primary] via-[--color-text-primary] to-[--color-accent] bg-clip-text text-transparent"> blog</span>
                    <span className="inline-block w-3 h-8 md:h-12 bg-[--color-accent] ml-2 terminal-cursor" />
                  </h1>
                  <p className="text-base md:text-lg text-[--color-text-secondary] max-w-xl leading-relaxed">
                    Deep dives into database internals, performance optimization,
                    and the craft of building developer tools.
                  </p>
                </div>

                <div className="hidden lg:flex items-center gap-4 text-sm text-[--color-text-muted]">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[--color-surface]/50 border border-[--color-border-subtle]">
                    <Zap className="w-3.5 h-3.5 text-[--color-warning]" />
                    <span>{posts.length} articles</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-8 md:py-12">
          <div className="max-w-6xl mx-auto px-6">
            {posts.length === 0 ? (
              <div className="text-center py-24">
                <div className="relative inline-block mb-8">
                  <div className="absolute inset-0 bg-[--color-accent]/20 blur-2xl rounded-full" />
                  <div className="relative w-20 h-20 rounded-2xl bg-[--color-surface] border border-[--color-border] flex items-center justify-center">
                    <Terminal className="w-8 h-8 text-[--color-accent]" />
                  </div>
                </div>
                <h2
                  className="text-2xl font-semibold mb-3"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Initializing...
                </h2>
                <p className="text-[--color-text-secondary] max-w-md mx-auto">
                  Content pipeline warming up. Check back soon for technical deep dives.
                </p>
              </div>
            ) : (
              <div className="space-y-16">
                {featuredPost && (
                  <div className="animate-fade-in-up">
                    <div className="flex items-center gap-3 mb-6">
                      <span className="px-2 py-1 text-[10px] uppercase tracking-widest font-semibold text-[--color-accent] bg-[--color-accent]/10 rounded border border-[--color-accent]/20">
                        Latest
                      </span>
                      <div className="h-px flex-1 bg-[--color-border-subtle]" />
                    </div>

                    <Link href={`/blog/${featuredPost.slug}`} className="group block">
                      <article className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[--color-surface] to-[--color-surface-elevated] border border-[--color-border] hover:border-[--color-accent]/40 transition-all duration-500">
                        <div className="absolute inset-0 bg-gradient-to-br from-[--color-accent]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <div className="absolute top-0 right-0 w-64 h-64 bg-[--color-accent]/5 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2 group-hover:bg-[--color-accent]/10 transition-colors duration-500" />

                        <div className="relative p-8 md:p-12">
                          <div className="flex items-center gap-2 mb-6 font-mono text-xs text-[--color-text-muted]">
                            <div className="flex gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(248, 113, 113, 0.6)' }} />
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(251, 191, 36, 0.6)' }} />
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgba(74, 222, 128, 0.6)' }} />
                            </div>
                            <span className="ml-2 opacity-60">~/{featuredPost.slug}.mdx</span>
                          </div>

                          <h2
                            className="text-2xl md:text-4xl font-bold mb-4 group-hover:text-[--color-accent] transition-colors duration-300"
                            style={{ fontFamily: 'var(--font-display)' }}
                          >
                            {featuredPost.title}
                          </h2>

                          <p className="text-[--color-text-secondary] text-lg mb-8 max-w-3xl leading-relaxed">
                            {featuredPost.description}
                          </p>

                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex flex-wrap items-center gap-4 text-sm text-[--color-text-muted]">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                <span>{formatDate(featuredPost.date)}</span>
                              </div>
                              <div className="w-1 h-1 rounded-full bg-[--color-border]" />
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                <span>{featuredPost.readingTime}</span>
                              </div>
                              {featuredPost.tags.length > 0 && (
                                <>
                                  <div className="w-1 h-1 rounded-full bg-[--color-border]" />
                                  <div className="flex gap-2">
                                    {featuredPost.tags.slice(0, 2).map((tag) => (
                                      <span
                                        key={tag}
                                        className="px-2 py-0.5 text-xs rounded bg-[--color-surface-elevated] border border-[--color-border-subtle]"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[--color-accent] font-medium group-hover:gap-3 transition-all duration-300">
                              <span>Read article</span>
                              <ArrowRight className="w-4 h-4" />
                            </div>
                          </div>
                        </div>
                      </article>
                    </Link>
                  </div>
                )}

                {otherPosts.length > 0 && (
                  <div>
                    <div className="flex items-center gap-3 mb-8">
                      <span className="text-sm text-[--color-text-muted] font-medium">All Posts</span>
                      <div className="h-px flex-1 bg-[--color-border-subtle]" />
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      {otherPosts.map((post, index) => (
                        <Link
                          key={post.slug}
                          href={`/blog/${post.slug}`}
                          className="group block animate-fade-in-up"
                          style={{ animationDelay: `${(index + 1) * 100}ms` }}
                        >
                          <article className="relative h-full p-6 rounded-xl bg-[--color-surface] border border-[--color-border] hover:border-[--color-accent]/30 transition-all duration-300 hover:translate-y-[-2px]">
                            <div className="flex items-center gap-2 mb-4 font-mono text-xs text-[--color-text-muted]">
                              <div className="flex gap-1">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(248, 113, 113, 0.5)' }} />
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(251, 191, 36, 0.5)' }} />
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'rgba(74, 222, 128, 0.5)' }} />
                              </div>
                              <span className="ml-1 opacity-60">{post.slug}.mdx</span>
                            </div>

                            <h3
                              className="text-lg font-semibold mb-2 group-hover:text-[--color-accent] transition-colors line-clamp-2"
                              style={{ fontFamily: 'var(--font-display)' }}
                            >
                              {post.title}
                            </h3>

                            <p className="text-sm text-[--color-text-secondary] mb-4 line-clamp-2 leading-relaxed">
                              {post.description}
                            </p>

                            <div className="flex items-center gap-3 text-xs text-[--color-text-muted] mt-auto">
                              <span>{formatDate(post.date)}</span>
                              <span className="text-[--color-border]">·</span>
                              <span>{post.readingTime}</span>
                            </div>

                            <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                              <ArrowRight className="w-4 h-4 text-[--color-accent]" />
                            </div>
                          </article>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
