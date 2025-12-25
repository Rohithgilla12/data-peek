import type { MetadataRoute } from "next";
import { getBlogPosts } from "@/lib/blog";

const BASE_URL = "https://www.datapeek.dev";

const databases = ["postgresql", "mysql", "sql-server", "sqlite"];
const alternatives = ["pgadmin", "dbeaver", "tableplus"];

export default function sitemap(): MetadataRoute.Sitemap {
  const blogPosts = getBlogPosts();

  const blogUrls: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const databaseUrls: MetadataRoute.Sitemap = databases.map((db) => ({
    url: `${BASE_URL}/databases/${db}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const compareUrls: MetadataRoute.Sitemap = alternatives.map((alt) => ({
    url: `${BASE_URL}/compare/${alt}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 1,
    },
    {
      url: `${BASE_URL}/download`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    ...blogUrls,
    {
      url: `${BASE_URL}/databases`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    ...databaseUrls,
    {
      url: `${BASE_URL}/compare`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
    ...compareUrls,
    {
      url: `${BASE_URL}/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: new Date(),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
  ];
}
