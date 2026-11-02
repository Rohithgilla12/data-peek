// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Activation, License } from "@/db";
import { normalizeLicenseKey } from "@/lib/license";
import {
  deactivateDeviceQuery,
  toLicenseOverview,
} from "@/lib/license-overview";

const license: License = {
  id: "lic-1",
  customerId: "cus-1",
  licenseKey: "DPRO-AAAA-BBBB-CCCC-DDDD",
  plan: "pro",
  status: "active",
  maxActivations: 3,
  dodoPaymentId: null,
  dodoProductId: null,
  purchasedAt: new Date("2026-01-01T00:00:00Z"),
  updatesUntil: new Date("2027-01-01T00:00:00Z"),
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

function activation(
  instanceId: string,
  activatedAt: string,
  isActive = true,
): Activation {
  return {
    id: `act-${instanceId}`,
    licenseId: license.id,
    instanceId,
    deviceId: `dev-${instanceId}`,
    deviceName: `Mac ${instanceId}`,
    os: "macos",
    appVersion: "0.36.0",
    activatedAt: new Date(activatedAt),
    lastValidatedAt: new Date(activatedAt),
    isActive,
  };
}

describe("normalizeLicenseKey", () => {
  it("uppercases and trims a pasted key", () => {
    expect(normalizeLicenseKey("  dpro-abcd-efgh-jkmn-pqrs\n")).toBe(
      "DPRO-ABCD-EFGH-JKMN-PQRS",
    );
  });
});

describe("toLicenseOverview", () => {
  it("lists only active devices, oldest activation first", () => {
    const overview = toLicenseOverview(license, [
      activation("c", "2026-03-01T00:00:00Z"),
      activation("old-install", "2026-01-15T00:00:00Z", false),
      activation("a", "2026-01-10T00:00:00Z"),
      activation("b", "2026-02-01T00:00:00Z"),
    ]);

    expect(overview.devices.map((d) => d.instanceId)).toEqual(["a", "b", "c"]);
    expect(overview.devices[0]).toEqual({
      instanceId: "a",
      deviceName: "Mac a",
      os: "macos",
      appVersion: "0.36.0",
      activatedAt: "2026-01-10T00:00:00.000Z",
      lastValidatedAt: "2026-01-10T00:00:00.000Z",
    });
    expect(overview).toMatchObject({
      licenseKey: "DPRO-AAAA-BBBB-CCCC-DDDD",
      plan: "pro",
      status: "active",
      maxActivations: 3,
      updatesUntil: "2027-01-01T00:00:00.000Z",
    });
  });
});

describe("deactivateDeviceQuery", () => {
  it("only matches an activation that belongs to the given licence key", () => {
    const { sql, params } = deactivateDeviceQuery(
      "DPRO-AAAA-BBBB-CCCC-DDDD",
      "instance-1",
    ).toSQL();

    expect(sql).toMatch(
      /"activations"\."instance_id" = \$\d+ and "activations"\."license_id" = \(select "licenses"\."id" from "licenses" where "licenses"\."license_key" = \$\d+\)/,
    );
    expect(params).toEqual(
      expect.arrayContaining(["instance-1", "DPRO-AAAA-BBBB-CCCC-DDDD"]),
    );
  });
});
