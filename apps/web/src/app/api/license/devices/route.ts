import { NextRequest, NextResponse } from "next/server";
import { normalizeLicenseKey } from "@/lib/license";
import { getLicenseOverview } from "@/lib/license-overview";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { license_key: rawLicenseKey } = body as { license_key?: string };
    const license_key = rawLicenseKey ? normalizeLicenseKey(rawLicenseKey) : "";

    if (!license_key) {
      return NextResponse.json(
        { success: false, error: "License key is required" },
        { status: 400 },
      );
    }

    const license = await getLicenseOverview(license_key);

    if (!license) {
      return NextResponse.json(
        { success: false, error: "License key not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, license });
  } catch (error) {
    console.error("[devices] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load license" },
      { status: 500 },
    );
  }
}
