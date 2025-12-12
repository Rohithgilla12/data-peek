import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import * as React from 'react';
import appCss from '@/styles/app.css?url';
import { RootProvider } from 'fumadocs-ui/provider/tanstack';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'data-peek Docs',
      },
      {
        name: 'description',
        content:
          'Documentation for data-peek - A minimal, fast, lightweight SQL client for PostgreSQL and MySQL',
      },
      {
        name: 'theme-color',
        content: '#0a0a0b',
      },
      {
        property: 'og:title',
        content: 'data-peek Documentation',
      },
      {
        property: 'og:description',
        content: 'A minimal, fast, lightweight SQL client for PostgreSQL and MySQL',
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
      {
        name: 'twitter:title',
        content: 'data-peek Documentation',
      },
      {
        name: 'twitter:description',
        content: 'A minimal, fast, lightweight SQL client for PostgreSQL and MySQL',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    ],
    scripts: [
      {
        src: 'https://giveme.gilla.fun/script.js',
        defer: true,
        'data-website-id': '99144076-001c-49ad-82d9-a7a19fd7d700',
      },
      {
        children: `(function(c,l,a,r,i,t,y){
          c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
          t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
          y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window, document, "clarity", "script", "ukb6oie3zz");`,
      },
      {
        src: 'https://cdn.littlestats.click/embed/wq9151m57h17nmx',
        defer: true,
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
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="flex flex-col min-h-screen antialiased">
        <RootProvider
          theme={{
            enabled: true,
            defaultTheme: 'dark',
          }}
        >
          {children}
        </RootProvider>
        <Scripts />
      </body>
    </html>
  );
}
