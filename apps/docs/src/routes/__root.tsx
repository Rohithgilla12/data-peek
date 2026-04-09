import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import * as React from "react";
import appCss from "@/styles/app.css?url";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { generateMetaTags, DOCS_CONFIG } from "@/lib/seo";
import { Analytics } from "@vercel/analytics/react";

export const Route = createRootRoute({
  head: () => {
    return {
      meta: generateMetaTags({
        title: DOCS_CONFIG.title,
        description: DOCS_CONFIG.description,
        keywords: [
          'data-peek documentation',
          'PostgreSQL client docs',
          'MySQL client docs',
          'SQL client documentation',
          'database client guide',
          'SQL editor documentation',
        ],
      }),
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      ],
      scripts: [
        {
          src: "https://scripts.simpleanalyticscdn.com/latest.js",
          async: true,
        },
      ],
    };
  },
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="flex flex-col min-h-screen antialiased">
        <RootProvider
          theme={{
            enabled: true,
            defaultTheme: "dark",
          }}
        >
          {children}
        </RootProvider>
        <Analytics />
        <Scripts />
      </body>
    </html>
  );
}
