"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

// Rendered from apps/video/hyperframes/motion-kit/hero (see KIT.md there).
const SRC = "/motion/hero";
const WIDTH = 1920;
const HEIGHT = 1200;

/**
 * The landing-page hero loop. Plays only while on screen, so a visitor who
 * scrolls past it stops paying for it. Under prefers-reduced-motion it never
 * autoplays; the poster shows with native controls so a click still plays it.
 */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // Turning on reduced motion mid-playback stops the loop now, rather than
    // waiting for the observer's next callback. Nothing restarts it from here.
    if (reduced) {
      video.pause();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible) {
          void video.play().catch(() => {
            // Autoplay can be refused (power saving, driver policy). The poster
            // stays up, which is an acceptable degradation.
          });
        } else {
          video.pause();
        }
      },
      { threshold: 0.25 },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [reduced]);

  return (
    <video
      ref={ref}
      data-testid="hero-video"
      poster={`${SRC}-poster.webp`}
      width={WIDTH}
      height={HEIGHT}
      muted
      loop
      playsInline
      preload="metadata"
      controls={reduced || undefined}
      aria-label="A SQL query typed into data-peek returns 8 rows in 38 ms, then the view pulls back through the schema's tables into the data-peek logo"
      className="w-full h-auto block"
      style={{
        background: "var(--n-bg-sunken)",
        border: "1px solid var(--n-line)",
        boxShadow:
          "0 1px 0 oklch(1 0 0 / 0.04) inset, 0 40px 80px -20px oklch(0 0 0 / 0.5)",
      }}
    >
      <source src={`${SRC}.webm`} type="video/webm" />
      <source src={`${SRC}.mp4`} type="video/mp4" />
    </video>
  );
}
