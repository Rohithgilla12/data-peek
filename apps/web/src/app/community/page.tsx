import { Metadata } from 'next'
import Link from 'next/link'
import { Header } from '@/components/marketing/header'
import { Footer } from '@/components/marketing/footer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import {
  GraduationCap,
  Code2,
  Heart,
  Mail,
  Check,
  ArrowRight,
  Github,
  BookOpen,
  Users,
} from 'lucide-react'
import { generateMetadata as generateSeoMetadata } from '@/lib/seo'

export const metadata: Metadata = generateSeoMetadata({
  title: 'Free for Students & Open Source',
  description:
    'data-peek is free for students, educators, and open source developers. Get a free Pro license — just send us an email.',
  keywords: [
    'free database client students',
    'free SQL editor students',
    'open source database tool',
    'free PostgreSQL client',
    'student developer tools',
    'free database IDE',
  ],
  path: '/community',
})

const programs = [
  {
    title: 'Students & Educators',
    icon: GraduationCap,
    description: 'Currently enrolled students, teachers, professors, and academic researchers.',
    color: '#4ade80',
    eligible: [
      'University & college students',
      'High school students learning to code',
      'Teachers & professors',
      'Academic researchers',
      'Coding bootcamp students',
    ],
  },
  {
    title: 'Open Source Developers',
    icon: Code2,
    description:
      'Active contributors and maintainers of open source projects.',
    color: '#6b8cf5',
    eligible: [
      'OSS project maintainers',
      'Active open source contributors',
      'Open source project leads',
      'Non-profit developers',
      'Community project builders',
    ],
  },
]

export default function CommunityPage() {
  return (
    <div className="min-h-screen">
      <Header />

      <main className="pt-24 sm:pt-32 pb-16 sm:pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 mb-6">
          <Breadcrumbs items={[{ label: 'Community', href: '/community' }]} />
        </div>

        {/* Hero Section */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 text-center mb-12 sm:mb-20">
          <Badge variant="default" size="lg" className="mb-4 sm:mb-6 text-xs sm:text-sm">
            <Heart className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-1.5" />
            Free Pro License
          </Badge>

          <h1
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-4 sm:mb-6"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Free for students
            <br />
            & open source devs
          </h1>

          <p
            className="text-base sm:text-lg text-[--color-text-secondary] max-w-xl mx-auto mb-6 sm:mb-8 px-2"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            We believe great tools should be accessible to everyone.
            <br className="hidden sm:block" />
            <span className="sm:hidden"> </span>
            If you&apos;re a student or building open source, data-peek Pro is on us.
          </p>

          <Button size="lg" asChild>
            <Link href="mailto:hello@datapeek.dev?subject=Free%20Pro%20License%20Request">
              <Mail className="w-4 h-4" />
              Email us for a free license
            </Link>
          </Button>
        </section>

        {/* Program Cards */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 mb-12 sm:mb-20">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {programs.map((program) => (
              <div
                key={program.title}
                className="rounded-xl sm:rounded-2xl bg-[--color-surface] border border-[--color-border] p-5 sm:p-8"
              >
                {/* Program Header */}
                <div className="flex items-center gap-2.5 sm:gap-3 mb-4 sm:mb-6">
                  <div
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center"
                    style={{
                      backgroundColor: `${program.color}15`,
                      border: `1px solid ${program.color}30`,
                    }}
                  >
                    <program.icon
                      className="w-5 h-5 sm:w-6 sm:h-6"
                      style={{ color: program.color }}
                    />
                  </div>
                  <div>
                    <h3
                      className="text-base sm:text-lg font-medium"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {program.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-[--color-text-muted]">
                      {program.description}
                    </p>
                  </div>
                </div>

                {/* Eligibility List */}
                <ul className="space-y-2.5 sm:space-y-3">
                  {program.eligible.map((item) => (
                    <li key={item} className="flex items-center gap-2 sm:gap-3">
                      <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[--color-success]/10 flex items-center justify-center flex-shrink-0">
                        <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[--color-success]" />
                      </div>
                      <span className="text-xs sm:text-sm text-[--color-text-secondary]">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* What You Get */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 mb-12 sm:mb-20">
          <div className="rounded-xl sm:rounded-2xl bg-[--color-surface] border border-[--color-border] p-5 sm:p-8">
            <h2
              className="text-lg sm:text-xl font-medium mb-4 sm:mb-6"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              What you get
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
              {[
                'Full Pro license',
                'All features unlocked',
                'PostgreSQL, MySQL, SQL Server',
                'Unlimited connections',
                'AI Assistant (BYOK)',
                'All future updates',
                'Commercial use at school/OSS',
                '3 device activations',
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-2 sm:gap-3">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[--color-accent]/10 flex items-center justify-center flex-shrink-0">
                    <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-[--color-accent]" />
                  </div>
                  <span className="text-xs sm:text-sm text-[--color-text-secondary]">
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How to Get It */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 mb-12 sm:mb-20">
          <h2
            className="text-lg sm:text-xl font-medium mb-4 sm:mb-6 text-center"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            How to get your free license
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            {[
              {
                step: '01',
                icon: Mail,
                title: 'Send an email',
                description: 'Email hello@datapeek.dev with a brief intro.',
              },
              {
                step: '02',
                icon: BookOpen,
                title: 'Tell us about yourself',
                description:
                  'Share your school, project, or GitHub profile.',
              },
              {
                step: '03',
                icon: Users,
                title: 'Get your license',
                description: "We'll send you a Pro license key, usually within 24 hours.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-xl sm:rounded-2xl bg-[--color-surface] border border-[--color-border] p-4 sm:p-6 text-center"
              >
                <span
                  className="text-xs text-[--color-accent] mb-2 block"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {item.step}
                </span>
                <div className="w-10 h-10 rounded-xl bg-[--color-accent]/10 flex items-center justify-center mx-auto mb-3">
                  <item.icon className="w-5 h-5 text-[--color-accent]" />
                </div>
                <h3
                  className="text-sm font-medium mb-1.5"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {item.title}
                </h3>
                <p className="text-xs text-[--color-text-muted]">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="rounded-xl sm:rounded-2xl bg-gradient-to-r from-[--color-accent]/10 to-transparent border border-[--color-accent]/20 p-5 sm:p-8 text-center">
            <h2
              className="text-lg sm:text-xl font-medium mb-1.5 sm:mb-2"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Ready to get started?
            </h2>
            <p className="text-xs sm:text-sm text-[--color-text-secondary] mb-4 sm:mb-6">
              Just send us an email. No forms, no verification hoops. We&apos;ll hook you up.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button asChild>
                <Link href="mailto:hello@datapeek.dev?subject=Free%20Pro%20License%20Request">
                  <Mail className="w-4 h-4" />
                  Email us
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link
                  href="https://github.com/Rohithgilla12/data-peek"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="w-4 h-4" />
                  View on GitHub
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
