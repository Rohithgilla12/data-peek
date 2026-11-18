import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MotionLoop } from "../motion-loop";
import { observers, setReducedMotion } from "../../../../vitest.setup";

describe("MotionLoop", () => {
  beforeEach(() => {
    observers.length = 0;
    setReducedMotion(false);
    vi.clearAllMocks();
  });

  it("renders both sources, a poster, and explicit dimensions", () => {
    render(<MotionLoop name="hero" label="hero loop" />);
    const video = screen.getByTestId("hero-video") as HTMLVideoElement;

    expect(video).toHaveAttribute("poster", "/motion/hero-poster.webp");
    // Explicit dimensions reserve the 16:10 box before the poster loads, so the
    // hero doesn't shift the page.
    expect(video).toHaveAttribute("width", "1920");
    expect(video).toHaveAttribute("height", "1200");
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute("loop");
    expect(video.getAttribute("preload")).toBe("metadata");

    const sources = Array.from(video.querySelectorAll("source")).map((s) => [
      s.getAttribute("src"),
      s.getAttribute("type"),
    ]);
    expect(sources).toEqual([
      ["/motion/hero.webm", "video/webm"],
      ["/motion/hero.mp4", "video/mp4"],
    ]);
  });

  it("serves another kit loop by name, with its own label", () => {
    render(<MotionLoop name="ask-ai" label="Ask on your subscription" />);
    const video = screen.getByTestId("ask-ai-video") as HTMLVideoElement;

    expect(video).toHaveAttribute("poster", "/motion/ask-ai-poster.webp");
    expect(video).toHaveAttribute("aria-label", "Ask on your subscription");
    expect(
      Array.from(video.querySelectorAll("source")).map((s) =>
        s.getAttribute("src"),
      ),
    ).toEqual(["/motion/ask-ai.webm", "/motion/ask-ai.mp4"]);
  });

  it("plays when scrolled into view and pauses when it leaves", () => {
    render(<MotionLoop name="hero" label="hero loop" />);
    const video = screen.getByTestId("hero-video") as HTMLVideoElement;

    expect(video.play).not.toHaveBeenCalled();

    observers[0].emit(true);
    expect(video.play).toHaveBeenCalledTimes(1);

    observers[0].emit(false);
    expect(video.pause).toHaveBeenCalledTimes(1);
  });

  it("follows the newest entry when one notification batches several", () => {
    render(<MotionLoop name="hero" label="hero loop" />);
    const video = screen.getByTestId("hero-video") as HTMLVideoElement;

    observers[0].emit(true, false);
    expect(video.play).not.toHaveBeenCalled();
    expect(video.pause).toHaveBeenCalledTimes(1);

    observers[0].emit(false, true);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it("ignores entries delivered after cleanup", () => {
    const { rerender } = render(<MotionLoop name="hero" label="hero loop" />);
    const video = screen.getByTestId("hero-video") as HTMLVideoElement;
    const stale = observers[0];

    setReducedMotion(true);
    rerender(<MotionLoop name="hero" label="hero loop" />);
    // A visible entry that was already queued when the observer disconnected.
    stale.emit(true);

    expect(video.play).not.toHaveBeenCalled();
  });

  it("never autoplays under prefers-reduced-motion, and exposes native controls instead", () => {
    setReducedMotion(true);
    render(<MotionLoop name="hero" label="hero loop" />);
    const video = screen.getByTestId("hero-video") as HTMLVideoElement;

    // No visibility observer at all, so nothing can start playback.
    expect(observers).toHaveLength(0);
    expect(video.play).not.toHaveBeenCalled();
    expect(video).toHaveAttribute("controls");
  });

  it("pauses straight away when reduced motion is turned on mid-playback", () => {
    const { rerender } = render(<MotionLoop name="hero" label="hero loop" />);
    const video = screen.getByTestId("hero-video") as HTMLVideoElement;
    observers[0].emit(true);
    expect(video.play).toHaveBeenCalledTimes(1);

    setReducedMotion(true);
    rerender(<MotionLoop name="hero" label="hero loop" />);

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(observers[0].disconnect).toHaveBeenCalled();
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it("does not expose controls when motion is not reduced", () => {
    render(<MotionLoop name="hero" label="hero loop" />);
    expect(screen.getByTestId("hero-video")).not.toHaveAttribute("controls");
  });
});
