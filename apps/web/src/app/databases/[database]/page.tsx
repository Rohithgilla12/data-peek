import { Footer } from "@/components/marketing/footer";
import { Header } from "@/components/marketing/header";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Button } from "@/components/ui/button";
import { generateMetadata as generateSeoMetadata } from "@/lib/seo";
import { ArrowRight, Check, Download } from "lucide-react";
import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

const DATABASES = {
  postgresql: {
    name: "PostgreSQL",
    description:
      "Connect to PostgreSQL databases with data-peek. Fast query execution, schema exploration, and AI-powered SQL generation for PostgreSQL.",
    features: [
      "Native PostgreSQL protocol support",
      "Schema browser with table relationships",
      "Query execution with EXPLAIN ANALYZE",
      "PostgreSQL-specific data types",
      "Connection pooling support",
      "Transaction management",
    ],
    keywords: [
      "PostgreSQL client",
      "PostgreSQL GUI",
      "PostgreSQL database tool",
      "pgAdmin alternative",
      "PostgreSQL query tool",
      "PostgreSQL management",
    ],
    icon: "🐘",
  },
  mysql: {
    name: "MySQL",
    description:
      "Manage MySQL databases effortlessly with data-peek. Fast queries, schema visualization, and intuitive editing for MySQL and MariaDB.",
    features: [
      "MySQL and MariaDB support",
      "Schema visualization",
      "Query optimization tools",
      "MySQL-specific features",
      "Connection management",
      "Data export capabilities",
    ],
    keywords: [
      "MySQL client",
      "MySQL GUI",
      "MySQL database tool",
      "MySQL query tool",
      "MariaDB client",
      "MySQL management",
    ],
    icon: "🐬",
  },
  "sql-server": {
    name: "SQL Server",
    description:
      "Connect to Microsoft SQL Server databases with data-peek. Professional database management with support for SQL Server and Azure SQL.",
    features: [
      "SQL Server and Azure SQL support",
      "T-SQL syntax highlighting",
      "SQL Server-specific features",
      "Connection encryption",
      "Query performance analysis",
      "Schema exploration",
    ],
    keywords: [
      "SQL Server client",
      "SQL Server GUI",
      "Azure SQL client",
      "SQL Server management",
      "T-SQL editor",
      "Microsoft SQL Server tool",
    ],
    icon: "🗄️",
  },
  sqlite: {
    name: "SQLite",
    description:
      "Work with SQLite databases locally using data-peek. Perfect for development, testing, and managing local SQLite databases.",
    features: [
      "Local SQLite file support",
      "Fast query execution",
      "Schema browser",
      "Data editing capabilities",
      "Export to multiple formats",
      "Lightweight and fast",
    ],
    keywords: [
      "SQLite client",
      "SQLite GUI",
      "SQLite database tool",
      "SQLite browser",
      "SQLite management",
      "local database tool",
    ],
    icon: "💾",
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
      <main className="pt-24 sm:pt-32 pb-16 sm:pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <Breadcrumbs
            items={[
              { label: "Databases", href: "/databases" },
              { label: dbInfo.name, href: `/databases/${database}` },
            ]}
          />

          {/* Hero Section */}
          <section className="text-center mb-12 sm:mb-16">
            <div className="text-6xl mb-4">{dbInfo.icon}</div>
            <h1
              className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight mb-4"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {dbInfo.name} Client
            </h1>
            <p className="text-base sm:text-lg text-[--color-text-secondary] max-w-2xl mx-auto mb-8">
              {dbInfo.description}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" asChild>
                <Link href="/download">
                  <Download className="w-4 h-4" />
                  Download Free
                </Link>
              </Button>
              <Button variant="secondary" size="lg" asChild>
                <Link href="/#features">
                  View Features
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </section>

          {/* Features Section */}
          <section className="mb-12 sm:mb-16">
            <h2
              className="text-2xl sm:text-3xl font-semibold mb-6 sm:mb-8"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Features for {dbInfo.name}
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {dbInfo.features.map((feature) => (
                <div
                  key={feature}
                  className="flex items-start gap-3 p-4 rounded-lg bg-[--color-surface] border border-[--color-border]"
                >
                  <Check className="w-5 h-5 text-[--color-success] shrink-0 mt-0.5" />
                  <span className="text-sm text-[--color-text-secondary]">
                    {feature}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* CTA Section */}
          <section className="rounded-xl sm:rounded-2xl bg-linear-to-r from-[--color-accent]/10 to-transparent border border-[--color-accent]/20 p-6 sm:p-8 text-center">
            <h2
              className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Ready to get started?
            </h2>
            <p className="text-sm sm:text-base text-[--color-text-secondary] mb-6 sm:mb-8">
              Download data-peek and start managing your {dbInfo.name} databases
              today.
            </p>
            <Button size="lg" asChild>
              <Link href="/download">
                Download Free
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
