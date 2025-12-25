import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import rehypePrettyCode from 'rehype-pretty-code'
import remarkGfm from 'remark-gfm'
import { Header } from '@/components/marketing/header'
import { Footer } from '@/components/marketing/footer'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import { StructuredData } from '@/components/seo/structured-data'
import { getBlogPost, getAllBlogSlugs } from '@/lib/blog'
import { mdxComponents } from '@/components/blog/mdx-components'
import { ReadingProgress } from '@/components/blog/reading-progress'
import { generateMetadata as generateSeoMetadata, SITE_CONFIG } from '@/lib/seo'
import { ArrowLeft, Calendar, Clock, User } from 'lucide-react'

interface BlogPostPageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const slugs = getAllBlogSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params
  const post = getBlogPost(slug)

  if (!post) {
    return {
      title: 'Post Not Found | data-peek Blog',
    }
  }

  return generateSeoMetadata({
    title: post.title,
    description: post.description,
    path: `/blog/${slug}`,
    keywords: post.tags,
    type: 'article',
    publishedTime: post.date,
    authors: [post.author],
    tags: post.tags,
  })
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params
  const post = getBlogPost(slug)

  if (!post) {
    notFound()
  }

  const postUrl = `${SITE_CONFIG.url}/blog/${slug}`

  return (
    <div className="min-h-screen">
      <ReadingProgress />
      <Header />
      <StructuredData
        type="article"
        data={{
          article: {
            title: post.title,
            description: post.description,
            publishedTime: post.date,
            author: post.author,
            url: postUrl,
          },
        }}
      />
      <main className="pt-20 md:pt-24">
        <div className="max-w-4xl mx-auto px-6 pt-8">
          <Breadcrumbs
            items={[
              { label: 'Blog', href: '/blog' },
              { label: post.title, href: `/blog/${slug}` },
            ]}
          />
          <Link
            href="/blog"
            className="group inline-flex items-center gap-2 text-sm text-[--color-text-muted] hover:text-[--color-accent] transition-colors"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>Back to blog</span>
          </Link>
        </div>

        <header className="relative py-12 md:py-20 overflow-hidden">
          <div className="absolute inset-0 grid-pattern opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[--color-background]" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[--color-accent]/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative max-w-4xl mx-auto px-6">
            <div className="animate-fade-in-up">
              {post.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 text-xs font-medium rounded-full bg-[--color-accent]/10 border border-[--color-accent]/20 text-[--color-accent]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <h1
                className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {post.title}
              </h1>

              <p className="text-lg md:text-xl text-[--color-text-secondary] mb-10 max-w-3xl leading-relaxed">
                {post.description}
              </p>

              <div className="flex flex-wrap items-center gap-6 py-6 border-t border-b border-[--color-border-subtle]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[--color-accent]/20 to-[--color-accent]/5 border border-[--color-accent]/30 flex items-center justify-center">
                    <User className="w-4 h-4 text-[--color-accent]" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[--color-text-primary]">{post.author}</div>
                    <div className="text-xs text-[--color-text-muted]">Author</div>
                  </div>
                </div>

                <div className="w-px h-8 bg-[--color-border-subtle] hidden sm:block" />

                <div className="flex items-center gap-2 text-[--color-text-muted]">
                  <Calendar className="w-4 h-4" />
                  <time dateTime={post.date} className="text-sm">{formatDate(post.date)}</time>
                </div>

                <div className="flex items-center gap-2 text-[--color-text-muted]">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">{post.readingTime}</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <article className="pb-16 md:pb-24">
          <div className="max-w-4xl mx-auto px-6">
            <div className="prose prose-invert max-w-none animate-fade-in-up delay-200">
              <MDXRemote
                source={post.content}
                components={mdxComponents}
                options={{
                  mdxOptions: {
                    remarkPlugins: [remarkGfm],
                    rehypePlugins: [
                      [
                        rehypePrettyCode,
                        {
                          theme: 'tokyo-night',
                          keepBackground: true,
                          defaultLang: 'plaintext',
                        },
                      ],
                    ],
                  },
                }}
              />
            </div>
          </div>
        </article>

        <section className="relative py-16 md:py-24 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[--color-surface]/50 to-[--color-surface]" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[--color-border] to-transparent" />

          <div className="relative max-w-4xl mx-auto px-6 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[--color-accent]/20 to-[--color-accent]/5 border border-[--color-accent]/30 mb-8">
              <span className="text-2xl">🚀</span>
            </div>

            <h2
              className="text-2xl md:text-3xl font-bold mb-4"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Ready to try data-peek?
            </h2>
            <p className="text-[--color-text-secondary] mb-8 max-w-lg mx-auto">
              A fast, minimal SQL client that gets out of your way.
              Download free and see the difference.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/download"
                className="group relative px-8 py-4 rounded-xl bg-[--color-accent] text-[--color-background] font-semibold hover:bg-[--color-accent-dim] transition-all duration-300 overflow-hidden"
              >
                <span className="relative z-10">Download Free</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              </Link>
              <Link
                href="/blog"
                className="px-8 py-4 rounded-xl border border-[--color-border] text-[--color-text-secondary] hover:text-[--color-text-primary] hover:border-[--color-text-muted] hover:bg-[--color-surface] transition-all duration-300"
              >
                More Articles
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
