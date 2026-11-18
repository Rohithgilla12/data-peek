import { describe, expect, it } from "vitest";
import {
  formatUsd,
  PRO_PRICE_CENTS,
  saleIsLive,
  saleLastDay,
  saleIsShown,
  salePriceCents,
} from "../sale";

describe("saleIsLive", () => {
  it.each([
    ["2026-11-25T23:59:59.999Z", false],
    ["2026-11-26T00:00:00.000Z", true],
    ["2026-12-01T23:59:59.000-08:00", true],
    ["2026-12-02T08:00:00.000Z", false],
    ["2027-11-27T00:00:00.000Z", false],
  ])("%s -> %s", (iso, expected) => {
    expect(saleIsLive(new Date(iso))).toBe(expected);
  });
});

describe("saleIsShown", () => {
  const before = new Date("2026-11-18T12:00:00Z");

  it("shows the sale outside the window only with ?sale=preview", () => {
    expect(saleIsShown(before, "")).toBe(false);
    expect(saleIsShown(before, "?sale=preview")).toBe(true);
    expect(saleIsShown(before, "?utm_source=x&sale=preview")).toBe(true);
    expect(saleIsShown(before, "?sale=yes")).toBe(false);
  });

  it("shows the sale inside the window with no param", () => {
    expect(saleIsShown(new Date("2026-11-28T12:00:00Z"), "")).toBe(true);
  });
});

describe("sale price", () => {
  it("takes 40% off $29 to $17.40", () => {
    expect(formatUsd(salePriceCents(PRO_PRICE_CENTS))).toBe("$17.40");
  });

  it("floors to the cent", () => {
    expect(salePriceCents(1001)).toBe(600);
  });

  it("drops the cents on whole dollars", () => {
    expect(formatUsd(PRO_PRICE_CENTS)).toBe("$29");
  });
});

describe("saleLastDay", () => {
  it("is the last Pacific day of the sale", () => {
    expect(saleLastDay).toBe("1 Dec");
  });
});
