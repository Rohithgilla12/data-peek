"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle, MessageCircle } from "lucide-react";
import { StructuredData } from "@/components/seo/structured-data";
import {
  FadeIn,
  StaggerContainer,
  StaggerItem,
} from "@/components/ui/motion-wrapper";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const faqs = [
  {
    question: "Is data-peek really free?",
    answer:
      "Yes! data-peek is free for personal use with all features unlocked. No credit card required, no time limits, no feature restrictions. A license is only required if you use it for commercial purposes at a for-profit company with 2+ people.",
  },
  {
    question: "How does the AI Assistant work?",
    answer:
      "The AI Assistant lets you ask questions about your database in plain English and get SQL queries back. It's schema-aware, so it understands your tables and relationships. You can also generate charts and visualizations from your data. Bring your own API key from OpenAI, Anthropic, Google, Groq, or use local Ollama models for complete privacy.",
  },
  {
    question: "What AI providers are supported?",
    answer:
      "We support OpenAI (GPT-4o, GPT-4), Anthropic (Claude), Google (Gemini), Groq for ultra-fast inference, and Ollama for local models. You bring your own API key — we never see your keys or your data. For complete privacy, use Ollama with local models.",
  },
  {
    question: "What databases are supported?",
    answer:
      "PostgreSQL, MySQL, and Microsoft SQL Server. We're focused on making the best experience for these databases. SQLite support is planned for future releases.",
  },
  {
    question: "What counts as commercial use?",
    answer:
      "Commercial use means using data-peek for work-related activities in a for-profit organization of 2+ people. This includes developers at startups/companies, freelancers billing clients, and agencies doing client work. Solo founders (company of one) are free!",
  },
  {
    question: "Is data-peek open source?",
    answer:
      "Yes! The source code is MIT licensed on GitHub. You can view, modify, fork, and build it yourself for any purpose. Pre-built binaries require a license for commercial use — this is how we sustain development.",
  },
  {
    question: 'What does "perpetual fallback" mean?',
    answer:
      "When you buy a Pro license ($29/year), you get 1 year of updates. If you don't renew, you keep your current version forever — it doesn't stop working. You just won't receive future updates. Renew anytime to get the latest.",
  },
  {
    question: "I'm a student. Can I use it for free?",
    answer:
      "Absolutely! Students and educators can use data-peek for free, even for school projects. Just reach out on X (@gillarohith) or email gillarohith1@gmail.com and we'll hook you up with a free license. Learning should never have barriers.",
  },
  {
    question: "Is my data safe?",
    answer:
      "Yes. data-peek runs entirely on your machine. All queries go directly to your database — we never see your data. Connection credentials and AI API keys are encrypted locally. No telemetry, no analytics, no tracking. For AI features, you can use local Ollama models if you don't want data leaving your machine.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="relative py-32 sm:py-48 overflow-hidden">
      <StructuredData type="faq" data={{ faq: faqs }} />
      <div className="absolute inset-0 grid-pattern opacity-5" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6">
        <FadeIn className="text-center mb-16 sm:mb-24">
          <p className="text-[12px] uppercase tracking-[0.4em] text-[--color-accent] mb-6 font-bold font-mono">
            // Knowledge Base
          </p>
          <h2 className="text-4xl sm:text-6xl md:text-7xl font-bold tracking-tighter leading-[0.9] mb-8">
            Questions?
            <br />
            <span className="text-[--color-text-secondary]">Answers.</span>
          </h2>
        </FadeIn>

        <StaggerContainer className="space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <StaggerItem key={index}>
                <div
                  className={`group rounded-[2rem] border transition-all duration-500 overflow-hidden ${
                    isOpen
                      ? "bg-white/[0.04] border-white/10 shadow-2xl shadow-black/20"
                      : "bg-white/[0.01] border-white/5 hover:bg-white/[0.02] hover:border-white/10"
                  }`}
                >
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="w-full flex items-center justify-between p-6 sm:p-8 text-left transition-colors"
                  >
                    <span className="text-base sm:text-lg font-bold font-mono uppercase tracking-widest text-[--color-text-primary] pr-6">
                      {faq.question}
                    </span>
                    <div
                      className={`p-2 rounded-xl transition-all duration-300 ${isOpen ? "bg-[--color-accent] text-[--color-background] rotate-180" : "bg-white/5 text-[--color-text-muted] rotate-0"}`}
                    >
                      <ChevronDown className="w-5 h-5" />
                    </div>
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <div className="px-6 sm:px-8 pb-8">
                          <p className="text-sm sm:text-base text-[--color-text-secondary] font-mono leading-relaxed opacity-80 border-t border-white/5 pt-6">
                            {faq.answer}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>

        <FadeIn className="mt-20 text-center">
          <div className="inline-flex items-center gap-4 p-4 rounded-3xl bg-white/[0.02] border border-white/5 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-2xl bg-[--color-accent]/10 flex items-center justify-center border border-[--color-accent]/20">
              <MessageCircle className="w-5 h-5 text-[--color-accent]" />
            </div>
            <p className="text-sm font-mono text-[--color-text-muted] pr-4">
              Still have questions?{" "}
              <Link
                href="https://x.com/gillarohith"
                target="_blank"
                className="text-[--color-accent] hover:underline uppercase tracking-widest font-bold"
              >
                Ask me on X
              </Link>
            </p>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
