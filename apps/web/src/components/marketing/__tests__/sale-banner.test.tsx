import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SaleBanner } from "../sale-banner";

// Lets act() flush hydration here; RTL sets this itself but is not used.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const BANNER = "Black Friday: data-peek Pro 40% off, applied at checkout";

async function serverThenHydrate(now: string, search = "") {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
  window.history.replaceState(null, "", `/${search}`);

  const html = renderToString(<SaleBanner />);
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);

  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  await act(async () => {
    hydrateRoot(container, <SaleBanner />);
  });
  return { html, container, consoleError };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("SaleBanner", () => {
  it("is absent from the server HTML even during the sale, then appears after hydration without a mismatch", async () => {
    const { html, container, consoleError } = await serverThenHydrate(
      "2026-11-27T12:00:00Z",
    );

    expect(html).toBe("");
    expect(container.textContent).toContain(BANNER);
    expect(container.textContent).toContain(
      "Float Pro is 40% off too with BF26FLOAT",
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("links the Float clause to float.gilla.fun", async () => {
    const { container } = await serverThenHydrate("2026-11-27T12:00:00Z");
    const float = [...container.querySelectorAll("a")].find((a) =>
      a.textContent?.includes("BF26FLOAT"),
    );
    expect(float?.getAttribute("href")).toMatch(
      /^https:\/\/float\.gilla\.fun\//,
    );
  });

  it("stays hidden before the sale", async () => {
    const { container } = await serverThenHydrate("2026-11-10T12:00:00Z");
    expect(container.textContent).toBe("");
  });

  it("shows before the sale with ?sale=preview", async () => {
    const { container } = await serverThenHydrate(
      "2026-11-10T12:00:00Z",
      "?sale=preview",
    );
    expect(container.textContent).toContain(BANNER);
  });

  it("is gone once the sale ends", async () => {
    const { container } = await serverThenHydrate("2026-12-02T08:00:00Z");
    expect(container.textContent).toBe("");
  });
});
