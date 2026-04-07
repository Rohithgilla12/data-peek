import { Footer } from "@/components/marketing/footer";
import { Header } from "@/components/marketing/header";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Button } from "@/components/ui/button";
import { generateMetadata as generateSeoMetadata } from "@/lib/seo";
import { Check, Download, ArrowRight, BarChart3 } from "lucide-react";
import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FadeIn, StaggerContainer, StaggerItem, ScaleIn } from "@/components/ui/motion-wrapper";
import { DataSubstrate } from "@/components/marketing/data-substrate";
import React from "react";

const ALTERNATIVES = {
  pgadmin: {
    name: "pgAdmin",
    title: "data-peek vs pgAdmin",
    description:
      "Stop waiting for pgAdmin to load. data-peek is lighter, faster, and built for modern engineering workflows.",
    comparison: [
      {
        feature: "Startup Time",
        datapeek: "< 2 seconds",
        alternative: "10-15 seconds",
        datapeekWins: true,
      },
      {
        feature: "User Interface",
        datapeek: "Modern, keyboard-first",
        alternative: "Traditional, mouse-heavy",
        datapeekWins: true,
      },
      {
        feature: "AI Assistant",
        datapeek: "Yes (Built-in)",
        alternative: "No",
        datapeekWins: true,
      },
      {
        feature: "Multi-Database",
        datapeek: "PostgreSQL, MySQL, SQL Server, SQLite",
        alternative: "PostgreSQL only",
        datapeekWins: true,
      },
      {
        feature: "Query Performance",
        datapeek: "Advanced telemetry",
        alternative: "Basic",
        datapeekWins: true,
      },
      {
        feature: "Price",
        datapeek: "Free (personal)",
        alternative: "Free",
        datapeekWins: false,
      },
    ],
    color: "#336791",
    keywords: ["pgAdmin alternative", "pgAdmin vs data-peek"],
  },
  dbeaver: {
    name: "DBeaver",
    title: "data-peek vs DBeaver",
    description:
      "Ditch the enterprise Java bloat. data-peek offers a focused, clean, and AI-powered experience for modern developers.",
    comparison: [
      {
        feature: "Startup Time",
        datapeek: "< 2 seconds",
        alternative: "5-10 seconds",
        datapeekWins: true,
      },
      {
        feature: "Resource Usage",
        datapeek: "Lightweight Native",
        alternative: "Heavy (Java-based)",
        datapeekWins: true,
      },
      {
        feature: "AI Assistant",
        datapeek: "Yes (Schema-aware)",
        alternative: "No",
        datapeekWins: true,
      },
      {
        feature: "User Interface",
        datapeek: "Modern, minimal",
        alternative: "Complex, cluttered",
        datapeekWins: true,
      },
      {
        feature: "Keyboard Experience",
        datapeek: "Command Palette first",
        alternative: "Toolbar heavy",
        datapeekWins: true,
      },
      {
        feature: "Price",
        datapeek: "Free (personal)",
        alternative: "Free (Community)",
        datapeekWins: false,
      },
    ],
    color: "#fbbf24",
    keywords: ["DBeaver alternative", "DBeaver vs data-peek"],
  },
  tableplus: {
    name: "TablePlus",
    title: "data-peek vs TablePlus",
    description:
      "Similar philosophy, but data-peek is open source and includes deeper AI-powered integrations.",
    comparison: [
      {
        feature: "Open Source",
        datapeek: "Yes (MIT)",
        alternative: "No",
        datapeekWins: true,
      },
      {
        feature: "AI Assistant",
        datapeek: "Yes (BYOK)",
        alternative: "No",
        datapeekWins: true,
      },
      {
        feature: "Price",
        datapeek: "Free (personal)",
        alternative: "$89 one-time",
        datapeekWins: true,
      },
      {
        feature: "Startup Time",
        datapeek: "< 2 seconds",
        alternative: "3-5 seconds",
        datapeekWins: true,
      },
      {
        feature: "Query Performance",
        datapeek: "Advanced telemetry",
        alternative: "Standard",
        datapeekWins: true,
      },
      {
        feature: "Resource Usage",
        datapeek: "Optimized native",
        alternative: "High performance",
        datapeekWins: false,
      },
    ],
    color: "#10b981",
    keywords: ["TablePlus alternative", "TablePlus vs data-peek"],
  },
} as const;

type AlternativeSlug = keyof typeof ALTERNATIVES;

interface ComparePageProps {
  params: Promise<{ alternative: string }>;
}

export async function generateStaticParams() {
  return Object.keys(ALTERNATIVES).map((alternative) => ({
    alternative,
  }));
}

export async function generateMetadata({
  params,
}: ComparePageProps): Promise<Metadata> {
  const { alternative } = await params;
  const altInfo = ALTERNATIVES[alternative as AlternativeSlug];

  if (!altInfo) {
    return {
      title: "Comparison Not Found | data-peek",
    };
  }

  return generateSeoMetadata({
    title: altInfo.title,
    description: altInfo.description,
    keywords: Array.from(altInfo.keywords),
    path: `/compare/${alternative}`,
  });
}

export default async function CompareDetailPage({ params }: ComparePageProps) {
  const { alternative } = await params;
  const altInfo = ALTERNATIVES[alternative as AlternativeSlug];

  if (!altInfo) {
    notFound();
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="relative pt-32 sm:pt-48 pb-24 overflow-hidden">
        {/* Backgrounds */}
        <div className="absolute inset-0 grid-pattern opacity-20" />
        <DataSubstrate />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6">
          <FadeIn>
            <div className="mb-12 flex justify-center">
              <Breadcrumbs
                items={[
                  { label: "Compare", href: "/compare" },
                  { label: altInfo.name, href: `/compare/${alternative}` },
                ]}
              />
            </div>

            {/* Hero Section */}
            <section className="text-center mb-20 sm:mb-32">
              <div className="flex items-center justify-center gap-3 mb-8">
                <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 glass-card">
                  <BarChart3 className="w-3.5 h-3.5 text-[--color-accent]" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[--color-text-secondary]">
                    Comparison
                  </span>
                </div>
              </div>

              <h1
                className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tighter leading-[0.9] mb-10 text-white font-mono uppercase"
              >
                vs
                <br />
                <span className="text-[--color-text-secondary]">{altInfo.name}.</span>
              </h1>
              <p className="text-base sm:text-xl text-[--color-text-muted] max-w-2xl mx-auto mb-12 font-mono leading-relaxed">
                {altInfo.description}
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                <Button size="xl" className="group rounded-full px-10 shadow-2xl shadow-[--color-accent]/20 hover:shadow-[--color-accent]/40 transition-all duration-500" asChild>
                  <Link href="/download">
                    <Download className="w-5 h-5 group-hover:animate-bounce" />
                    <span>Switch to data-peek</span>
                  </Link>
                </Button>
              </div>
            </section>
          </FadeIn>

          {/* Comparison Table */}
          <section className="mb-32">
            <FadeIn>
              <div className="rounded-[2.5rem] bg-white/[0.03] border border-white/10 overflow-hidden shadow-3xl glass">
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5">
                        <th className="p-6 sm:p-8 text-[10px] uppercase tracking-[0.2em] font-bold text-[--color-text-muted]">
                          Feature
                        </th>
                        <th className="p-6 sm:p-8 text-[10px] uppercase tracking-[0.2em] font-bold text-[--color-accent]">
                          data-peek
                        </th>
                        <th className="p-6 sm:p-8 text-[10px] uppercase tracking-[0.2em] font-bold text-[--color-text-muted]">
                          {altInfo.name}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {altInfo.comparison.map((row, index) => (
                        <tr
                          key={row.feature}
                          className="group hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="p-6 sm:p-8 text-sm font-bold text-white uppercase tracking-wider">
                            {row.feature}
                          </td>
                          <td className="p-6 sm:p-8">
                            <div className="flex items-center gap-3">
                              <span className={`text-sm ${row.datapeekWins ? 'text-white' : 'text-[--color-text-secondary]'}`}>{row.datapeek}</span>
                              {row.datapeekWins && (
                                <div className="p-1 rounded-full bg-[--color-success]/10 border border-[--color-success]/20">
                                  <Check className="w-3.5 h-3.5 text-[--color-success]" />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-6 sm:p-8">
                            <span className="text-sm text-[--color-text-muted]">
                              {row.alternative}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </FadeIn>
          </section>

          {/* CTA Section */}
          <FadeIn>
            <section className="relative rounded-[3rem] bg-white/[0.02] border border-white/10 p-8 sm:p-16 text-center overflow-hidden">
              <div className="absolute inset-0 grid-pattern opacity-10" />
              <div className="absolute inset-0 bg-gradient-to-br from-[--color-accent]/5 to-purple-600/5" />
              
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-[--color-accent]/10 flex items-center justify-center mx-auto mb-8 border border-[--color-accent]/20">
                  <BarChart3 className="w-8 h-8 text-[--color-accent]" />
                </div>
                <h2
                  className="text-3xl sm:text-5xl font-bold mb-6 font-mono uppercase tracking-widest text-white"
                >
                  See the difference.
                </h2>
                <p className="text-base sm:text-lg text-[--color-text-muted] mb-10 font-mono max-w-xl mx-auto leading-relaxed">
                  Experience why thousands of developers are making the switch from {altInfo.name} to a modern, AI-powered workflow.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                  <Button size="xl" className="group rounded-2xl px-12 bg-[--color-accent] text-[--color-background] hover:bg-[--color-accent]/90 shadow-2xl shadow-[--color-accent]/20 font-mono uppercase tracking-widest font-bold" asChild>
                    <Link href="/download">
                      Download data-peek
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </Link>
                  </Button>
                </div>
              </div>
            </section>
          </FadeIn>
        </div>
      </main>
      <Footer />
    </div>
  );
}
