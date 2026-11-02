import { NextRequest, NextResponse } from "next/server";
import { db, licenses, activations } from "@/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { normalizeLicenseKey } from "@/lib/license";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("[activate] Request body:", JSON.stringify(body));

    const {
      license_key: rawLicenseKey,
      name,
      device_id,
      os,
      app_version,
    } = body as {
      license_key: string;
      name: string;
      device_id?: string;
      os?: string;
      app_version?: string;
    };

    const license_key = rawLicenseKey ? normalizeLicenseKey(rawLicenseKey) : "";

    if (!license_key || !name) {
      return NextResponse.json(
        { error: "License key and device name are required" },
        { status: 400 },
      );
    }

    // Find license in our database
    const license = await db.query.licenses.findFirst({
      where: eq(licenses.licenseKey, license_key),
    });

    if (!license) {
      return NextResponse.json(
        { error: "License key not found" },
        { status: 404 },
      );
    }

    if (license.status !== "active") {
      return NextResponse.json(
        { error: `License is ${license.status}` },
        { status: 400 },
      );
    }

    // Check if this device is already activated
    let activation = device_id
      ? await db.query.activations.findFirst({
          where: and(
            eq(activations.licenseId, license.id),
            eq(activations.deviceId, device_id),
          ),
        })
      : null;

    // A device freed from the dashboard takes a slot again when it re-activates.
    if (!activation?.isActive) {
      const currentActivations = await db.query.activations.findMany({
        where: and(
          eq(activations.licenseId, license.id),
          eq(activations.isActive, true),
        ),
      });

      if (currentActivations.length >= license.maxActivations) {
        return NextResponse.json(
          {
            error: `Activation limit reached (${license.maxActivations} devices)`,
          },
          { status: 400 },
        );
      }
    }

    if (activation) {
      await db
        .update(activations)
        .set({
          lastValidatedAt: new Date(),
          appVersion: app_version,
          deviceName: name,
          isActive: true,
        })
        .where(eq(activations.id, activation.id));

      console.log(`[activate] Updated existing activation for ${license_key}`);
    } else {
      // Create new activation
      const instanceId = randomUUID();
      const [newActivation] = await db
        .insert(activations)
        .values({
          licenseId: license.id,
          deviceId: device_id || randomUUID(),
          deviceName: name,
          os,
          appVersion: app_version,
          instanceId,
        })
        .returning();

      activation = newActivation;
      console.log(
        `[activate] Created new activation for ${license_key}: ${instanceId}`,
      );
    }

    // Check updates availability
    const now = new Date();
    const updatesAvailable = license.updatesUntil > now;

    return NextResponse.json({
      success: true,
      id: activation.instanceId,
      license_key,
      name,
      updates_available: updatesAvailable,
      updates_until: license.updatesUntil.toISOString(),
      plan: license.plan,
    });
  } catch (error) {
    console.error("[activate] Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
