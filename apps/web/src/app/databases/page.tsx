import { Footer } from "@/components/marketing/footer";
import { Header } from "@/components/marketing/header";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { generateMetadata as generateSeoMetadata } from "@/lib/seo";
import { ArrowRight, Database } from "lucide-react";
import { Metadata } from "next";
import Link from "next/link";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/ui/motion-wrapper";
import { DataSubstrate } from "@/components/marketing/data-substrate";

const databases = [
  {
    slug: "postgresql",
    name: "PostgreSQL",
    description:
      "Advanced features for the world's most advanced open-source database. EXPLAIN ANALYZE, custom types, and more.",
    icon: "🐘",
    color: "#336791",
    href: "/databases/postgresql",
  },
  {
    slug: "mysql",
    name: "MySQL",
    description: "Lightning-fast management for MySQL and MariaDB. Perfect for web applications and scale.",
    icon: "🐬",
    color: "#00758f",
    href: "/databases/mysql",
  },
  {
    slug: "sql-server",
    name: "SQL Server",
    description: "Professional toolset for Microsoft SQL Server and Azure SQL. T-SQL support and schema insights.",
    icon: "🗄️",
    color: "#cc2927",
    href: "/databases/sql-server",
  },
  {
    slug: "sqlite",
    name: "SQLite",
    description:
      "The best local database experience. Ideal for development, testing, and embedded data management.",
    icon: "💾",
    color: "#003b57",
    href: "/databases/sqlite",
  },
];

export const metadata: Metadata = generateSeoMetadata({
  title: "Supported Databases",
  description:
    "data-peek supports PostgreSQL, MySQL, SQL Server, and SQLite. One client for all your database needs.",
  keywords: [
    "PostgreSQL client",
    "MySQL client",
    "SQL Server client",
    "SQLite client",
    "multi-database client",
    "database management",
  ],
  path: "/databases",
});

export default function DatabasesPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="relative pt-32 sm:pt-48 pb-24 overflow-hidden">
        {/* Backgrounds */}
        <div className="absolute inset-0 grid-pattern opacity-20" />
        <DataSubstrate />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
          <FadeIn>
            <div className="mb-8 flex justify-center">
              <Breadcrumbs items={[{ label: "Databases", href: "/databases" }]} />
            </div>

            {/* Hero Section */}
            <section className="text-center mb-20 sm:mb-32">
              <p className="text-[12px] uppercase tracking-[0.4em] text-(--color-accent) mb-6 font-bold font-mono">
                // Ecosystem
              </p>
              <h1
                className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tighter leading-[0.9] mb-8 text-white font-mono uppercase"
              >
                Supported
                <br />
                <span className="text-(--color-text-secondary)">Databases.</span>
              </h1>
              <p className="text-base sm:text-xl text-(--color-text-muted) max-w-2xl mx-auto font-mono leading-relaxed">
                One client for all your database needs. Connect to PostgreSQL,
                MySQL, SQL Server, and SQLite with a unified experience.
              </p>
            </section>
          </FadeIn>

          {/* Database Grid */}
          <StaggerContainer className="grid sm:grid-cols-2 gap-6 lg:gap-8 max-w-5xl mx-auto">
            {databases.map((db) => (
              <StaggerItem key={db.slug}>
                <Link
                  href={db.href}
                  className="group relative p-8 rounded-[2.5rem] bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-all duration-500 border-flow overflow-hidden block h-full"
                  style={{ '--feature-color': db.color } as React.CSSProperties}
                >
                  <div className="flex items-start justify-between mb-8">
                    <div className="text-6xl group-hover:scale-110 transition-transform duration-500">{db.icon}</div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-(--color-text-muted) group-hover:text-(--color-accent) group-hover:border-(--color-accent)/30 transition-all">
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                  <h2
                    className="text-2xl sm:text-3xl font-bold mb-4 font-mono uppercase tracking-widest text-white"
                  >
                    {db.name}
                  </h2>
                  <p className="text-sm sm:text-base text-(--color-text-secondary) font-mono leading-relaxed group-hover:text-white/90 transition-colors">
                    {db.description}
                  </p>

                  {/* Decorative corner icon */}
                  <div className="absolute -bottom-4 -right-4 opacity-5 group-hover:opacity-10 transition-opacity duration-500">
                    <Database className="w-32 h-32" />
                  </div>
                </Link>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </main>
      <Footer />
    </div>
  );
}
