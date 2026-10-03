"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

/**
 * These motion graphics animate with SMIL (<animate>, <animateMotion>,
 * <animateTransform>), which CSS cannot touch: `animation-play-state` only
 * applies to CSS animations, and `display: none` does not stop a running
 * SMIL timeline. The only way to actually stop them is the SVG DOM API, so
 * this hook calls `pauseAnimations`/`unpauseAnimations` on the ref'd <svg>
 * directly. The preference itself comes from the shared, hydration-safe
 * useReducedMotion in apps/web/src/hooks/use-reduced-motion.ts.
 */
export function useSvgReducedMotionPause<T extends SVGSVGElement>() {
  const ref = useRef<T>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    // Optional chaining: jsdom (unit tests) doesn't implement either method
    // at all, unlike real browsers, where both are always present. Guarding
    // here keeps component-render tests that don't care about animation
    // state from crashing, without changing production behavior.
    if (reduced) {
      svg.pauseAnimations?.();
    } else {
      svg.unpauseAnimations?.();
    }
  }, [reduced]);

  return ref;
}
