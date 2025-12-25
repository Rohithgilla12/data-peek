import { activations, db } from "@/db";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { license_key: rawLicenseKey, instance_id } = body as {
      license_key: string;
      instance_id: string;
    };

    // Normalize license key to uppercase
    const license_key = rawLicenseKey?.toUpperCase().trim();

    if (!license_key || !instance_id) {
      return NextResponse.json(
        { error: "License key and instance_id are required" },
        { status: 400 }
      );
    }

    // Find and deactivate by instance_id
    const activation = await db.query.activations.findFirst({
      where: eq(activations.instanceId, instance_id),
    });

    if (!activation) {
      // Already deactivated or doesn't exist - treat as success
      return NextResponse.json({
        success: true,
        message: "License deactivated successfully",
      });
    }

    // Mark as inactive
    await db
      .update(activations)
      .set({ isActive: false })
      .where(eq(activations.instanceId, instance_id));

    console.log(
      `[deactivate] Deactivated ${license_key} instance ${instance_id}`
    );

    return NextResponse.json({
      success: true,
      message: "License deactivated successfully",
    });
  } catch (error) {
    console.error("License deactivation error:", error);
    return NextResponse.json(
      { error: "Failed to deactivate license" },
      { status: 500 }
    );
  }
}
