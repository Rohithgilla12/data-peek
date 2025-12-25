import { Metadata } from 'next'
import { Header } from '@/components/marketing/header'
import { Footer } from '@/components/marketing/footer'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import { generateMetadata as generateSeoMetadata } from '@/lib/seo'

export const metadata: Metadata = generateSeoMetadata({
  title: 'Privacy Policy',
  description:
    'Privacy policy for data-peek. Learn how we protect your data, handle database credentials, and respect your privacy. No telemetry, no tracking.',
  keywords: ['privacy policy', 'data protection', 'privacy', 'data security'],
  path: '/privacy',
  noindex: true,
})

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <Header />

      <main className="pt-24 sm:pt-32 pb-16 sm:pb-20">
        <article className="max-w-3xl mx-auto px-4 sm:px-6">
          <Breadcrumbs items={[{ label: 'Privacy Policy', href: '/privacy' }]} />
          <h1
            className="text-3xl sm:text-4xl font-semibold tracking-tight mb-4"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Privacy Policy
          </h1>

          <p className="text-sm text-[--color-text-muted] mb-8">
            Last updated: December 3, 2025
          </p>

          <div className="prose prose-invert prose-zinc max-w-none space-y-8">
            <section>
              <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                Overview
              </h2>
              <p className="text-[--color-text-secondary] leading-relaxed">
                data-peek is a desktop application that runs locally on your computer. We are committed to protecting your privacy and being transparent about how we handle data.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                Data Collection
              </h2>
              <div className="space-y-4 text-[--color-text-secondary] leading-relaxed">
                <p>
                  <strong className="text-[--color-text-primary]">Database Connections:</strong> Your database connection credentials (host, port, username, password) are stored locally on your device using encrypted storage. They are never transmitted to our servers.
                </p>
                <p>
                  <strong className="text-[--color-text-primary]">Query Data:</strong> All SQL queries and results remain on your local machine. We do not have access to your database content or query history.
                </p>
                <p>
                  <strong className="text-[--color-text-primary]">AI Features:</strong> If you use the AI Assistant feature, your schema information and queries are sent to the AI provider you configure (OpenAI, Anthropic, Google, Groq, or Ollama). We do not store or process this data ourselves.
                </p>
                <p>
                  <strong className="text-[--color-text-primary]">License Information:</strong> When you activate a Pro license, we store your email address and license key on our servers to manage your subscription.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                Analytics
              </h2>
              <p className="text-[--color-text-secondary] leading-relaxed">
                Our website uses privacy-focused analytics to understand general usage patterns. We do not track individual users or collect personally identifiable information through analytics. The desktop application does not include any telemetry or analytics.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                Third-Party Services
              </h2>
              <div className="space-y-4 text-[--color-text-secondary] leading-relaxed">
                <p>We use the following third-party services:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong className="text-[--color-text-primary]">Dodo Payments:</strong> For processing license purchases</li>
                  <li><strong className="text-[--color-text-primary]">Resend:</strong> For sending license key emails</li>
                  <li><strong className="text-[--color-text-primary]">GitHub:</strong> For hosting downloads and releases</li>
                </ul>
                <p>
                  Each service has its own privacy policy that governs how they handle your data.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                Data Security
              </h2>
              <p className="text-[--color-text-secondary] leading-relaxed">
                Database credentials stored in the desktop app are encrypted using your operating system&apos;s secure storage (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux). We use industry-standard encryption for all data transmitted to our servers.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                Your Rights
              </h2>
              <div className="space-y-4 text-[--color-text-secondary] leading-relaxed">
                <p>You have the right to:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Request deletion of your account and associated data</li>
                  <li>Export your license information</li>
                  <li>Opt out of marketing communications</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                Contact
              </h2>
              <p className="text-[--color-text-secondary] leading-relaxed">
                For privacy-related questions or requests, contact us at{' '}
                <a href="mailto:hello@datapeek.dev" className="text-[--color-accent] hover:underline">
                  hello@datapeek.dev
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                Changes to This Policy
              </h2>
              <p className="text-[--color-text-secondary] leading-relaxed">
                We may update this privacy policy from time to time. We will notify users of any material changes by posting the new policy on this page with an updated revision date.
              </p>
            </section>
          </div>
        </article>
      </main>

      <Footer />
    </div>
  )
}
