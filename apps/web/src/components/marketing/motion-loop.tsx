"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

// Loops are rendered from apps/video/hyperframes/motion-kit/<name> (see KIT.md
// there) and exported to /public/motion at the kit's 1920 × 1200 canvas.
const WIDTH = 1920;
const HEIGHT = 1200;

/**
 * A motion-kit loop. Plays only while on screen, so a visitor who scrolls past
 * it stops paying for it. Under prefers-reduced-motion it never autoplays; the
 * poster shows with native controls so a click still plays it.
 */
export function MotionLoop({ name, label }: { name: string; label: string }) {
  const src = `/motion/${name}`;
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

    // disconnect() doesn't drop entries already queued for delivery, so a
    // stale callback could otherwise restart playback after cleanup.
    let live = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!live) return;
        // One notification can batch several entries for this element; only
        // the newest says whether it is on screen now.
        const visible = entries[entries.length - 1]?.isIntersecting ?? false;
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
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [reduced]);

  return (
    <video
      ref={ref}
      data-testid={`${name}-video`}
      poster={`${src}-poster.webp`}
      width={WIDTH}
      height={HEIGHT}
      muted
      loop
      playsInline
      preload="metadata"
      controls={reduced || undefined}
      aria-label={label}
      className="w-full h-auto block"
      style={{
        background: "var(--n-bg-sunken)",
        border: "1px solid var(--n-line)",
        boxShadow:
          "0 1px 0 oklch(1 0 0 / 0.04) inset, 0 40px 80px -20px oklch(0 0 0 / 0.5)",
      }}
    >
      <source src={`${src}.webm`} type="video/webm" />
      <source src={`${src}.mp4`} type="video/mp4" />
    </video>
  );
}
