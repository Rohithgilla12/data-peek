import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Providers } from '@/components/providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'data-peek',
  description: 'SQL client in your browser',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#6b8cf5',
          colorBackground: '#111113',
          colorInputBackground: '#18181b',
          colorInputText: '#fafafa',
        },
      }}
    >
      <html lang="en" className="dark">
        <body className="antialiased">
          <Providers>
            <NuqsAdapter>{children}</NuqsAdapter>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  )
}
