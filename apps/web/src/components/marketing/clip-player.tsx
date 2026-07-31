"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { mp4Url, posterUrl, webmUrl, type FeatureClip } from "./feature-clips";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getReducedMotion() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getServerReducedMotion() {
  return false;
}

/**
 * Lazily-loaded looping clip. Only the selected clip mounts a <video>, and it
 * plays only while both selected and on screen — a backgrounded showcase costs
 * nothing. Under prefers-reduced-motion nothing ever autoplays; the poster
 * renders with native controls so an explicit click still works.
 */
export function ClipPlayer({
  clip,
  active,
}: {
  clip: FeatureClip;
  active: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  // useSyncExternalStore, not a lazy useState initializer: a lazy initializer
  // reads window.matchMedia during the hydration render itself, which
  // differs from the SSR pass (no `window`) — React does not repair a
  // mismatched `controls` attribute after the fact, permanently stranding a
  // reduced-motion visitor with no way to play the clip at all. This hook's
  // getServerSnapshot keeps the first client render identical to what the
  // server sent (no mismatch warning), then re-renders with the real value
  // immediately after hydration, and again live if the OS setting changes
  // mid-session. react-hooks/set-state-in-effect forbids going back to a
  // plain effect + setState for this.
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getServerReducedMotion,
  );

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible && active && !reduced) {
          void video.play().catch(() => {
            // Autoplay can be refused (power saving, driver policy). The poster
            // stays up, which is an acceptable degradation.
          });
        } else {
          video.pause();
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [active, reduced]);

  if (clip.media.kind !== "video") return null;
  const { file, width, height } = clip.media;

  return (
    // Keyed on `file` so switching clips replaces the element instead of reusing it.
    // React would otherwise keep the same <video> and only rewrite the <source> src
    // attributes — and per the HTML spec, mutating <source> after the browser has
    // selected a media resource does nothing. The previous clip would keep playing.
    // Remounting also resets preload="none" and the poster, and re-runs the
    // IntersectionObserver effect below against the new element.
    <video
      key={file}
      ref={ref}
      data-testid="clip-video"
      poster={posterUrl(file)}
      width={width}
      height={height}
      muted
      loop
      playsInline
      preload="none"
      controls={reduced || undefined}
      aria-label={`${clip.title} demonstration`}
      className="w-full h-auto block"
      style={{
        border: "1px solid var(--n-line-soft)",
        background: "var(--n-bg-sunken)",
      }}
    >
      <source src={webmUrl(file)} type="video/webm" />
      <source src={mp4Url(file)} type="video/mp4" />
    </video>
  );
}
