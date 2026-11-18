"use client";

import { useSyncExternalStore } from "react";
import { saleIsShown } from "@/lib/sale";

function subscribe() {
  return () => {};
}

function getSnapshot() {
  return saleIsShown(new Date(), window.location.search);
}

function getServerSnapshot() {
  return false;
}

// Marketing pages are prerendered at build time, so a date check during the
// server render would bake the deploy-time answer into the HTML. The server
// snapshot is always false and the real check runs right after hydration, so
// the first client render still matches the HTML.
export function useSaleShown(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
