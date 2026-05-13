import { Footer } from "@/components/marketing/footer";
import { Header } from "@/components/marketing/header";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Button } from "@/components/ui/button";
import { generateMetadata as generateSeoMetadata } from "@/lib/seo";
import { ArrowRight, Check, Download, Sparkles, Database } from "lucide-react";
import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FadeIn, StaggerContainer, StaggerItem, ScaleIn } from "@/components/ui/motion-wrapper";
import { DataSubstrate } from "@/components/marketing/data-substrate";
import React from "react";

const DATABASES = {
  postgresql: {
    name: "PostgreSQL",
    description:
      "Advanced features for the world's most advanced open-source database. native protocol support, schema exploration, and AI-powered SQL generation.",
    features: [
      "Native PostgreSQL protocol support",
      "Schema browser with table relationships",
      "Query execution with EXPLAIN ANALYZE",
      "PostgreSQL-specific data types",
      "Connection pooling support",
      "Transaction management",
    ],
    color: "#336791",
    icon: "🐘",
    keywords: ["PostgreSQL client", "PostgreSQL GUI", "PostgreSQL tool"],
  },
  mysql: {
    name: "MySQL",
    description:
      "Lightning-fast management for MySQL and MariaDB. Fast queries, schema visualization, and intuitive editing.",
    features: [
      "MySQL and MariaDB support",
      "Schema visualization",
      "Query optimization tools",
      "MySQL-specific features",
      "Connection management",
      "Data export capabilities",
    ],
    color: "#00758f",
    icon: "🐬",
    keywords: ["MySQL client", "MySQL GUI", "MySQL tool"],
  },
  "sql-server": {
    name: "SQL Server",
    description:
      "Professional toolset for Microsoft SQL Server and Azure SQL. T-SQL support and deep schema insights.",
    features: [
      "SQL Server and Azure SQL support",
      "T-SQL syntax highlighting",
      "SQL Server-specific features",
      "Connection encryption",
      "Query performance analysis",
      "Schema exploration",
    ],
    color: "#cc2927",
    icon: "🗄️",
    keywords: ["SQL Server client", "SQL Server GUI", "SQL Server tool"],
  },
  sqlite: {
    name: "SQLite",
    description:
      "The best local database experience. Ideal for development, testing, and managing local SQLite databases.",
    features: [
      "Local SQLite file support",
      "Fast query execution",
      "Schema browser",
      "Data editing capabilities",
      "Export to multiple formats",
      "Lightweight and fast",
    ],
    color: "#003b57",
    icon: "💾",
    keywords: ["SQLite client", "SQLite GUI", "SQLite tool"],
  },
} as const;

type DatabaseSlug = keyof typeof DATABASES;

interface DatabasePageProps {
  params: Promise<{ database: string }>;
}

export async function generateStaticParams() {
  return Object.keys(DATABASES).map((database) => ({
    database,
  }));
}

export async function generateMetadata({
  params,
}: DatabasePageProps): Promise<Metadata> {
  const { database } = await params;
  const dbInfo = DATABASES[database as DatabaseSlug];

  if (!dbInfo) {
    return {
      title: "Database Not Found | data-peek",
    };
  }

  return generateSeoMetadata({
    title: `${dbInfo.name} Client - data-peek`,
    description: dbInfo.description,
    keywords: Array.from(dbInfo.keywords),
    path: `/databases/${database}`,
  });
}

export default async function DatabasePage({ params }: DatabasePageProps) {
  const { database } = await params;
  const dbInfo = DATABASES[database as DatabaseSlug];

  if (!dbInfo) {
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
                  { label: "Databases", href: "/databases" },
                  { label: dbInfo.name, href: `/databases/${database}` },
                ]}
              />
            </div>

            {/* Hero Section */}
            <section className="text-center mb-20 sm:mb-32">
              <ScaleIn>
                <div className="text-8xl mb-8 drop-shadow-2xl">{dbInfo.icon}</div>
              </ScaleIn>
              <h1
                className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tighter leading-[0.9] mb-8 text-white font-mono uppercase"
              >
                {dbInfo.name}
                <br />
                <span className="text-(--color-text-secondary)">Client.</span>
              </h1>
              <p className="text-base sm:text-xl text-(--color-text-muted) max-w-2xl mx-auto mb-12 font-mono leading-relaxed">
                {dbInfo.description}
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                <Button size="xl" className="group rounded-full px-10 shadow-2xl shadow-(--color-accent)/20 font-mono uppercase tracking-widest font-bold" asChild>
                  <Link href="/download">
                    <Download className="w-5 h-5 group-hover:animate-bounce" />
                    <span>Download Free</span>
                  </Link>
                </Button>
                <Button variant="outline" size="xl" className="rounded-full px-10 border-white/10 hover:bg-white/5 font-mono uppercase tracking-widest font-bold group" asChild>
                  <Link href="/#features">
                    <span className="text-white">View Features</span>
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform text-white" />
                  </Link>
                </Button>
              </div>
            </section>
          </FadeIn>

          {/* Features Section */}
          <section className="mb-32">
            <FadeIn>
              <h2
                className="text-2xl sm:text-4xl font-bold mb-12 font-mono uppercase tracking-widest text-center text-white"
              >
                Engineered for {dbInfo.name}
              </h2>
            </FadeIn>
            <StaggerContainer className="grid sm:grid-cols-2 gap-4 lg:gap-6">
              {dbInfo.features.map((feature) => (
                <StaggerItem
                  key={feature}
                  className="flex items-center gap-4 p-6 rounded-[2rem] bg-white/[0.03] border border-white/10 hover:bg-white/[0.05] transition-all group"
                >
                  <div className="p-2 rounded-xl bg-(--color-success)/10 border border-(--color-success)/20 group-hover:scale-110 transition-transform">
                    <Check className="w-5 h-5 text-(--color-success)" />
                  </div>
                  <span className="text-sm sm:text-base text-white font-mono opacity-80 group-hover:opacity-100 transition-opacity">
                    {feature}
                  </span>
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
                  <Database className="w-8 h-8 text-(--color-accent)" />
                </div>
                <h2
                  className="text-3xl sm:text-5xl font-bold mb-6 font-mono uppercase tracking-widest text-white"
                >
                  Ready to Peek?
                </h2>
                <p className="text-base sm:text-lg text-(--color-text-muted) mb-10 font-mono max-w-xl mx-auto leading-relaxed">
                  Join thousands of developers using data-peek to manage their {dbInfo.name} databases with speed and precision.
                </p>
                <Button size="xl" className="group rounded-2xl px-12 bg-(--color-accent) text-(--color-background) hover:bg-(--color-accent)/90 shadow-2xl shadow-(--color-accent)/20 font-mono uppercase tracking-widest font-bold" asChild>
                  <Link href="/download">
                    Download for Free
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Link>
                </Button>
              </div>
            </section>
          </FadeIn>
        </div>
      </main>
      <Footer />
    </div>
  );
}
