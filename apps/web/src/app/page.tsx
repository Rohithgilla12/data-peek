import { Metadata } from "next";
import { Header } from "@/components/marketing/header";
import { Hero } from "@/components/marketing/hero";
import { FeatureShowcase } from "@/components/marketing/feature-showcase";
import { AiSection } from "@/components/marketing/ai-section";
import { Features } from "@/components/marketing/features";
import { Pricing } from "@/components/marketing/pricing";
import { Faq } from "@/components/marketing/faq";
import { Cta } from "@/components/marketing/cta";
import { Footer } from "@/components/marketing/footer";
import { generateMetadata as generateSeoMetadata } from "@/lib/seo";

export const metadata: Metadata = generateSeoMetadata({
  title: "data-peek | Fast PostgreSQL Client for Developers",
  description:
    "A lightning-fast SQL client with AI that runs on your Claude Code, Codex, or Antigravity subscription. Query, explore, and edit PostgreSQL, MySQL, SQL Server, and SQLite, and query ClickHouse (beta). Free for personal use.",
  keywords: [
    "PostgreSQL client",
    "MySQL client",
    "SQL Server client",
    "SQLite client",
    "ClickHouse client",
    "database client",
    "SQL editor",
    "database management tool",
    "pgAdmin alternative",
    "DBeaver alternative",
    "TablePlus alternative",
    "AI SQL assistant",
    "Claude Code database client",
    "Codex SQL client",
    "AI SQL client",
    "database GUI",
    "SQL query tool",
    "database explorer",
  ],
  path: "/",
});

export default function Home() {
  return (
    <div className="neat min-h-screen">
      <Header />
      <main>
        <Hero />
        <FeatureShowcase />
        <AiSection />
        <Features />
        <Pricing />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
