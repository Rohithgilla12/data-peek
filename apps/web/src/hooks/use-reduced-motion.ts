"use client";

import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

/**
 * Whether the visitor asked the OS for reduced motion, kept hydration-safe.
 *
 * useSyncExternalStore, not a lazy useState initializer: a lazy initializer
 * reads window.matchMedia during the hydration render itself, which differs
 * from the SSR pass (no `window`). React does not repair a mismatched
 * attribute after the fact (a video's `controls`, say), which would strand a
 * reduced-motion visitor with no way to play it. getServerSnapshot keeps the
 * first client render identical to what the server sent, then re-renders with
 * the real value right after hydration, and again live if the OS setting
 * changes mid-session. react-hooks/set-state-in-effect forbids going back to a
 * plain effect + setState for this.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
