import fs from "fs";
import path from "path";
import matter from "gray-matter";
import readingTime from "reading-time";

if (typeof window !== "undefined") {
  throw new Error("This module can only be used on the server.");
}

const BLOG_DIR = path.join(process.cwd(), "../../notes");

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string[];
  readingTime: string;
  content: string;
  published: boolean;
}

export interface BlogPostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string[];
  readingTime: string;
  published: boolean;
}

export function getBlogPosts(): BlogPostMeta[] {
  if (!fs.existsSync(BLOG_DIR)) {
    return [];
  }

  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith(".mdx"));

  const posts = files
    .map((file) => {
      const slug = file.replace(/\.mdx$/, "");
      const filePath = path.join(BLOG_DIR, file);
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const { data, content } = matter(fileContent);
      const stats = readingTime(content);

      return {
        slug,
        title: data.title || slug,
        description: data.description || "",
        date: data.date || new Date().toISOString(),
        author: data.author || "data-peek team",
        tags: data.tags || [],
        readingTime: stats.text,
        published: data.published !== false,
      };
    })
    .filter((post) => post.published)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return posts;
}

export function getBlogPost(slug: string): BlogPost | null {
  const filePath = path.join(BLOG_DIR, `${slug}.mdx`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const fileContent = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(fileContent);
  const stats = readingTime(content);

  const post: BlogPost = {
    slug,
    title: data.title || slug,
    description: data.description || "",
    date: data.date || new Date().toISOString(),
    author: data.author || "data-peek team",
    tags: data.tags || [],
    readingTime: stats.text,
    content,
    published: data.published !== false,
  };

  if (!post.published) {
    return null;
  }

  return post;
}

export function getRelatedPosts(slug: string, limit = 3): BlogPostMeta[] {
  const posts = getBlogPosts();
  const current = posts.find((post) => post.slug === slug);

  if (!current) {
    return posts.filter((post) => post.slug !== slug).slice(0, limit);
  }

  const currentTags = new Set(current.tags.map((tag) => tag.toLowerCase()));

  return posts
    .filter((post) => post.slug !== slug)
    .map((post) => {
      const sharedTags = post.tags.filter((tag) =>
        currentTags.has(tag.toLowerCase()),
      ).length;
      return { post, sharedTags };
    })
    .sort((a, b) => {
      if (b.sharedTags !== a.sharedTags) {
        return b.sharedTags - a.sharedTags;
      }
      return new Date(b.post.date).getTime() - new Date(a.post.date).getTime();
    })
    .slice(0, limit)
    .map((entry) => entry.post);
}

export function getAllBlogSlugs(): string[] {
  if (!fs.existsSync(BLOG_DIR)) {
    return [];
  }

  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith(".mdx"));

  return files
    .map((file) => {
      const slug = file.replace(/\.mdx$/, "");
      const filePath = path.join(BLOG_DIR, file);
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const { data } = matter(fileContent);
      return { slug, published: data.published !== false };
    })
    .filter((post) => post.published)
    .map((post) => post.slug);
}
