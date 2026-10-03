# data-peek motion kit

Reusable, unnarrated motion graphics for the README and datapeek.dev. Six short seamless loops sharing one visual system (`design.md`, inherited from the v0.26 launch videos).

## Shared envelope (every piece)

- **Canvas:** 1920 × 1200 (16:10), 30 fps. Root `#stage` sized exactly `width:1920px; height:1200px; position:relative`.
- **Seamless loop.** The final frame must match frame 0 (same layout, same visible state) so the loop has no visible jump on GitHub or `<video loop>`. Design the last ~0.6 s as the return to the opening state.
- **No audio, no narration, no voiceover.** These are designed motion graphics, not screen recordings, and must never be presented as captured footage.
- **Fonts:** local `fonts/geist.woff2` (`Geist Variable`) and `fonts/geist-mono.woff2` (`Geist Mono Variable`) via `@font-face`. No webfont CDNs.
- **Logo:** `logo.svg` in each project (blue rounded square `#6b8cf5`, database cylinder stroked `#0a0a0b`). Never redraw or recolour it.
- **Palette:** only the tokens in `design.md`, declared once as CSS custom properties. One extra token is allowed for Watch Mode and diffs: `--amber: #f5b14c`.
- **Motion:** `expo.out` / `power3.out` entrances, `power2.in` exits, sine for ambient. **No bounce, no elastic.** UI moves fast (0.2–0.5 s); atmosphere moves slowly (0.8–1.6 s). One dominant motif per beat.
- **Legibility at README size.** The README shows these at roughly 880 px wide (46% scale). Body/data text ≥ 26 px at 1920 wide, key numbers and titles ≥ 44 px. Nothing important within 80 px of the edges.
- **Truthful UI.** Copy, labels, SQL, and output formats must match the real product. Read the source files named in your brief rather than inventing UI. Simplify chrome freely; never invent features.
- **No third-party branding:** no competitor names or logos, no agent/vendor logos. An AI agent is just "agent".
- **Deterministic:** no `Math.random()`/`Date.now()`. Use a fixed seeded PRNG if you need scatter.

## Pieces

| Project | Length | One-line idea |
| --- | --- | --- |
| `hero/` | 10 s | SQL types itself, `⌘↵`, results cascade in with a `38 ms` timer; the camera pulls back through a schema constellation that converges into the logo lockup, then resets. |
| `doctor-cli/` | 9 s | `npx @data-peek/cli doctor` in a terminal; real-format findings land group by group, the fix SQL highlights, a summary chip counts up. |
| `watch-mode/` | 6 s | A pinned query re-runs; changed cells flash amber, a new row enters with a green band, and the tab dot pulses. |
| `query-plan/` | 6 s | An `EXPLAIN ANALYZE` plan grows into a tree node by node; timing bars fill and the hottest node lights up with its hint. |
| `mcp-approval/` | 6 s | An agent asks to run a write; the real in-app approval dialog slides in with the SQL; Approve lands, then the result shows. |
| `time-machine/` | 6 s | A timeline of past runs with a row-count sparkline; the scrubber drags back, a "viewing the past" banner appears, and two runs diff cell by cell. |

## Exports (done by the master after render approval, not by builders)

`exports/<piece>.mp4` (H.264, site), `.webm` (VP9, site), `.webp` (animated, README, ~960 px wide), `.gif` (fallback, ~880 px wide), `-poster.webp` (hero frame).

## Re-render

```bash
cd apps/video/hyperframes/motion-kit/<piece>
npx hyperframes@0.8.111 check .
PRODUCER_BROWSER_GPU_MODE=hardware npx hyperframes@0.8.111 render . -q high -o ./renders/video.mp4
cd .. && ./export.sh <piece> <poster-seconds>
cp exports/<piece>.{mp4,webm,webp} exports/<piece>-poster.webp ../../../web/public/motion/
```

Poster times used: hero 3.6, doctor-cli 5.42, query-plan 4.4, mcp-approval 3.0, watch-mode 3.0, time-machine 3.6. Each piece's `BRIEF.md` lists the source files its on-screen copy was taken from.
