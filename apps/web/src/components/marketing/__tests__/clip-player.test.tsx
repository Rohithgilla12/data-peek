import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClipPlayer } from "../clip-player";
import type { FeatureClip } from "../feature-clips";
import { observers, setReducedMotion } from "../../../../vitest.setup";

const clip: FeatureClip = {
  id: "command-palette",
  title: "Command palette",
  blurb:
    "⌘K opens every action. Switch connections, run queries, jump to tables.",
  category: "editor",
  media: { kind: "video", file: "command-palette", width: 1280, height: 800 },
};

describe("ClipPlayer", () => {
  beforeEach(() => {
    observers.length = 0;
    setReducedMotion(false);
    vi.clearAllMocks();
  });

  it("renders both sources, a poster, and explicit dimensions", () => {
    render(<ClipPlayer clip={clip} active />);
    const video = screen.getByTestId("clip-video") as HTMLVideoElement;

    expect(video).toHaveAttribute("poster", "/clips/command-palette.webp");
    expect(video).toHaveAttribute("width", "1280");
    expect(video).toHaveAttribute("height", "800");
    expect(video.getAttribute("preload")).toBe("none");

    const types = Array.from(video.querySelectorAll("source")).map((s) =>
      s.getAttribute("type"),
    );
    expect(types).toEqual(["video/webm", "video/mp4"]);
  });

  it("replaces the video element when the clip changes", () => {
    const other: FeatureClip = {
      ...clip,
      id: "data-masking",
      title: "Data masking",
      media: { kind: "video", file: "data-masking", width: 1280, height: 800 },
    };

    const { rerender } = render(<ClipPlayer clip={clip} active />);
    const first = screen.getByTestId("clip-video");

    rerender(<ClipPlayer clip={other} active />);
    const second = screen.getByTestId("clip-video");

    // Element identity is the assertion that matters. Without a key React reuses the
    // same <video> and only rewrites the <source> src attributes — which the src
    // checks below would happily accept, while a real browser keeps playing the
    // already-selected resource. jsdom loads no media, so identity is the only
    // observable proxy for "the browser will re-run resource selection".
    expect(second).not.toBe(first);

    expect(second).toHaveAttribute("poster", "/clips/data-masking.webp");
    const srcs = Array.from(second.querySelectorAll("source")).map((s) =>
      s.getAttribute("src"),
    );
    expect(srcs).toEqual([
      "/clips/data-masking.webm",
      "/clips/data-masking.mp4",
    ]);
  });

  it("plays when scrolled into view and pauses when it leaves", () => {
    render(<ClipPlayer clip={clip} active />);
    const video = screen.getByTestId("clip-video") as HTMLVideoElement;

    expect(video.play).not.toHaveBeenCalled();

    observers[0].emit(true);
    expect(video.play).toHaveBeenCalledTimes(1);

    observers[0].emit(false);
    expect(video.pause).toHaveBeenCalledTimes(1);
  });

  it("never autoplays under prefers-reduced-motion, and exposes native controls instead", () => {
    setReducedMotion(true);
    render(<ClipPlayer clip={clip} active />);
    const video = screen.getByTestId("clip-video") as HTMLVideoElement;

    observers[0].emit(true);
    expect(video.play).not.toHaveBeenCalled();
    expect(video).toHaveAttribute("controls");
  });

  it("does not expose controls when motion is not reduced", () => {
    render(<ClipPlayer clip={clip} active />);
    const video = screen.getByTestId("clip-video") as HTMLVideoElement;

    expect(video).not.toHaveAttribute("controls");
  });

  it("does not play while inactive even if visible", () => {
    render(<ClipPlayer clip={clip} active={false} />);
    const video = screen.getByTestId("clip-video") as HTMLVideoElement;

    observers[0].emit(true);
    expect(video.play).not.toHaveBeenCalled();
    expect(video.pause).toHaveBeenCalled();
  });
});
