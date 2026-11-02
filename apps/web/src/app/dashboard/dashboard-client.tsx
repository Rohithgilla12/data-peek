"use client";

import dynamic from "next/dynamic";

export const LicenseDashboardClient = dynamic(
  () => import("./license-dashboard").then((m) => m.LicenseDashboard),
  { ssr: false, loading: () => <div className="h-[88px]" /> },
);
