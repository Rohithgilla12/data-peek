import { Metadata } from "next";
import { generateMetadata as generateSeoMetadata } from "@/lib/seo";

export const metadata: Metadata = generateSeoMetadata({
  title: "Download data-peek",
  description:
    "Download data-peek for macOS, Windows, or Linux. Free to download, no sign-up required. Start querying your databases in seconds.",
  keywords: [
    "download data-peek",
    "PostgreSQL client download",
    "database client macOS",
    "database client Windows",
    "database client Linux",
    "SQL editor download",
  ],
  path: "/download",
});

export default function DownloadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
