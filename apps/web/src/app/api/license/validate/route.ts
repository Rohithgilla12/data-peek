import { NextRequest, NextResponse } from "next/server";
import { db, licenses } from "@/db";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { license_key: rawLicenseKey } = body as { license_key: string };

    // Normalize license key to uppercase (our keys are uppercase)
    const license_key = rawLicenseKey?.toUpperCase().trim();

    if (!license_key) {
      return NextResponse.json(
        { valid: false, error: "License key is required" },
        { status: 400 },
      );
    }

    // Check our database
    const license = await db.query.licenses.findFirst({
      where: eq(licenses.licenseKey, license_key),
    });

    if (!license) {
      return NextResponse.json({
        valid: false,
        error: "License key not found",
      });
    }

    if (license.status !== "active") {
      return NextResponse.json({
        valid: false,
        error: `License is ${license.status}`,
      });
    }

    // Determine if updates are still available
    const now = new Date();
    const updatesAvailable = license.updatesUntil > now;

    return NextResponse.json({
      valid: true,
      license_key,
      status: license.status,
      activations_limit: license.maxActivations,
      updates_available: updatesAvailable,
      updates_until: license.updatesUntil.toISOString(),
      plan: license.plan,
    });
  } catch (error) {
    console.error("License validation error:", error);
    return NextResponse.json(
      { valid: false, error: "Failed to validate license" },
      { status: 500 },
    );
  }
}
