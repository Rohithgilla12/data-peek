'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const faqs = [
  {
    question: 'Is data-peek really free?',
    answer:
      'Yes! data-peek is free for personal use with all features unlocked. No credit card required, no time limits, no feature restrictions. A license is only required if you use it for commercial purposes at a for-profit company with 2+ people.',
  },
  {
    question: 'How does the AI Assistant work?',
    answer:
      'The AI Assistant lets you ask questions about your database in plain English and get SQL queries back. It\'s schema-aware, so it understands your tables and relationships. You can also generate charts and visualizations from your data. Bring your own API key from OpenAI, Anthropic, Google, Groq, or use local Ollama models for complete privacy.',
  },
  {
    question: 'What AI providers are supported?',
    answer:
      'We support OpenAI (GPT-4o, GPT-4), Anthropic (Claude), Google (Gemini), Groq for ultra-fast inference, and Ollama for local models. You bring your own API key — we never see your keys or your data. For complete privacy, use Ollama with local models.',
  },
  {
    question: 'What databases are supported?',
    answer:
      'PostgreSQL, MySQL, and Microsoft SQL Server. We\'re focused on making the best experience for these databases. SQLite support is planned for future releases.',
  },
  {
    question: 'What counts as commercial use?',
    answer:
      'Commercial use means using data-peek for work-related activities in a for-profit organization of 2+ people. This includes developers at startups/companies, freelancers billing clients, and agencies doing client work. Solo founders (company of one) are free!',
  },
  {
    question: 'Is data-peek open source?',
    answer:
      'Yes! The source code is MIT licensed on GitHub. You can view, modify, fork, and build it yourself for any purpose. Pre-built binaries require a license for commercial use — this is how we sustain development.',
  },
  {
    question: 'What does "perpetual fallback" mean?',
    answer:
      'When you buy a Pro license ($29/year), you get 1 year of updates. If you don\'t renew, you keep your current version forever — it doesn\'t stop working. You just won\'t receive future updates. Renew anytime to get the latest.',
  },
  {
    question: "I'm a student. Can I use it for free?",
    answer:
      'Absolutely! Students and educators can use data-peek for free, even for school projects. Just reach out on X (@gillarohith) or email gillarohith1@gmail.com and we\'ll hook you up with a free license. Learning should never have barriers.',
  },
  {
    question: 'Is my data safe?',
    answer:
      'Yes. data-peek runs entirely on your machine. All queries go directly to your database — we never see your data. Connection credentials and AI API keys are encrypted locally. No telemetry, no analytics, no tracking. For AI features, you can use local Ollama models if you don\'t want data leaving your machine.',
  },
  {
    question: 'How many devices can I use?',
    answer:
      'Each license includes 3 device activations. Use it on your work laptop, home computer, and one more device. Need more? Just reach out.',
  },
  {
    question: 'Can I get a refund?',
    answer:
      'Yes, 30-day money-back guarantee, no questions asked. If data-peek isn\'t right for you, just email us.',
  },
]

export function FAQ() {
  const [openIndexes, setOpenIndexes] = useState<Set<number>>(new Set([0]))

  const toggleFaq = (index: number) => {
    setOpenIndexes((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  return (
    <section id="faq" className="relative py-24 sm:py-36 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[--color-surface]/20 to-transparent" />

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12 sm:mb-20">
          <p
            className="text-xs uppercase tracking-[0.25em] text-[--color-accent] mb-4 sm:mb-5"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            FAQ
          </p>
          <h2
            className="text-4xl sm:text-5xl md:text-6xl font-normal tracking-tight mb-4 sm:mb-6"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Questions? <span className="italic">Answers.</span>
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, index) => {
            const isOpen = openIndexes.has(index)
            return (
              <div
                key={index}
                className="rounded-xl border border-[--color-border] overflow-hidden bg-[--color-surface]/50 hover:border-[--color-border-glow]/50 transition-colors duration-300"
              >
                <button
                  onClick={() => toggleFaq(index)}
                  className="w-full flex items-center justify-between p-5 sm:p-6 text-left hover:bg-[--color-surface]/80 transition-colors"
                >
                  <span
                    className="text-sm sm:text-base font-normal pr-4"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {faq.question}
                  </span>
                  <div className={`w-8 h-8 rounded-lg bg-[--color-surface-elevated] border border-[--color-border] flex items-center justify-center flex-shrink-0 transition-all duration-300 ${isOpen ? 'bg-[--color-accent]/10 border-[--color-accent]/30' : ''}`}>
                    <ChevronDown
                      className={`w-4 h-4 text-[--color-text-muted] transition-transform duration-300 ${
                        isOpen ? 'rotate-180 text-[--color-accent]' : ''
                      }`}
                    />
                  </div>
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ease-out ${
                    isOpen ? 'max-h-96' : 'max-h-0'
                  }`}
                >
                  <p
                    className="px-5 sm:px-6 pb-5 sm:pb-6 text-sm text-[--color-text-secondary] leading-relaxed"
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    {faq.answer}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
