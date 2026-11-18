import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pricing } from "../pricing";
import { ProPrice } from "../pro-price";

function at(iso: string, search = "") {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
  window.history.replaceState(null, "", `/${search}`);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Pro price during Black Friday", () => {
  it("strikes $29 and shows $17.40 while the sale is live", () => {
    at("2026-11-27T12:00:00Z");
    const { container } = render(<ProPrice />);
    expect(container.querySelector("s")?.textContent).toBe("was $29");
    expect(container.textContent).toBe("was $29 now $17.40");
  });

  it("shows the plain $29 outside the sale", () => {
    at("2026-12-02T08:00:00Z");
    const { container } = render(<ProPrice />);
    expect(container.textContent).toBe("$29");
    expect(container.querySelector("s")).toBeNull();
  });

  it("shows sale pricing on the Pro card under ?sale=preview", () => {
    at("2026-11-10T12:00:00Z", "?sale=preview");
    render(<Pricing />);
    expect(screen.getByText("$17.40")).toBeInTheDocument();
    expect(screen.getByText("$29")).toHaveClass("line-through");
    expect(screen.getByText("Black Friday · 40% off")).toBeInTheDocument();
    expect(
      screen.getByText(/Code BF26PEEK is applied at checkout, until 1 Dec \(Pacific time\)\./),
    ).toBeInTheDocument();
  });

  it("keeps the regular Pro card outside the sale", () => {
    at("2026-11-10T12:00:00Z");
    render(<Pricing />);
    expect(screen.getByText("$29")).not.toHaveClass("line-through");
    expect(screen.getByText("$99")).toHaveClass("line-through");
    expect(screen.getByText("70% off")).toBeInTheDocument();
    expect(screen.queryByText("$17.40")).toBeNull();
    expect(screen.queryByText(/BF26PEEK/)).toBeNull();
  });
});
