import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import * as React from "react";
import appCss from "@/styles/app.css?url";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { generateMetaTags, DOCS_CONFIG, getOrganizationStructuredData } from "@/lib/seo";

export const Route = createRootRoute({
  head: () => ({
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
        src: "https://giveme.gilla.fun/script.js",
      },
      {
        children: `(function(c,l,a,r,i,t,y){
          c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
          t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
          y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window, document, "clarity", "script", "ukb6oie3zz");`,
      },
      {
        src: "https://cdn.littlestats.click/embed/wq9151m57h17nmx",
      },
      {
        src: "https://scripts.simpleanalyticscdn.com/latest.js",
        async: true,
      },
    ],
  }),
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
  const orgStructuredData = getOrganizationStructuredData();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgStructuredData) }}
        />
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
        <Scripts />
      </body>
    </html>
  );
}
