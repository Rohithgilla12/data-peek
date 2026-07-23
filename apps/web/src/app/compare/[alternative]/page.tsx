import { Footer } from "@/components/marketing/footer";
import { Header } from "@/components/marketing/header";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { StructuredData } from "@/components/seo/structured-data";
import { Button } from "@/components/ui/button";
import { generateMetadata as generateSeoMetadata } from "@/lib/seo";
import { Check, Download, ArrowRight, BarChart3 } from "lucide-react";
import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  FadeIn,
  StaggerContainer,
  StaggerItem,
} from "@/components/ui/motion-wrapper";
import { DataSubstrate } from "@/components/marketing/data-substrate";

const ALTERNATIVES = {
  pgadmin: {
    name: "pgAdmin",
    title: "data-peek vs pgAdmin",
    description:
      "A faster, keyboard-first Postgres client. data-peek gets you in, querying, and out — with a modern UI and built-in AI.",
    intro:
      "pgAdmin is the official PostgreSQL administration tool, and it is genuinely thorough — if you manage servers, roles, and backups all day, it is built for exactly that. data-peek is aimed at a different job: the developer who spends most of their time writing queries, inspecting data, and making quick edits, and who wants to be doing that within seconds of opening the app. Both connect to the same Postgres; they just optimise for different work.",
    whenAltTitle: "When pgAdmin is the better fit",
    whenAlt: [
      "You do heavy server administration — managing roles, tablespaces, replication, or scheduled backups.",
      "You want the official, PostgreSQL-maintained tool and nothing else.",
      "You rely on pgAdmin's built-in backup, restore, and server-monitoring dashboards.",
    ],
    whenUsTitle: "When data-peek is the better fit",
    whenUs: [
      "You mostly write queries and want the editor open and connected in under two seconds.",
      "You work across more than just Postgres — MySQL, SQL Server, and SQLite too.",
      "You prefer a keyboard-first, command-palette workflow over deep menu trees.",
      "You want a schema-aware AI assistant to draft and explain SQL.",
    ],
    migration:
      "There is nothing to migrate in the data sense — data-peek connects to the same database with the same connection details you already use for pgAdmin. Download data-peek, add your connection string, and your schema and data are there. Your database is untouched.",
    faqs: [
      {
        question: "Is data-peek a full replacement for pgAdmin?",
        answer:
          "For everyday querying, schema exploration, and data editing, yes. For deep server administration — replication management, scheduled backups, and server-level monitoring — pgAdmin remains the more complete tool. Many developers keep both.",
      },
      {
        question: "Is data-peek free?",
        answer:
          "data-peek is free for personal use, and its source is available under the MIT licence. Commercial use requires a licence.",
      },
      {
        question: "Does data-peek only support PostgreSQL?",
        answer:
          "No. data-peek also supports MySQL, Microsoft SQL Server, and SQLite, so a single client covers most of the databases a developer touches.",
      },
      {
        question: "Do I need to change my database to switch?",
        answer:
          "No. data-peek uses the same standard connection details. Nothing about your PostgreSQL server changes.",
      },
    ],
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
        feature: "Server Administration",
        datapeek: "Focused on querying",
        alternative: "Full DBA toolset",
        datapeekWins: false,
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
      "A lightweight, native alternative to DBeaver. data-peek trades everything-tool breadth for speed, a clean UI, and built-in AI.",
    intro:
      "DBeaver is a genuinely powerful universal client — it connects to dozens of databases through JDBC and packs in ER modelling, data transfer, and a deep plugin ecosystem. That breadth is its strength. data-peek makes the opposite trade: it supports the four databases most developers actually use day to day, and spends its effort on being fast, native, and quiet so that the data stays the centre of attention.",
    whenAltTitle: "When DBeaver is the better fit",
    whenAlt: [
      "You need niche or enterprise databases — Oracle, Snowflake, MongoDB, and many more via JDBC.",
      "You use advanced ER modelling or complex data-transfer pipelines between systems.",
      "You depend on its plugin ecosystem or the Enterprise edition's features.",
    ],
    whenUsTitle: "When data-peek is the better fit",
    whenUs: [
      "You mainly use PostgreSQL, MySQL, SQL Server, or SQLite and want them to feel instant.",
      "You want a native, lightweight app rather than a JVM-based one.",
      "You value a minimal, keyboard-first interface over a dense toolbar.",
      "You want a schema-aware AI assistant built in.",
    ],
    migration:
      "No data migration is involved — data-peek reads the same databases using the same connection details. Install data-peek alongside DBeaver, re-enter your connections, and keep both if it suits you. Nothing about your data changes.",
    faqs: [
      {
        question: "Does data-peek support as many databases as DBeaver?",
        answer:
          "No — and that is deliberate. data-peek focuses on PostgreSQL, MySQL, SQL Server, and SQLite. DBeaver supports far more database types via JDBC, so if you need Oracle, Snowflake, MongoDB, or similar, DBeaver is the better choice.",
      },
      {
        question: "Why would I switch from DBeaver?",
        answer:
          "Mostly speed and focus. data-peek is native and starts in under two seconds, with a minimal interface and a built-in AI assistant. If DBeaver's breadth is more than you need, data-peek is lighter to live in.",
      },
      {
        question: "Is data-peek open source?",
        answer:
          "Yes, the source is available under the MIT licence. It is free for personal use; commercial use requires a licence.",
      },
      {
        question: "Is data-peek built on Java like DBeaver?",
        answer:
          "No. data-peek is a native desktop application, which is a large part of why its startup and memory footprint are low.",
      },
    ],
    comparison: [
      {
        feature: "Startup Time",
        datapeek: "< 2 seconds",
        alternative: "5-10 seconds",
        datapeekWins: true,
      },
      {
        feature: "Resource Usage",
        datapeek: "Lightweight native",
        alternative: "Heavier (JVM-based)",
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
        alternative: "Dense, feature-rich",
        datapeekWins: true,
      },
      {
        feature: "Database Support",
        datapeek: "4 core databases",
        alternative: "Dozens via JDBC",
        datapeekWins: false,
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
      "A similar speed-first philosophy, with open source and built-in AI. Here is how data-peek and TablePlus compare.",
    intro:
      "TablePlus is a polished, fast, native client with a devoted following, and it earns it — the experience is smooth and it supports a wide range of databases. data-peek shares the same speed-and-minimalism philosophy, and adds two things TablePlus does not: it is open source under the MIT licence, and it ships a schema-aware AI assistant. TablePlus, in turn, supports more database engines and has a longer, more battle-tested track record.",
    whenAltTitle: "When TablePlus is the better fit",
    whenAlt: [
      "You need its broader range of supported databases and connection types.",
      "You want a mature product with years of polish behind it.",
      "You already own a licence and are happy with it.",
    ],
    whenUsTitle: "When data-peek is the better fit",
    whenUs: [
      "You want an open-source client you can read, fork, and trust.",
      "You want a built-in, bring-your-own-key AI assistant for writing and explaining SQL.",
      "You are working across PostgreSQL, MySQL, SQL Server, or SQLite and want them free for personal use.",
    ],
    migration:
      "Switching is low-friction: data-peek connects with the same connection details you use in TablePlus, and your data is never touched. Install it, add your connections, and try it alongside TablePlus before deciding.",
    faqs: [
      {
        question: "Is data-peek really free when TablePlus is paid?",
        answer:
          "data-peek is free for personal use and open source under the MIT licence. TablePlus uses a one-time paid licence for its full version. For commercial use, data-peek requires a licence.",
      },
      {
        question: "Does data-peek support as many databases as TablePlus?",
        answer:
          "TablePlus supports a wider range of database engines. data-peek focuses on PostgreSQL, MySQL, SQL Server, and SQLite, which covers most developers' day-to-day needs.",
      },
      {
        question: "What does data-peek add over TablePlus?",
        answer:
          "Two main things: an open-source codebase under the MIT licence, and a built-in, schema-aware AI assistant that uses your own API key.",
      },
      {
        question: "Can I run both?",
        answer:
          "Yes. They connect to the same databases with the same credentials, so there is no cost to keeping both installed while you decide.",
      },
    ],
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
        feature: "Database Support",
        datapeek: "4 core databases",
        alternative: "Wider range",
        datapeekWins: false,
      },
      {
        feature: "Maturity",
        datapeek: "Newer, fast-moving",
        alternative: "Long track record",
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
      <StructuredData
        type="faq"
        data={{ faq: altInfo.faqs.map((faq) => ({ ...faq })) }}
      />
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
                  <BarChart3 className="w-3.5 h-3.5 text-(--color-accent)" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-(--color-text-secondary)">
                    Comparison
                  </span>
                </div>
              </div>

              <h1 className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tighter leading-[0.9] mb-10 text-white font-mono uppercase">
                vs
                <br />
                <span className="text-(--color-text-secondary)">
                  {altInfo.name}.
                </span>
              </h1>
              <p className="text-base sm:text-xl text-(--color-text-muted) max-w-2xl mx-auto mb-12 font-mono leading-relaxed">
                {altInfo.description}
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                <Button
                  size="xl"
                  className="group rounded-full px-10 shadow-2xl shadow-(--color-accent)/20 hover:shadow-(--color-accent)/40 transition-all duration-500"
                  asChild
                >
                  <Link href="/download">
                    <Download className="w-5 h-5 group-hover:animate-bounce" />
                    <span>Try data-peek</span>
                  </Link>
                </Button>
              </div>
            </section>
          </FadeIn>

          {/* Intro */}
          <FadeIn>
            <section className="mb-24 max-w-3xl mx-auto">
              <p className="text-base sm:text-lg text-(--color-text-secondary) font-mono leading-relaxed">
                {altInfo.intro}
              </p>
            </section>
          </FadeIn>

          {/* Comparison Table */}
          <section className="mb-24">
            <FadeIn>
              <div className="rounded-[2.5rem] bg-white/[0.03] border border-white/10 overflow-hidden shadow-3xl glass">
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5">
                        <th className="p-6 sm:p-8 text-[10px] uppercase tracking-[0.2em] font-bold text-(--color-text-muted)">
                          Feature
                        </th>
                        <th className="p-6 sm:p-8 text-[10px] uppercase tracking-[0.2em] font-bold text-(--color-accent)">
                          data-peek
                        </th>
                        <th className="p-6 sm:p-8 text-[10px] uppercase tracking-[0.2em] font-bold text-(--color-text-muted)">
                          {altInfo.name}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {altInfo.comparison.map((row) => (
                        <tr
                          key={row.feature}
                          className="group hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="p-6 sm:p-8 text-sm font-bold text-white uppercase tracking-wider">
                            {row.feature}
                          </td>
                          <td className="p-6 sm:p-8">
                            <div className="flex items-center gap-3">
                              <span
                                className={`text-sm ${row.datapeekWins ? "text-white" : "text-(--color-text-secondary)"}`}
                              >
                                {row.datapeek}
                              </span>
                              {row.datapeekWins && (
                                <div className="p-1 rounded-full bg-(--color-success)/10 border border-(--color-success)/20">
                                  <Check className="w-3.5 h-3.5 text-(--color-success)" />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-6 sm:p-8">
                            <span className="text-sm text-(--color-text-muted)">
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

          {/* Honest take: when each tool fits */}
          <section className="mb-24 grid gap-6 md:grid-cols-2">
            <FadeIn>
              <div className="h-full rounded-[2rem] bg-white/[0.02] border border-white/10 p-8">
                <h2 className="text-lg font-bold mb-6 font-mono uppercase tracking-widest text-white">
                  {altInfo.whenUsTitle}
                </h2>
                <ul className="space-y-4">
                  {altInfo.whenUs.map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <div className="mt-1 p-1 rounded-full bg-(--color-accent)/10 border border-(--color-accent)/20 shrink-0">
                        <Check className="w-3 h-3 text-(--color-accent)" />
                      </div>
                      <span className="text-sm text-(--color-text-secondary) font-mono leading-relaxed">
                        {point}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>
            <FadeIn>
              <div className="h-full rounded-[2rem] bg-white/[0.02] border border-white/10 p-8">
                <h2 className="text-lg font-bold mb-6 font-mono uppercase tracking-widest text-white">
                  {altInfo.whenAltTitle}
                </h2>
                <ul className="space-y-4">
                  {altInfo.whenAlt.map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <div className="mt-1 p-1 rounded-full bg-white/10 border border-white/20 shrink-0">
                        <Check className="w-3 h-3 text-(--color-text-muted)" />
                      </div>
                      <span className="text-sm text-(--color-text-secondary) font-mono leading-relaxed">
                        {point}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>
          </section>

          {/* Migration */}
          <FadeIn>
            <section className="mb-24 max-w-3xl mx-auto rounded-[2rem] bg-white/[0.02] border border-white/10 p-8 sm:p-10">
              <h2 className="text-lg font-bold mb-4 font-mono uppercase tracking-widest text-white">
                Switching from {altInfo.name}
              </h2>
              <p className="text-sm sm:text-base text-(--color-text-secondary) font-mono leading-relaxed">
                {altInfo.migration}
              </p>
            </section>
          </FadeIn>

          {/* FAQ */}
          <section className="mb-32 max-w-3xl mx-auto">
            <FadeIn>
              <h2 className="text-2xl sm:text-4xl font-bold mb-12 font-mono uppercase tracking-widest text-center text-white">
                FAQ
              </h2>
            </FadeIn>
            <StaggerContainer className="space-y-4">
              {altInfo.faqs.map((faq) => (
                <StaggerItem
                  key={faq.question}
                  className="rounded-[1.5rem] bg-white/[0.02] border border-white/10 p-6 sm:p-8"
                >
                  <h3 className="text-sm sm:text-base font-bold text-white font-mono mb-3">
                    {faq.question}
                  </h3>
                  <p className="text-sm text-(--color-text-muted) font-mono leading-relaxed">
                    {faq.answer}
                  </p>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </section>

          {/* CTA Section */}
          <FadeIn>
            <section className="relative rounded-[3rem] bg-white/[0.02] border border-white/10 p-8 sm:p-16 text-center overflow-hidden">
              <div className="absolute inset-0 grid-pattern opacity-10" />
              <div className="absolute inset-0 bg-gradient-to-br from-(--color-accent)/5 to-purple-600/5" />

              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-(--color-accent)/10 flex items-center justify-center mx-auto mb-8 border border-(--color-accent)/20">
                  <BarChart3 className="w-8 h-8 text-(--color-accent)" />
                </div>
                <h2 className="text-3xl sm:text-5xl font-bold mb-6 font-mono uppercase tracking-widest text-white">
                  See for yourself.
                </h2>
                <p className="text-base sm:text-lg text-(--color-text-muted) mb-10 font-mono max-w-xl mx-auto leading-relaxed">
                  data-peek is free for personal use and installs in seconds.
                  Point it at your database and see how a fast, focused client
                  feels.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                  <Button
                    size="xl"
                    className="group rounded-2xl px-12 bg-(--color-accent) text-(--color-background) hover:bg-(--color-accent)/90 shadow-2xl shadow-(--color-accent)/20 font-mono uppercase tracking-widest font-bold"
                    asChild
                  >
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
