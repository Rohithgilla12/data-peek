"use client";

import { useSaleShown } from "@/hooks/use-sale-shown";
import { formatUsd, PRO_PRICE_CENTS, salePriceCents } from "@/lib/sale";

export function ProPrice() {
  const shown = useSaleShown();
  if (!shown) return <>{formatUsd(PRO_PRICE_CENTS)}</>;

  return (
    <>
      <s className="opacity-60">
        <span className="sr-only">was </span>
        {formatUsd(PRO_PRICE_CENTS)}
      </s>{" "}
      <span className="sr-only">now </span>
      {formatUsd(salePriceCents(PRO_PRICE_CENTS))}
    </>
  );
}
