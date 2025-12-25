import { createFileRoute } from "@tanstack/react-router";
import { generateSitemap } from "@/lib/sitemap";

export const Route = createFileRoute("/sitemap/xml")({
  server: {
    handlers: {
      GET: async () => {
        const sitemap = generateSitemap();
        return new Response(sitemap, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
          },
        });
      },
    },
  },
});
