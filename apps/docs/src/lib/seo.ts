export const DOCS_CONFIG = {
  name: 'data-peek Documentation',
  title: 'data-peek Docs',
  description:
    'Complete documentation for data-peek - A minimal, fast, lightweight SQL client for PostgreSQL, MySQL, SQL Server, and SQLite.',
  url: 'https://docs.datapeek.dev',
  ogImage: 'https://docs.datapeek.dev/og-image.png',
  twitterHandle: '@gillarohith',
  author: 'data-peek team',
} as const

export interface PageMeta {
  title: string
  description: string
  path?: string
  keywords?: string[]
  noindex?: boolean
  ogImage?: string
  type?: 'website' | 'article'
  publishedTime?: string
  modifiedTime?: string
}

export function generateMetaTags({
  title,
  description,
  path = '',
  keywords = [],
  noindex = false,
  ogImage,
  type = 'website',
  publishedTime,
  modifiedTime,
}: PageMeta) {
  const fullTitle = path ? `${title} | ${DOCS_CONFIG.title}` : title
  const url = `${DOCS_CONFIG.url}${path}`
  const image = ogImage || DOCS_CONFIG.ogImage

  const meta: Array<Record<string, string>> = [
    { charSet: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { title: fullTitle },
    { name: 'description', content: description },
    { name: 'theme-color', content: '#0a0a0b' },
    { name: 'robots', content: noindex ? 'noindex,nofollow' : 'index,follow' },
    { property: 'og:title', content: fullTitle },
    { property: 'og:description', content: description },
    { property: 'og:type', content: type },
    { property: 'og:url', content: url },
    { property: 'og:image', content: image },
    { property: 'og:site_name', content: DOCS_CONFIG.name },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: fullTitle },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: image },
    { name: 'twitter:creator', content: DOCS_CONFIG.twitterHandle },
    { rel: 'canonical', href: url },
  ]

  if (keywords.length > 0) {
    meta.push({ name: 'keywords', content: keywords.join(', ') })
  }

  if (publishedTime) {
    meta.push({ property: 'article:published_time', content: publishedTime })
  }

  if (modifiedTime) {
    meta.push({ property: 'article:modified_time', content: modifiedTime })
  }

  return meta
}

export function getOrganizationStructuredData() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: DOCS_CONFIG.name,
    url: DOCS_CONFIG.url,
    logo: `${DOCS_CONFIG.url}/favicon.svg`,
    description: DOCS_CONFIG.description,
    sameAs: [
      'https://datapeek.dev',
      'https://github.com/Rohithgilla12/data-peek',
      'https://x.com/gillarohith',
    ],
  }
}

export function getTechArticleStructuredData({
  title,
  description,
  url,
  publishedTime,
  modifiedTime,
  author,
}: {
  title: string
  description: string
  url: string
  publishedTime?: string
  modifiedTime?: string
  author?: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: title,
    description,
    url,
    ...(publishedTime && { datePublished: publishedTime }),
    ...(modifiedTime && { dateModified: modifiedTime }),
    author: {
      '@type': 'Person',
      name: author || DOCS_CONFIG.author,
    },
    publisher: {
      '@type': 'Organization',
      name: DOCS_CONFIG.name,
      logo: {
        '@type': 'ImageObject',
        url: `${DOCS_CONFIG.url}/favicon.svg`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
  }
}

export function getBreadcrumbStructuredData(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

