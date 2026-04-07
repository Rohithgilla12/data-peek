import { Metadata } from 'next'
import { Header } from '@/components/marketing/header'
import { Footer } from '@/components/marketing/footer'
import { generateMetadata as generateSeoMetadata } from '@/lib/seo'
import { SQLPlayground } from '@/components/playground/sql-playground'

export const metadata: Metadata = generateSeoMetadata({
  title: 'AI SQL Playground',
  description:
    'Generate SQL from plain English, explain complex queries, and fix broken SQL. Free AI-powered SQL tool for PostgreSQL, MySQL, and SQL Server.',
  path: '/playground',
  keywords: [
    'AI SQL generator',
    'natural language to SQL',
    'SQL explainer',
    'SQL fixer',
    'text to SQL',
    'AI SQL assistant',
    'SQL playground',
    'PostgreSQL query generator',
    'MySQL query generator',
    'SQL Server query generator',
  ],
})

export default function PlaygroundPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 pt-28 pb-16 px-6">
        <div className="max-w-4xl mx-auto mb-10 text-center">
          <h1
            className="text-3xl md:text-4xl font-bold tracking-tight mb-3"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            AI SQL Playground
          </h1>
          <p className="text-sm text-[--color-text-muted] max-w-lg mx-auto">
            Generate, explain, and fix SQL queries with AI. Select your database dialect,
            optionally paste your schema, and start asking.
          </p>
        </div>
        <SQLPlayground />
      </main>
      <Footer />
    </div>
  )
}
