import { Metadata } from "next";
import { Header } from "@/components/marketing/header";
import { HeroV2 as Hero } from "@/components/marketing/hero-v2";
import { ScrollProgress } from "@/components/ui/scroll-progress";
// Features layout variants:
import { FeaturesTabbed as Features } from "@/components/marketing/features-tabbed";
import { Pricing } from "@/components/marketing/pricing";
import { FAQ } from "@/components/marketing/faq";
import { CTA } from "@/components/marketing/cta";
import { Footer } from "@/components/marketing/footer";
import { PokemonBuddy } from "@/components/marketing/pokemon-buddy";
import { generateMetadata as generateSeoMetadata } from "@/lib/seo";

export const metadata: Metadata = generateSeoMetadata({
  title: "data-peek | Fast PostgreSQL Client for Developers",
  description:
    "A lightning-fast, AI-powered database client for PostgreSQL, MySQL, SQL Server, and SQLite. Query, explore, and edit your data with a keyboard-first experience. Free for personal use.",
  keywords: [
    "PostgreSQL client",
    "MySQL client",
    "SQL Server client",
    "SQLite client",
    "database client",
    "SQL editor",
    "database management tool",
    "pgAdmin alternative",
    "DBeaver alternative",
    "TablePlus alternative",
    "AI SQL assistant",
    "database GUI",
    "SQL query tool",
    "database explorer",
  ],
  path: "/",
});

export default function Home() {
  return (
    <div className="min-h-screen">
      <ScrollProgress />
      <Header />
      <main>
        <Hero />
        <Features />
        <Pricing />
        <FAQ />
        <CTA />
      </main>
      <Footer />
      <PokemonBuddy />
    </div>
  );
}
