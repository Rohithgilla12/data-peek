import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import type { BlogPostMeta } from "@/lib/blog";

interface RelatedPostsProps {
  posts: BlogPostMeta[];
}

export function RelatedPosts({ posts }: RelatedPostsProps) {
  if (posts.length === 0) {
    return null;
  }

  return (
    <section className="mb-16" aria-labelledby="related-posts-heading">
      <div className="flex items-center gap-4 mb-8">
        <h2
          id="related-posts-heading"
          className="text-xs font-mono uppercase tracking-widest text-(--color-text-muted)"
        >
          Read next
        </h2>
        <div className="h-px flex-1 bg-white/5" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group flex flex-col rounded-2xl bg-white/[0.02] border border-white/10 p-6 transition-colors hover:border-(--color-accent)/40 hover:bg-white/[0.04]"
          >
            {post.tags.length > 0 && (
              <span className="mb-4 inline-flex w-fit px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest rounded-full bg-(--color-accent)/10 border border-(--color-accent)/20 text-(--color-accent)">
                {post.tags[0]}
              </span>
            )}

            <h3 className="text-sm font-mono uppercase tracking-tight font-bold text-white leading-snug mb-2 group-hover:text-(--color-accent) transition-colors">
              {post.title}
            </h3>

            <p className="text-xs font-mono text-(--color-text-muted) leading-relaxed line-clamp-3 mb-6">
              {post.description}
            </p>

            <div className="mt-auto flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-(--color-text-muted)">
              <span className="flex items-center gap-2">
                <Clock className="w-3 h-3" />
                {post.readingTime}
              </span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
