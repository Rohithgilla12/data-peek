import { createFileRoute } from '@tanstack/react-router'
import { source } from '@/lib/source'

const BASE_URL = 'https://docs.datapeek.dev'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const pages = source.getPages()

        const urls = pages.map((page) => {
          const url = `${BASE_URL}${page.url}`
          return `  <url>
    <loc>${url}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>${getChangeFrequency(page.url)}</changefreq>
    <priority>${getPriority(page.url)}</priority>
  </url>`
        })

        // Add the root docs page
        const rootUrl = `  <url>
    <loc>${BASE_URL}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1</priority>
  </url>`

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rootUrl}
${urls.join('\n')}
</urlset>`

        return new Response(xml, {
          headers: {
            'Content-Type': 'application/xml',
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
          },
        })
      },
    },
  },
})

function getChangeFrequency(url: string): string {
  if (url.includes('/getting-started')) return 'weekly'
  if (url.includes('/features')) return 'monthly'
  if (url.includes('/database-support')) return 'monthly'
  if (url.includes('/configuration')) return 'monthly'
  if (url.includes('/reference')) return 'monthly'
  return 'monthly'
}

function getPriority(url: string): number {
  if (url === '/docs') return 1
  if (url.includes('/getting-started')) return 0.9
  if (url.includes('/features')) return 0.8
  if (url.includes('/database-support')) return 0.7
  if (url.includes('/configuration')) return 0.6
  if (url.includes('/reference')) return 0.5
  return 0.5
}
