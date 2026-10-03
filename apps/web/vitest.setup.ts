import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom implements neither of these, and ClipPlayer depends on both.
class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];
  constructor(private cb: IntersectionObserverCallback) {
    observers.push(this);
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = () => [];
  /** Test hook: drive the callback by hand, one entry per state, in order. */
  emit(...states: boolean[]) {
    this.cb(
      states.map(
        (isIntersecting) => ({ isIntersecting }) as IntersectionObserverEntry,
      ),
      this as unknown as IntersectionObserver,
    );
  }
}

export const observers: MockIntersectionObserver[] = [];
vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

let reducedMotion = false;
export function setReducedMotion(value: boolean) {
  reducedMotion = value;
}
vi.stubGlobal(
  "matchMedia",
  (query: string) =>
    ({
      matches: query.includes("prefers-reduced-motion") ? reducedMotion : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    }) as MediaQueryList,
);

// jsdom's HTMLMediaElement has no playback implementation. Guarded because
// this setup file runs for every test regardless of per-file environment,
// and clip-player.hydration.test.tsx opts into `@vitest-environment node`
// (no HTMLMediaElement global) for the half of it that has to run with no DOM.
if (typeof HTMLMediaElement !== "undefined") {
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn(),
  });
}

// jsdom has no SMIL/animation engine, so SVGSVGElement.pauseAnimations and
// .unpauseAnimations don't exist at all (unlike a real browser, where both
// are always present). The motion graphics under
// components/marketing/motion/ call them directly to stop SMIL under
// prefers-reduced-motion, since CSS cannot touch SMIL timelines.
if (typeof SVGSVGElement !== "undefined") {
  Object.defineProperty(SVGSVGElement.prototype, "pauseAnimations", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(SVGSVGElement.prototype, "unpauseAnimations", {
    configurable: true,
    value: vi.fn(),
  });
}
