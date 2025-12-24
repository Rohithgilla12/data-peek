import { Footer } from "@/components/marketing/footer";
import { Header } from "@/components/marketing/header";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { Button } from "@/components/ui/button";
import { generateMetadata as generateSeoMetadata } from "@/lib/seo";
import { Check, Download } from "lucide-react";
import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

const ALTERNATIVES = {
  pgadmin: {
    name: "pgAdmin",
    title: "data-peek vs pgAdmin",
    description:
      "Compare data-peek with pgAdmin. Faster startup, better UX, and modern features for PostgreSQL database management.",
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
        datapeek: "Yes",
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
      {
        feature: "Web Interface",
        datapeek: "Desktop app",
        alternative: "Web-based",
        datapeekWins: false,
      },
    ],
    keywords: [
      "pgAdmin alternative",
      "pgAdmin vs data-peek",
      "PostgreSQL client alternative",
      "better than pgAdmin",
    ],
  },
  dbeaver: {
    name: "DBeaver",
    title: "data-peek vs DBeaver",
    description:
      "Compare data-peek with DBeaver. Faster, lighter, and more focused on the essentials of database querying.",
    comparison: [
      {
        feature: "Startup Time",
        datapeek: "< 2 seconds",
        alternative: "5-10 seconds",
        datapeekWins: true,
      },
      {
        feature: "Resource Usage",
        datapeek: "Lightweight",
        alternative: "Heavy (Java-based)",
        datapeekWins: true,
      },
      {
        feature: "AI Assistant",
        datapeek: "Yes",
        alternative: "No",
        datapeekWins: true,
      },
      {
        feature: "User Interface",
        datapeek: "Modern, minimal",
        alternative: "Complex, feature-rich",
        datapeekWins: true,
      },
      {
        feature: "Keyboard Shortcuts",
        datapeek: "Comprehensive",
        alternative: "Limited",
        datapeekWins: true,
      },
      {
        feature: "Price",
        datapeek: "Free (personal)",
        alternative: "Free (Community)",
        datapeekWins: false,
      },
      {
        feature: "Database Support",
        datapeek: "4 databases",
        alternative: "80+ databases",
        datapeekWins: false,
      },
    ],
    keywords: [
      "DBeaver alternative",
      "DBeaver vs data-peek",
      "database client alternative",
      "better than DBeaver",
    ],
  },
  tableplus: {
    name: "TablePlus",
    title: "data-peek vs TablePlus",
    description:
      "Compare data-peek with TablePlus. Similar philosophy, but data-peek is open source and includes AI-powered features.",
    comparison: [
      {
        feature: "Open Source",
        datapeek: "Yes",
        alternative: "No",
        datapeekWins: true,
      },
      {
        feature: "AI Assistant",
        datapeek: "Yes",
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
        feature: "User Interface",
        datapeek: "Modern, minimal",
        alternative: "Modern, polished",
        datapeekWins: false,
      },
      {
        feature: "Query Performance",
        datapeek: "Advanced telemetry",
        alternative: "Good",
        datapeekWins: true,
      },
      {
        feature: "Database Support",
        datapeek: "4 databases",
        alternative: "10+ databases",
        datapeekWins: false,
      },
    ],
    keywords: [
      "TablePlus alternative",
      "TablePlus vs data-peek",
      "free TablePlus alternative",
      "open source database client",
    ],
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

export default async function ComparePage({ params }: ComparePageProps) {
  const { alternative } = await params;
  const altInfo = ALTERNATIVES[alternative as AlternativeSlug];

  if (!altInfo) {
    notFound();
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="pt-24 sm:pt-32 pb-16 sm:pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <Breadcrumbs
            items={[
              { label: "Compare", href: "/compare" },
              { label: altInfo.name, href: `/compare/${alternative}` },
            ]}
          />

          {/* Hero Section */}
          <section className="text-center mb-12 sm:mb-16">
            <h1
              className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight mb-4"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {altInfo.title}
            </h1>
            <p className="text-base sm:text-lg text-[--color-text-secondary] max-w-2xl mx-auto">
              {altInfo.description}
            </p>
          </section>

          {/* Comparison Table */}
          <section className="mb-12 sm:mb-16">
            <div className="rounded-xl sm:rounded-2xl bg-[--color-surface] border border-[--color-border] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[--color-border]">
                      <th className="text-left p-4 font-semibold text-sm">
                        Feature
                      </th>
                      <th className="text-center p-4 font-semibold text-sm">
                        data-peek
                      </th>
                      <th className="text-center p-4 font-semibold text-sm">
                        {altInfo.name}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {altInfo.comparison.map((row, index) => (
                      <tr
                        key={row.feature}
                        className={`border-b border-[--color-border-subtle] ${
                          index % 2 === 0 ? "bg-[--color-background]" : ""
                        }`}
                      >
                        <td className="p-4 text-sm font-medium">
                          {row.feature}
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-sm">{row.datapeek}</span>
                            {row.datapeekWins && (
                              <Check className="w-4 h-4 text-[--color-success]" />
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <span className="text-sm text-[--color-text-secondary]">
                            {row.alternative}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="rounded-xl sm:rounded-2xl bg-linear-to-r from-[--color-accent]/10 to-transparent border border-[--color-accent]/20 p-6 sm:p-8 text-center">
            <h2
              className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Ready to try data-peek?
            </h2>
            <p className="text-sm sm:text-base text-[--color-text-secondary] mb-6 sm:mb-8">
              Download free and see why developers are switching from{" "}
              {altInfo.name}.
            </p>
            <Button size="lg" asChild>
              <Link href="/download">
                <Download className="w-4 h-4" />
                Download Free
              </Link>
            </Button>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
