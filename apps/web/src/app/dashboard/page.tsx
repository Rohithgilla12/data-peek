import { Metadata } from "next";
import { Header } from "@/components/marketing/header";
import { Footer } from "@/components/marketing/footer";
import { generateMetadata as generateSeoMetadata } from "@/lib/seo";
import { LicenseDashboardClient } from "./dashboard-client";

export const metadata: Metadata = generateSeoMetadata({
  title: "License dashboard",
  description:
    "See the devices using your data-peek Pro license and free up activation slots.",
  path: "/dashboard",
  noindex: true,
});

export default function DashboardPage() {
  return (
    <div className="neat min-h-screen">
      <Header />
      <main>
        <section className="relative">
          <div className="mx-auto max-w-[960px] px-5 sm:px-8 py-24 sm:py-32">
            <div className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--n-fg-faint)]">
              license — devices
            </div>
            <h1 className="mt-4 text-[32px] sm:text-[40px] leading-[1.05] tracking-[-0.02em] text-[var(--n-fg)] font-medium">
              Manage your license.
            </h1>
            <p className="mt-4 text-[13px] leading-[1.65] text-[var(--n-fg-muted)] max-w-[72ch]">
              Your license key is all you need here. Reinstalling your OS
              registers the app as a new device, so remove the old entry to free
              its slot.
            </p>
            <div className="mt-10">
              <LicenseDashboardClient />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
