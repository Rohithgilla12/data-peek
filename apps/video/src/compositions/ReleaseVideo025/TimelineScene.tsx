import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { brand } from "../../lib/colors";
import { History } from "lucide-react";

// Six persisted runs of the same query, oldest → newest. Each run's data is
// deterministic so scrubbing visibly rewinds the grid.
const RUNS = [
  { time: "14:02", rows: [24, "pending", 12, "pending"] },
  { time: "14:08", rows: [24, "pending", 12, "shipped"] },
  { time: "14:15", rows: [24, "shipped", 12, "shipped"] },
  { time: "14:22", rows: [31, "shipped", 12, "shipped"] },
  { time: "14:29", rows: [31, "shipped", 18, "delivered"] },
  { time: "14:36", rows: [42, "shipped", 18, "delivered"] },
];

const GRID_IDS = [1041, 1040];

export const TimelineScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateRight: "clamp",
  });
  const cardScale = spring({
    frame: frame - 8,
    fps,
    config: { damping: 15, stiffness: 90 },
  });

  // Chips pop in oldest → newest, staggered.
  const chipIn = (i: number) =>
    spring({
      frame: frame - (24 + i * 7),
      fps,
      config: { damping: 13, stiffness: 130 },
    });

  // Then the scrub: selection walks from Live back to the oldest run and
  // settles on 14:15. The grid mirrors whichever run is selected.
  const scrub = interpolate(frame, [95, 175], [RUNS.length, 2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const selected = Math.round(scrub);
  const isLive = selected >= RUNS.length;
  const run = RUNS[Math.min(selected, RUNS.length - 1)];

  const bannerOpacity = interpolate(frame, [100, 112], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
      }}
    >
      <div
        style={{
          opacity: headerOpacity,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <History size={40} color={brand.accent} strokeWidth={1.5} />
        <span
          style={{
            fontFamily: "Geist, system-ui, sans-serif",
            fontSize: 52,
            fontWeight: 700,
            color: brand.textPrimary,
            letterSpacing: "-0.03em",
          }}
        >
          Scrub back through every run
        </span>
      </div>

      <div
        style={{
          transform: `scale(${cardScale})`,
          width: 980,
          borderRadius: 20,
          backgroundColor: brand.surface,
          border: `1px solid ${brand.border}`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "18px 28px",
            fontFamily: "Geist Mono, monospace",
            fontSize: 22,
            color: brand.textSecondary,
            borderBottom: `1px solid ${brand.border}`,
          }}
        >
          SELECT id, status FROM orders ORDER BY created_at DESC
        </div>

        {/* Timeline strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 28px",
            borderBottom: `1px solid ${brand.border}`,
            backgroundColor: brand.surfaceElevated,
          }}
        >
          {RUNS.map((r, i) => {
            const active = !isLive && selected === i;
            return (
              <div
                key={r.time}
                style={{
                  transform: `scale(${chipIn(i)})`,
                  padding: "8px 14px",
                  borderRadius: 10,
                  fontFamily: "Geist Mono, monospace",
                  fontSize: 19,
                  color: active ? brand.background : brand.textSecondary,
                  backgroundColor: active ? brand.accent : `${brand.border}66`,
                  border: `1px solid ${active ? brand.accent : brand.border}`,
                }}
              >
                {r.time}
              </div>
            );
          })}
          <div
            style={{
              transform: `scale(${chipIn(RUNS.length)})`,
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              borderRadius: 10,
              fontFamily: "Geist Mono, monospace",
              fontSize: 19,
              color: isLive ? brand.background : brand.textSecondary,
              backgroundColor: isLive ? "#10b981" : `${brand.border}66`,
              border: `1px solid ${isLive ? "#10b981" : brand.border}`,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: isLive ? brand.background : "#10b981",
              }}
            />
            Live
          </div>
        </div>

        {/* Viewing-the-past banner */}
        <div
          style={{
            opacity: isLive ? 0 : bannerOpacity,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 28px",
            fontFamily: "Geist Mono, monospace",
            fontSize: 19,
            color: brand.accent,
            backgroundColor: `${brand.accent}14`,
            borderBottom: `1px solid ${brand.border}`,
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              backgroundColor: brand.accent,
            }}
          />
          Viewing run from {run.time} · read-only
        </div>

        {/* Result grid, mirroring the selected run */}
        <div style={{ padding: "10px 28px 22px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "160px 1fr",
              fontFamily: "Geist Mono, monospace",
              fontSize: 21,
              color: brand.textMuted,
              padding: "10px 0",
              borderBottom: `1px solid ${brand.border}`,
            }}
          >
            <span>id</span>
            <span>status</span>
          </div>
          {GRID_IDS.map((id, rowIndex) => {
            const count = run.rows[rowIndex * 2] as number;
            const status = run.rows[rowIndex * 2 + 1] as string;
            return (
              <div
                key={id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "160px 1fr",
                  fontFamily: "Geist Mono, monospace",
                  fontSize: 22,
                  color: brand.textPrimary,
                  padding: "12px 0",
                  borderBottom: `1px solid ${brand.border}55`,
                }}
              >
                <span style={{ color: brand.textSecondary }}>
                  {id} <span style={{ color: brand.textMuted }}>×{count}</span>
                </span>
                <span
                  style={{
                    color:
                      status === "delivered"
                        ? "#10b981"
                        : status === "shipped"
                          ? brand.accent
                          : brand.amber,
                  }}
                >
                  {status}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          opacity: interpolate(frame, [180, 195], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          fontFamily: "Geist Mono, monospace",
          fontSize: 24,
          color: brand.textMuted,
        }}
      >
        Every successful SELECT — snapshotted locally, automatically.
      </div>
    </AbsoluteFill>
  );
};
