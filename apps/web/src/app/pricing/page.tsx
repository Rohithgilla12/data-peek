import { Metadata } from "next";
import { Header } from "@/components/marketing/header";
import { Pricing } from "@/components/marketing/pricing";
import { Faq } from "@/components/marketing/faq";
import { Footer } from "@/components/marketing/footer";
import { generateMetadata as generateSeoMetadata } from "@/lib/seo";

export const metadata: Metadata = generateSeoMetadata({
  title: "Pricing",
  description:
    "data-peek is free for personal use. Buy a Pro license for commercial use — one payment, 1 year of updates, perpetual fallback license. No seats, no subscriptions.",
  keywords: [
    "data-peek pricing",
    "data-peek license",
    "database client pricing",
    "SQL client license",
    "buy data-peek",
  ],
  path: "/pricing",
});

export default function PricingPage() {
  return (
    <div className="neat min-h-screen">
      <Header />
      <main>
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
