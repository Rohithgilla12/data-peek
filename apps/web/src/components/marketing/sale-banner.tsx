"use client";

import Link from "next/link";
import { useSaleShown } from "@/hooks/use-sale-shown";
import { floatHref } from "@/lib/float";
import { BLACK_FRIDAY } from "@/lib/sale";

export function SaleBanner() {
  const shown = useSaleShown();
  if (!shown) return null;

  const { percentOff, sisterProduct } = BLACK_FRIDAY;

  return (
    <aside
      aria-label="Black Friday sale"
      className="neat"
      style={{
        background: "var(--n-bg-sunken)",
        borderBottom: "1px solid var(--n-line-soft)",
      }}
    >
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-center gap-x-4 gap-y-1 px-5 py-2 text-[11.5px] sm:px-8">
        <Link
          href="/#pricing"
          className="inline-flex items-center gap-2 text-[var(--n-fg)] hover:text-[var(--n-accent)] transition-colors"
        >
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--n-accent)" }}
          />
          Black Friday: data-peek Pro {percentOff}% off, applied at checkout
          <span aria-hidden className="text-[var(--n-fg-faint)]">
            →
          </span>
        </Link>
        <Link
          href={floatHref("sale-banner")}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--n-fg-muted)] hover:text-[var(--n-fg)] transition-colors"
        >
          {sisterProduct.name} Pro is {percentOff}% off too with{" "}
          <span
            className="px-1 tabular-nums text-[var(--n-fg)]"
            style={{ border: "1px solid var(--n-line)" }}
          >
            {sisterProduct.code}
          </span>
        </Link>
      </div>
    </aside>
  );
}
