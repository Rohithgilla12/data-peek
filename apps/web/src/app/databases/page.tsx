import { Footer } from "@/components/marketing/footer";
import { Header } from "@/components/marketing/header";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { generateMetadata as generateSeoMetadata } from "@/lib/seo";
import { ArrowRight } from "lucide-react";
import { Metadata } from "next";
import Link from "next/link";

const databases = [
  {
    slug: "postgresql",
    name: "PostgreSQL",
    description:
      "Fast PostgreSQL client with native protocol support and advanced features.",
    icon: "🐘",
    href: "/databases/postgresql",
  },
  {
    slug: "mysql",
    name: "MySQL",
    description: "Manage MySQL and MariaDB databases with ease.",
    icon: "🐬",
    href: "/databases/mysql",
  },
  {
    slug: "sql-server",
    name: "SQL Server",
    description: "Connect to Microsoft SQL Server and Azure SQL databases.",
    icon: "🗄️",
    href: "/databases/sql-server",
  },
  {
    slug: "sqlite",
    name: "SQLite",
    description:
      "Work with local SQLite databases for development and testing.",
    icon: "💾",
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
      <main className="pt-24 sm:pt-32 pb-16 sm:pb-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <Breadcrumbs items={[{ label: "Databases", href: "/databases" }]} />

          {/* Hero Section */}
          <section className="text-center mb-12 sm:mb-16">
            <h1
              className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight mb-4"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Supported Databases
            </h1>
            <p className="text-base sm:text-lg text-[--color-text-secondary] max-w-2xl mx-auto">
              One client for all your database needs. Connect to PostgreSQL,
              MySQL, SQL Server, and SQLite.
            </p>
          </section>

          {/* Database Grid */}
          <section>
            <div className="grid sm:grid-cols-2 gap-6">
              {databases.map((db) => (
                <Link
                  key={db.slug}
                  href={db.href}
                  className="group relative p-6 sm:p-8 rounded-xl sm:rounded-2xl bg-[--color-surface] border border-[--color-border] hover:border-[--color-accent]/40 transition-all duration-300 hover:-translate-y-1"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="text-5xl">{db.icon}</div>
                    <ArrowRight className="w-5 h-5 text-[--color-text-muted] group-hover:text-[--color-accent] group-hover:translate-x-1 transition-all" />
                  </div>
                  <h2
                    className="text-xl sm:text-2xl font-semibold mb-2"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {db.name}
                  </h2>
                  <p className="text-sm sm:text-base text-[--color-text-secondary]">
                    {db.description}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
