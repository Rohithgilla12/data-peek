import { source } from './source'
import { DOCS_CONFIG } from './seo'

interface SitemapUrl {
  loc: string
  lastmod?: string
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
}

function getAllPages(): Array<{ path: string; lastmod?: string }> {
  const pages: Array<{ path: string; lastmod?: string }> = []
  
  function traverse(node: any, currentPath: string[] = []) {
    if (node.type === 'page') {
      const fullPath = currentPath.length > 0 
        ? `/docs/${currentPath.join('/')}` 
        : '/docs'
      const frontmatter = node.data?.frontmatter || {}
      pages.push({
        path: fullPath,
        lastmod: frontmatter.lastModified || frontmatter.date,
      })
    }
    
    if (node.children) {
      node.children.forEach((child: any) => {
        const newPath = node.type === 'page' 
          ? [...currentPath, node.name] 
          : currentPath
        traverse(child, newPath)
      })
    }
    
    if (node.index) {
      traverse(node.index, currentPath)
    }
  }
  
  const pageTree = source.pageTree as any
  if (pageTree?.children) {
    pageTree.children.forEach((child: any) => {
      traverse(child)
    })
  }
  
  return pages
}

export function generateSitemap(): string {
  const urls: SitemapUrl[] = [
    {
      loc: DOCS_CONFIG.url,
      changefreq: 'weekly',
      priority: 1.0,
    },
    {
      loc: `${DOCS_CONFIG.url}/docs`,
      changefreq: 'weekly',
      priority: 1.0,
    },
  ]

  const pages = getAllPages()
  
  pages.forEach((page) => {
    const url = `${DOCS_CONFIG.url}${page.path}`
    
    // Determine priority based on path depth
    const depth = page.path.split('/').filter(Boolean).length
    let priority = 0.8
    let changefreq: SitemapUrl['changefreq'] = 'monthly'
    
    if (depth === 2) {
      // Top-level docs sections
      priority = 0.9
      changefreq = 'weekly'
    } else if (depth === 3) {
      // Getting started, features, etc.
      priority = 0.8
      changefreq = 'monthly'
    } else {
      // Deeper pages
      priority = 0.7
      changefreq = 'monthly'
    }
    
    urls.push({
      loc: url,
      lastmod: page.lastmod,
      changefreq,
      priority,
    })
  })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url>
    <loc>${url.loc}</loc>${url.lastmod ? `\n    <lastmod>${url.lastmod}</lastmod>` : ''}${url.changefreq ? `\n    <changefreq>${url.changefreq}</changefreq>` : ''}${url.priority !== undefined ? `\n    <priority>${url.priority}</priority>` : ''}
  </url>`).join('\n')}
</urlset>`

  return xml
}

