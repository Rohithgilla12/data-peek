import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { source } from "@/lib/source";
import browserCollections from "fumadocs-mdx:collections/browser";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import defaultMdxComponents from "fumadocs-ui/mdx";
import {
  generateMetaTags,
  canonicalLinks,
  DOCS_CONFIG,
  getTechArticleStructuredData,
  getBreadcrumbStructuredData,
} from "@/lib/seo";

const loader = createServerFn({ method: "GET" })
  .inputValidator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs);
    if (!page) throw notFound();

    const breadcrumbs = [
      { name: "Home", url: DOCS_CONFIG.url },
      { name: "Documentation", url: `${DOCS_CONFIG.url}/docs` },
    ];
    page.slugs.forEach((_, index) => {
      const ancestor = source.getPage(page.slugs.slice(0, index + 1));
      if (ancestor) {
        breadcrumbs.push({
          name: ancestor.data.title,
          url: `${DOCS_CONFIG.url}${ancestor.url}`,
        });
      }
    });

    return {
      // File path, used by the MDX client loader.
      path: page.path,
      // Public URL, used for canonical / og:url / structured data.
      url: page.url,
      title: page.data.title,
      description: page.data.description || DOCS_CONFIG.description,
      breadcrumbs,
    };
  });

export const Route = createFileRoute("/docs/$")({
  component: Page,
  loader: async ({ params }) => {
    const slugs = params._splat?.split("/") ?? [];
    const data = await loader({ data: slugs });
    await clientLoader.preload(data.path);
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData?.url) return {};

    const title = loaderData.title;
    const description = loaderData.description;

    const meta = generateMetaTags({
      title,
      description,
      path: loaderData.url,
      keywords: [
        "data-peek",
        "documentation",
        "SQL client",
        "PostgreSQL",
        "MySQL",
        "database",
        ...title.toLowerCase().split(" "),
      ],
      type: "article",
    });

    return { meta, links: canonicalLinks(loaderData.url) };
  },
});

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
    );
  },
});

function Page() {
  const data = Route.useLoaderData();
  const content = clientLoader.useContent(data.path);

  const url = `${DOCS_CONFIG.url}${data.url}`;
  const structuredData = [
    getTechArticleStructuredData({
      title: data.title,
      description: data.description,
      url,
    }),
    getBreadcrumbStructuredData(data.breadcrumbs),
  ];

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
  );
}
