import { test, expect, type Page } from "@playwright/test";

/**
 * Each assertion here maps to a bug that shipped past the jsdom suite. If one of
 * these ever fails, the showcase is broken in a browser regardless of what Vitest
 * says.
 */

/** Scroll the showcase into view so the player's IntersectionObserver fires. */
async function openShowcase(page: Page) {
  await page.goto("/");
  await page.locator("#see-it-work").scrollIntoViewIfNeeded();
}

/**
 * The resource the browser actually selected — not the `src` attributes, which React
 * updates correctly even when the media never changes. `currentSrc` is empty until
 * resource selection runs, which `preload="none"` defers until playback starts.
 */
function currentSrc(page: Page) {
  return page
    .getByTestId("clip-video")
    .evaluate((v) => (v as HTMLVideoElement).currentSrc);
}

test("loads the selected clip's media, not just its poster", async ({
  page,
}) => {
  await openShowcase(page);

  // Guards the "poster over a 404" failure mode: `preload="none"` degrades silently
  // to the poster, so a missing or unreachable file looks identical to a slow load.
  await expect
    .poll(() => currentSrc(page), {
      message: "video never selected a resource",
    })
    .toContain("command-palette");
});

test("switching feature swaps the media the browser has loaded", async ({
  page,
}) => {
  await openShowcase(page);
  await expect.poll(() => currentSrc(page)).toContain("command-palette");

  // Data holds two video clips, so this is a video -> video switch, which is the
  // case that was broken: the element was reused and kept its original resource.
  await page.getByRole("tab", { name: "Data" }).click();
  await page.getByRole("option", { name: "Data masking" }).click();

  await expect
    .poll(() => currentSrc(page), {
      message: "still playing the previous clip after switching features",
    })
    .toContain("data-masking");

  await expect(page.getByTestId("clip-video")).toHaveCount(1);
});

test("selecting a motion graphic mounts no video at all", async ({ page }) => {
  await openShowcase(page);

  await page.getByRole("tab", { name: "Infrastructure" }).click();
  await expect(page.getByTestId("clip-video")).toHaveCount(0);
  await expect(
    page.locator("figure[data-testid^='motion-'] svg"),
  ).toBeVisible();
});

test.describe("prefers-reduced-motion", () => {
  test("does not autoplay, and leaves a way to play it", async ({ page }) => {
    // Emulated imperatively and *before* navigation, not via `test.use`. Two reasons:
    // the fixture form silently failed to apply here (matchMedia still reported
    // false, so the test passed against an unemulated browser), and the ordering is
    // load-bearing — the bug this guards was a hydration mismatch, so the client's
    // very first render has to already see the preference.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openShowcase(page);

    const video = page.getByTestId("clip-video");
    await expect(video).toBeVisible();
    expect(
      await page.evaluate(
        () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    ).toBe(true);

    // The controls attribute is read during render from a browser API. It survived
    // hydration only after the component moved to useSyncExternalStore — before
    // that, the server rendered without it and React never patched the mismatch,
    // leaving a preload="none" poster with no way to play it.
    await expect(video).toHaveAttribute("controls", "");

    // Give the observer a chance to wrongly start playback before asserting.
    await page.waitForTimeout(1500);
    expect(await video.evaluate((v) => (v as HTMLVideoElement).paused)).toBe(
      true,
    );
  });
});
