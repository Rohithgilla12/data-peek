import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LicenseDashboard } from "../license-dashboard";
import type { LicenseDevice, LicenseOverview } from "@/lib/license-overview";

const KEY = "DPRO-AAAA-BBBB-CCCC-DDDD";

function device(instanceId: string, deviceName: string): LicenseDevice {
  return {
    instanceId,
    deviceName,
    os: "macos",
    appVersion: "0.36.0",
    activatedAt: "2026-01-10T00:00:00.000Z",
    lastValidatedAt: "2026-02-01T00:00:00.000Z",
  };
}

type Call = { url: string; body: Record<string, string> };

function fakeServer(devices: LicenseDevice[]) {
  const calls: Call[] = [];
  let active = [...devices];
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status });

  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, body });
    if (url === "/api/license/devices") {
      if (body.license_key !== KEY) {
        return json(404, { success: false, error: "License key not found" });
      }
      const license: LicenseOverview = {
        licenseKey: KEY,
        plan: "pro",
        status: "active",
        maxActivations: 3,
        updatesUntil: "2027-01-01T00:00:00.000Z",
        devices: active,
      };
      return json(200, { success: true, license });
    }
    if (url === "/api/license/deactivate") {
      active = active.filter((d) => d.instanceId !== body.instance_id);
      return json(200, { success: true, message: "ok" });
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, "", "/dashboard");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LicenseDashboard", () => {
  it("loads a lowercase ?key= deep link and strips the key from the URL", async () => {
    const calls = fakeServer([device("i-1", "Work Mac")]);
    window.history.replaceState(
      null,
      "",
      `/dashboard?key=${KEY.toLowerCase()}`,
    );

    render(<LicenseDashboard />);

    expect(await screen.findByText("Work Mac")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 used")).toBeInTheDocument();
    expect(calls[0]).toEqual({
      url: "/api/license/devices",
      body: { license_key: KEY },
    });
    expect(window.location.search).toBe("");
    expect(sessionStorage.getItem("datapeek.dashboard.licenseKey")).toBe(KEY);
    expect(localStorage.length).toBe(0);
  });

  it("uppercases a typed key and shows a not-found error inline", async () => {
    fakeServer([]);
    const user = userEvent.setup();
    render(<LicenseDashboard />);

    const input = screen.getByLabelText("License key");
    await user.type(input, "dpro-zzzz-zzzz-zzzz-zzzz");
    expect(input).toHaveValue("DPRO-ZZZZ-ZZZZ-ZZZZ-ZZZZ");

    await user.click(screen.getByRole("button", { name: "Show devices" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "License key not found",
    );
    expect(screen.getByLabelText("License key")).toBeInTheDocument();
    expect(sessionStorage.length).toBe(0);
  });

  it("removes a device and refetches the overview", async () => {
    const calls = fakeServer([
      device("i-old", "Old install"),
      device("i-new", "New install"),
    ]);
    sessionStorage.setItem("datapeek.dashboard.licenseKey", KEY);
    const user = userEvent.setup();
    render(<LicenseDashboard />);

    const oldRow = (await screen.findByText("Old install")).closest("li")!;
    await user.click(within(oldRow).getByRole("button", { name: /remove/i }));

    await waitFor(() =>
      expect(screen.queryByText("Old install")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("New install")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 used")).toBeInTheDocument();
    expect(calls.map((c) => c.url)).toEqual([
      "/api/license/devices",
      "/api/license/deactivate",
      "/api/license/devices",
    ]);
    expect(calls[1].body).toEqual({ license_key: KEY, instance_id: "i-old" });
  });

  it("shows an empty state when no device is active", async () => {
    fakeServer([]);
    sessionStorage.setItem("datapeek.dashboard.licenseKey", KEY);
    render(<LicenseDashboard />);

    expect(await screen.findByText(/No active devices/)).toBeInTheDocument();
    expect(screen.getByText("0 of 3 used")).toBeInTheDocument();
  });

  it("keeps the device and shows an inline error when removal fails", async () => {
    fakeServer([device("i-1", "Work Mac")]);
    sessionStorage.setItem("datapeek.dashboard.licenseKey", KEY);
    const user = userEvent.setup();
    render(<LicenseDashboard />);

    await screen.findByText("Work Mac");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    await user.click(screen.getByRole("button", { name: /remove/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not remove that device",
    );
    expect(screen.getByText("Work Mac")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove/i })).toBeEnabled();
  });
});
