import { and, eq, sql } from "drizzle-orm";
import { activations, db, licenses, type Activation, type License } from "@/db";

export type LicenseDevice = {
  instanceId: string;
  deviceName: string | null;
  os: string | null;
  appVersion: string | null;
  activatedAt: string;
  lastValidatedAt: string;
};

export type LicenseOverview = {
  licenseKey: string;
  plan: string;
  status: string;
  maxActivations: number;
  updatesUntil: string;
  devices: LicenseDevice[];
};

export function toLicenseOverview(
  license: License,
  rows: Activation[],
): LicenseOverview {
  const devices = rows
    .filter((row) => row.isActive)
    .sort((a, b) => a.activatedAt.getTime() - b.activatedAt.getTime())
    .map((row) => ({
      instanceId: row.instanceId,
      deviceName: row.deviceName,
      os: row.os,
      appVersion: row.appVersion,
      activatedAt: row.activatedAt.toISOString(),
      lastValidatedAt: row.lastValidatedAt.toISOString(),
    }));

  return {
    licenseKey: license.licenseKey,
    plan: license.plan,
    status: license.status,
    maxActivations: license.maxActivations,
    updatesUntil: license.updatesUntil.toISOString(),
    devices,
  };
}

export async function getLicenseOverview(
  licenseKey: string,
): Promise<LicenseOverview | null> {
  const found = await db.query.licenses.findFirst({
    where: eq(licenses.licenseKey, licenseKey),
    with: { activations: true },
  });
  if (!found) return null;
  const { activations: rows, ...license } = found;
  return toLicenseOverview(license, rows);
}

// The licence-key subquery is the ownership check: an instance id alone must
// never be enough to free a slot on someone else's licence.
export function deactivateDeviceQuery(licenseKey: string, instanceId: string) {
  return db
    .update(activations)
    .set({ isActive: false })
    .where(
      and(
        eq(activations.instanceId, instanceId),
        eq(
          activations.licenseId,
          sql`(select ${licenses.id} from ${licenses} where ${licenses.licenseKey} = ${licenseKey})`,
        ),
      ),
    )
    .returning({ id: activations.id });
}

export async function deactivateDevice(
  licenseKey: string,
  instanceId: string,
): Promise<"deactivated" | "not_found"> {
  const updated = await deactivateDeviceQuery(licenseKey, instanceId);
  return updated.length > 0 ? "deactivated" : "not_found";
}
