import { FLOAT_URL } from "./float";

export const PRO_PRICE_CENTS = 2900;

export const BLACK_FRIDAY = {
  code: "BF26PEEK",
  percentOff: 40,
  startsAt: "2026-11-26T00:00:00Z",
  endsAt: "2026-12-02T08:00:00Z", // exclusive; end of 1 Dec US Pacific
  sisterProduct: { name: "Float", code: "BF26FLOAT", url: FLOAT_URL },
} as const;

const startsAtMs = Date.parse(BLACK_FRIDAY.startsAt);
const endsAtMs = Date.parse(BLACK_FRIDAY.endsAt);

export function saleIsLive(now: Date): boolean {
  const t = now.getTime();
  return t >= startsAtMs && t < endsAtMs;
}

// Display only. `?sale=preview` lets the sale UI be reviewed before launch;
// the checkout route checks saleIsLive alone, so it never applies the code.
export function saleIsShown(now: Date, search: string): boolean {
  return (
    saleIsLive(now) || new URLSearchParams(search).get("sale") === "preview"
  );
}

// endsAt is exclusive, so the last day is the Pacific date one ms before it.
export const saleLastDay = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "America/Los_Angeles",
}).format(endsAtMs - 1);

export function salePriceCents(cents: number): number {
  return Math.floor((cents * (100 - BLACK_FRIDAY.percentOff)) / 100);
}

export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return cents % 100 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
