import type { Metadata } from "next";
import Script from "next/script";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import {
  generateMetadata as generateSeoMetadata,
  SITE_CONFIG,
} from "@/lib/seo";
import { ReactScan } from "@/components/marketing/react-scan";
import { StructuredData } from "@/components/seo/structured-data";

export const metadata: Metadata = generateSeoMetadata({
  title: SITE_CONFIG.title,
  description: SITE_CONFIG.description,
  keywords: [
    "PostgreSQL",
    "MySQL",
    "SQL Server",
    "SQLite",
    "database client",
    "SQL editor",
    "database management",
    "pgAdmin alternative",
    "DBeaver alternative",
    "TablePlus alternative",
    "database GUI",
    "SQL query tool",
    "database explorer",
    "AI SQL assistant",
    "database visualization",
  ],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#6b8cf5",
          colorBackground: "#111113",
          colorInputBackground: "#18181b",
          colorInputText: "#fafafa",
        },
      }}
    >
      <html lang="en">
        <body className="antialiased">
          <ReactScan />
          <StructuredData type="organization" />
          <StructuredData type="software" />
          {children}
          <Script
            src="https://giveme.gilla.fun/script.js"
            strategy="afterInteractive"
          />
          <Script id="microsoft-clarity" strategy="afterInteractive">
            {`
              (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window, document, "clarity", "script", "ukb66wt82h");
            `}
          </Script>
          <Script
            src="https://cdn.littlestats.click/embed/ooehabrtts8lb37"
            strategy="afterInteractive"
          />
          <Script
            src="https://scripts.simpleanalyticscdn.com/latest.js"
            strategy="afterInteractive"
            async
          />
          <Analytics />
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
