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
import { ArrowLeft, Calendar, Clock, User, Terminal, Sparkles, Database } from 'lucide-react'
import { FadeIn, StaggerContainer, StaggerItem, ScaleIn } from '@/components/ui/motion-wrapper'
import { DataSubstrate } from '@/components/marketing/data-substrate'
import { Button } from '@/components/ui/button'

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
      <main className="relative pt-32 sm:pt-48 pb-24 overflow-hidden">
        {/* Backgrounds */}
        <div className="absolute inset-0 grid-pattern opacity-20" />
        <DataSubstrate />

        <div className="relative z-10 max-w-4xl mx-auto px-6">
          <FadeIn>
            <div className="mb-12 flex items-center justify-between">
              <Breadcrumbs
                items={[
                  { label: 'Blog', href: '/blog' },
                  { label: post.title, href: `/blog/${slug}` },
                ]}
              />
              <Link
                href="/blog"
                className="group inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-(--color-text-muted) hover:text-(--color-accent) transition-colors"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span>Back to Journal</span>
              </Link>
            </div>

            <header className="mb-16 md:mb-24">
              <div className="flex flex-wrap gap-2 mb-8">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 text-[10px] font-mono uppercase tracking-widest rounded-full bg-(--color-accent)/10 border border-(--color-accent)/20 text-(--color-accent)"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <h1
                className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tighter mb-8 text-white font-mono uppercase leading-[0.9]"
              >
                {post.title}
              </h1>

              <p className="text-lg md:text-2xl text-(--color-text-secondary) mb-12 leading-relaxed font-mono opacity-90">
                {post.description}
              </p>

              <div className="flex flex-wrap items-center gap-8 py-8 border-t border-b border-white/5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-(--color-accent)" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white font-mono uppercase tracking-widest">{post.author}</div>
                    <div className="text-[10px] text-(--color-text-muted) font-mono uppercase tracking-widest">Engineer</div>
                  </div>
                </div>

                <div className="h-10 w-px bg-white/5 hidden sm:block" />

                <div className="flex items-center gap-3 text-(--color-text-muted) font-mono text-[10px] uppercase tracking-widest">
                  <Calendar className="w-4 h-4" />
                  <time dateTime={post.date}>{formatDate(post.date)}</time>
                </div>

                <div className="flex items-center gap-3 text-(--color-text-muted) font-mono text-[10px] uppercase tracking-widest">
                  <Clock className="w-4 h-4" />
                  <span>{post.readingTime} read</span>
                </div>
              </div>
            </header>
          </FadeIn>

          <FadeIn>
            <article className="pb-24">
              <div className="prose prose-invert max-w-none font-mono text-sm sm:text-base leading-relaxed prose-headings:font-mono prose-headings:uppercase prose-headings:tracking-tighter prose-a:text-(--color-accent) prose-pre:bg-white/[0.02] prose-pre:border prose-pre:border-white/10 prose-pre:rounded-2xl">
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
            </article>
          </FadeIn>

          {/* CTA Section */}
          <FadeIn>
            <section className="relative rounded-[3rem] bg-white/[0.02] border border-white/10 p-8 sm:p-16 text-center overflow-hidden">
              <div className="absolute inset-0 grid-pattern opacity-10" />
              <div className="absolute inset-0 bg-gradient-to-br from-(--color-accent)/5 to-purple-600/5" />
              
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-(--color-accent)/10 flex items-center justify-center mx-auto mb-8 border border-(--color-accent)/20">
                  <Sparkles className="w-8 h-8 text-(--color-accent)" />
                </div>
                <h2
                  className="text-3xl sm:text-5xl font-bold mb-6 font-mono uppercase tracking-widest text-white"
                >
                  Join the Future.
                </h2>
                <p className="text-base sm:text-lg text-(--color-text-muted) mb-10 font-mono max-w-xl mx-auto leading-relaxed">
                  A database client built for professional developers. Experience the speed of native code and the power of AI.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                  <Button size="xl" className="group rounded-2xl px-12 bg-(--color-accent) text-(--color-background) hover:bg-(--color-accent)/90 shadow-2xl shadow-(--color-accent)/20 font-mono uppercase tracking-widest font-bold" asChild>
                    <Link href="/download">
                      Download Free
                      <ArrowLeft className="w-5 h-5 ml-2 rotate-180" />
                    </Link>
                  </Button>
                  <Button variant="outline" size="xl" className="rounded-2xl px-10 border-white/10 hover:bg-white/5 font-mono uppercase tracking-widest font-bold group" asChild>
                    <Link href="/blog">
                      More Articles
                    </Link>
                  </Button>
                </div>
              </div>
            </section>
          </FadeIn>
        </div>
      </main>
      <Footer />
    </div>
  )
}
