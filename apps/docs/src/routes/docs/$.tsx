import { createFileRoute, notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { source } from '@/lib/source'
import browserCollections from 'fumadocs-mdx:collections/browser'
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import {
  generateMetaTags,
  DOCS_CONFIG,
  getTechArticleStructuredData,
  getBreadcrumbStructuredData,
} from '@/lib/seo'

type PageFrontmatter = {
  title?: string
  description?: string
}

type PageDataWithFrontmatter = {
  frontmatter?: PageFrontmatter
}

const loader = createServerFn({ method: 'GET' })
  .inputValidator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs)
    if (!page) throw notFound()

    const pageData = (page.data as PageDataWithFrontmatter | undefined) ?? {}
    const frontmatter = pageData.frontmatter ?? {
      title: 'Documentation',
      description: DOCS_CONFIG.description,
    }

    const breadcrumbs = [
      { name: 'Home', url: DOCS_CONFIG.url },
      { name: 'Documentation', url: `${DOCS_CONFIG.url}/docs` },
    ]

    const pathParts = page.path.split('/').filter(Boolean)
    let currentPath = ''
    pathParts.forEach((part, index) => {
      currentPath += `/${part}`
      const pageAtPath = source.getPage(pathParts.slice(0, index + 1))
      if (pageAtPath) {
        const pageFrontmatter = (
          pageAtPath.data as PageDataWithFrontmatter | undefined
        )?.frontmatter
        breadcrumbs.push({
          name: pageFrontmatter?.title ?? part,
          url: `${DOCS_CONFIG.url}/docs${currentPath}`,
        })
      }
    })

    return {
      path: page.path,
      title: frontmatter.title || 'Documentation',
      description: frontmatter.description || DOCS_CONFIG.description,
      breadcrumbs,
    }
  })

export const Route = createFileRoute('/docs/$')({
  component: Page,
  loader: async ({ params }) => {
    const slugs = params._splat?.split('/') ?? []
    const data = await loader({ data: slugs })
    await clientLoader.preload(data.path)
    return data
  },
  head: ({ loaderData }) => {
    if (!loaderData?.path) return {}

    const pagePath = `/docs/${loaderData.path}`
    const url = `${DOCS_CONFIG.url}${pagePath}`
    const title = loaderData.title
    const description = loaderData.description

    const meta = generateMetaTags({
      title,
      description,
      path: pagePath,
      keywords: [
        'data-peek',
        'documentation',
        'SQL client',
        'PostgreSQL',
        'MySQL',
        'database',
        ...title.toLowerCase().split(' '),
      ],
      type: 'article',
    })

    return { meta }
  },
})

const clientLoader = browserCollections.docs.createClientLoader({
  component({ toc, frontmatter, default: MDX }) {
    return (
      <DocsPage toc={toc}>
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <DocsBody>
          <MDX components={{ ...defaultMdxComponents }} />
        </DocsBody>
      </DocsPage>
    )
  },
})

function Page() {
  const data = Route.useLoaderData()
  const content = clientLoader.useContent(data.path)

  const url = `${DOCS_CONFIG.url}/docs${data.path}`
  const structuredData = [
    getTechArticleStructuredData({
      title: data.title,
      description: data.description,
      url,
    }),
    getBreadcrumbStructuredData(data.breadcrumbs),
  ]

  return (
    <>
      {structuredData.map((sd, i) => (
        <script
          key={i}
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(sd) }}
        />
      ))}
      {content}
    </>
  )
}
