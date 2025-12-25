import { Metadata } from 'next'
import { Header } from '@/components/marketing/header'
import { Footer } from '@/components/marketing/footer'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import { generateMetadata as generateSeoMetadata } from '@/lib/seo'

export const metadata: Metadata = generateSeoMetadata({
  title: 'Terms of Service',
  description:
    'Terms of service for data-peek. License terms, usage restrictions, and legal information for the desktop application.',
  keywords: ['terms of service', 'license', 'terms', 'legal'],
  path: '/terms',
  noindex: true,
})

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <Header />

      <main className="pt-24 sm:pt-32 pb-16 sm:pb-20">
        <article className="max-w-3xl mx-auto px-4 sm:px-6">
          <Breadcrumbs items={[{ label: 'Terms of Service', href: '/terms' }]} />
          <h1
            className="text-3xl sm:text-4xl font-semibold tracking-tight mb-4"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Terms of Service
          </h1>

          <p className="text-sm text-[--color-text-muted] mb-8">
            Last updated: December 3, 2025
          </p>

          <div className="prose prose-invert prose-zinc max-w-none space-y-8">
            <section>
              <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                1. Acceptance of Terms
              </h2>
              <p className="text-[--color-text-secondary] leading-relaxed">
                By downloading, installing, or using data-peek, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the software.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                2. License Grant
              </h2>
              <div className="space-y-4 text-[--color-text-secondary] leading-relaxed">
                <p>
                  <strong className="text-[--color-text-primary]">Free Version:</strong> data-peek is free for personal, non-commercial use. You may use the free version on unlimited devices for personal projects.
                </p>
                <p>
                  <strong className="text-[--color-text-primary]">Pro License:</strong> Commercial use requires a valid Pro license. Each Pro license allows activation on up to 3 devices and includes 1 year of software updates from the date of purchase.
                </p>
                <p>
                  After the update period expires, you may continue using the version you have, but new updates will require a license renewal.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                3. Restrictions
              </h2>
              <div className="space-y-4 text-[--color-text-secondary] leading-relaxed">
                <p>You may not:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Redistribute, sublicense, or resell the software</li>
                  <li>Reverse engineer, decompile, or disassemble the software</li>
                  <li>Remove or alter any proprietary notices or labels</li>
                  <li>Use the software to violate any applicable laws</li>
                  <li>Share your license key with others outside your authorized devices</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                4. Your Data
              </h2>
              <p className="text-[--color-text-secondary] leading-relaxed">
                data-peek operates locally on your device. You are solely responsible for your database connections, credentials, and any data you access through the software. We do not have access to your databases or the data you query.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                5. AI Features
              </h2>
              <p className="text-[--color-text-secondary] leading-relaxed">
                The AI Assistant feature connects to third-party AI providers. You are responsible for complying with the terms of service of any AI provider you use. Be mindful of what data you send to AI providers, especially if you handle sensitive or regulated data.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                6. Disclaimer of Warranties
              </h2>
              <p className="text-[--color-text-secondary] leading-relaxed">
                THE SOFTWARE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SOFTWARE WILL BE ERROR-FREE OR UNINTERRUPTED. YOU USE THE SOFTWARE AT YOUR OWN RISK.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                7. Limitation of Liability
              </h2>
              <p className="text-[--color-text-secondary] leading-relaxed">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUE, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                8. Refund Policy
              </h2>
              <p className="text-[--color-text-secondary] leading-relaxed">
                We offer refunds within 14 days of purchase if you are not satisfied with the software. Contact us at{' '}
                <a href="mailto:hello@datapeek.dev" className="text-[--color-accent] hover:underline">
                  hello@datapeek.dev
                </a>{' '}
                to request a refund.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                9. Termination
              </h2>
              <p className="text-[--color-text-secondary] leading-relaxed">
                We reserve the right to terminate or suspend your license if you violate these terms. Upon termination, you must cease all use of the software and destroy any copies in your possession.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                10. Changes to Terms
              </h2>
              <p className="text-[--color-text-secondary] leading-relaxed">
                We may modify these terms at any time. Continued use of the software after changes constitutes acceptance of the new terms. We will make reasonable efforts to notify users of significant changes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-medium mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                11. Contact
              </h2>
              <p className="text-[--color-text-secondary] leading-relaxed">
                For questions about these terms, contact us at{' '}
                <a href="mailto:hello@datapeek.dev" className="text-[--color-accent] hover:underline">
                  hello@datapeek.dev
                </a>
              </p>
            </section>
          </div>
        </article>
      </main>

      <Footer />
    </div>
  )
}
