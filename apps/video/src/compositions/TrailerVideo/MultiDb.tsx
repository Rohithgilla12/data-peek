import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { brand } from "../../lib/colors";

const dbs = [
  { name: "PostgreSQL", short: "pg", color: "#3b82f6" },
  { name: "MySQL", short: "my", color: "#f59e0b" },
  { name: "SQL Server", short: "ms", color: "#a855f7" },
];

export const MultiDb: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleEntrance = spring({ frame, fps, config: { damping: 200 } });
  const titleOpacity = interpolate(titleEntrance, [0, 1], [0, 1]);
  const titleTranslate = interpolate(titleEntrance, [0, 1], [10, 0]);

  const subtitleEntrance = spring({
    frame: frame - 100,
    fps,
    config: { damping: 200 },
  });
  const subOpacity = interpolate(subtitleEntrance, [0, 1], [0, 1]);
  const subTranslate = interpolate(subtitleEntrance, [0, 1], [10, 0]);

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 56,
      }}
    >
      <div
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleTranslate}px)`,
          fontFamily: "Geist, system-ui, sans-serif",
          fontSize: 64,
          fontWeight: 700,
          color: brand.textPrimary,
          letterSpacing: "-0.04em",
          textAlign: "center",
          maxWidth: 1100,
        }}
      >
        Three databases. One client.
      </div>

      <div style={{ display: "flex", gap: 28 }}>
        {dbs.map((db, i) => {
          const entrance = spring({
            frame: frame - 14 - i * 8,
            fps,
            config: { damping: 12, stiffness: 100 },
          });
          const scale = interpolate(entrance, [0, 1], [0.85, 1]);
          const opacity = interpolate(entrance, [0, 1], [0, 1]);
          const float = Math.sin((frame - i * 10) * 0.04) * 4;

          return (
            <div
              key={db.name}
              style={{
                opacity,
                transform: `scale(${scale}) translateY(${float}px)`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
                padding: "32px 36px",
                backgroundColor: brand.surface,
                borderRadius: 18,
                border: `1px solid ${db.color}30`,
                boxShadow: `0 0 60px ${db.color}10`,
                minWidth: 220,
              }}
            >
              <div
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 22,
                  backgroundColor: `${db.color}15`,
                  border: `1px solid ${db.color}40`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Geist Mono, monospace",
                  fontSize: 36,
                  fontWeight: 700,
                  color: db.color,
                  letterSpacing: "-0.02em",
                }}
              >
                {db.short}
              </div>
              <span
                style={{
                  fontFamily: "Geist Mono, monospace",
                  fontSize: 22,
                  fontWeight: 500,
                  color: brand.textPrimary,
                  letterSpacing: "-0.01em",
                }}
              >
                {db.name}
              </span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          opacity: subOpacity,
          transform: `translateY(${subTranslate}px)`,
          fontFamily: "Geist Mono, monospace",
          fontSize: 22,
          color: brand.textMuted,
        }}
      >
        Same shortcuts. Same UI. Same speed.
      </div>
    </AbsoluteFill>
  );
};
