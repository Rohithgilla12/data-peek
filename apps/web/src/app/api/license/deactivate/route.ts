import { NextRequest, NextResponse } from "next/server";
import { normalizeLicenseKey } from "@/lib/license-key";
import { deactivateDevice } from "@/lib/license-overview";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { license_key: rawLicenseKey, instance_id } = body as {
      license_key?: string;
      instance_id?: string;
    };
    const license_key = rawLicenseKey ? normalizeLicenseKey(rawLicenseKey) : "";

    if (!license_key || !instance_id) {
      return NextResponse.json(
        { error: "License key and instance_id are required" },
        { status: 400 },
      );
    }

    const result = await deactivateDevice(license_key, instance_id);

    // The desktop app deactivates idempotently, so an activation that is
    // already gone (or never belonged to this key) still reports success.
    if (result === "deactivated") {
      console.log(
        `[deactivate] Deactivated ${license_key} instance ${instance_id}`,
      );
    }

    return NextResponse.json({
      success: true,
      message: "License deactivated successfully",
    });
  } catch (error) {
    console.error("License deactivation error:", error);
    return NextResponse.json(
      { error: "Failed to deactivate license" },
      { status: 500 },
    );
  }
}
