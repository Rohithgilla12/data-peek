import { source } from "./source";
import { DOCS_CONFIG } from "./seo";

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: number;
}

function getAllPages(): Array<{ path: string; lastmod?: string }> {
  return source
    .getPages()
    .filter((page) => page.url !== "/docs")
    .map((page) => {
      const data = page.data as { lastModified?: string; date?: string };
      return {
        path: page.url,
        lastmod: data.lastModified || data.date,
      };
    });
}

export function generateSitemap(): string {
  const urls: SitemapUrl[] = [
    {
      loc: DOCS_CONFIG.url,
      changefreq: "weekly",
      priority: 1.0,
    },
    {
      loc: `${DOCS_CONFIG.url}/docs`,
      changefreq: "weekly",
      priority: 1.0,
    },
  ];

  const pages = getAllPages();

  pages.forEach((page) => {
    const url = `${DOCS_CONFIG.url}${page.path}`;

    // Determine priority based on path depth
    const depth = page.path.split("/").filter(Boolean).length;
    let priority = 0.8;
    let changefreq: SitemapUrl["changefreq"] = "monthly";

    if (depth === 2) {
      // Top-level docs sections
      priority = 0.9;
      changefreq = "weekly";
    } else if (depth === 3) {
      // Getting started, features, etc.
      priority = 0.8;
      changefreq = "monthly";
    } else {
      // Deeper pages
      priority = 0.7;
      changefreq = "monthly";
    }

    urls.push({
      loc: url,
      lastmod: page.lastmod,
      changefreq,
      priority,
    });
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${url.loc}</loc>${url.lastmod ? `\n    <lastmod>${url.lastmod}</lastmod>` : ""}${url.changefreq ? `\n    <changefreq>${url.changefreq}</changefreq>` : ""}${url.priority !== undefined ? `\n    <priority>${url.priority}</priority>` : ""}
  </url>`,
  )
  .join("\n")}
</urlset>`;

  return xml;
}
