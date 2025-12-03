import type { Metadata } from 'next'
import Script from 'next/script'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

export const metadata: Metadata = {
  title: 'data-peek | Fast PostgreSQL Client for Developers',
  description:
    'A lightning-fast, beautiful PostgreSQL desktop client. Query, explore, and edit your data with a keyboard-first experience. No bloat, no subscriptions.',
  keywords: [
    'PostgreSQL',
    'database client',
    'SQL editor',
    'pgAdmin alternative',
    'DBeaver alternative',
    'TablePlus alternative',
  ],
  authors: [{ name: 'data-peek' }],
  openGraph: {
    title: 'data-peek | Peek at your data. Fast.',
    description: 'The PostgreSQL client developers actually want to use.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'data-peek | Peek at your data. Fast.',
    description: 'The PostgreSQL client developers actually want to use.',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#22d3ee',
          colorBackground: '#111113',
          colorInputBackground: '#18181b',
          colorInputText: '#fafafa',
        },
      }}
    >
      <html lang="en">
        <body className="antialiased">
          {children}
          <Script
            src="https://giveme.gilla.fun/script.js"
            strategy="afterInteractive"
            data-website-id="883e50ed-8e6e-4d4a-b77d-f320f16fe639"
          />
        </body>
      </html>
    </ClerkProvider>
  )
}
