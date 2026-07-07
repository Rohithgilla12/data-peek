import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { brand } from "../../lib/colors";
import { Check } from "lucide-react";

const points = [
  "Free for personal use.",
  "Honor-system commercial license.",
  "No telemetry. Ever.",
];

export const Pricing: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headingEntrance = spring({ frame, fps, config: { damping: 200 } });
  const headingOpacity = interpolate(headingEntrance, [0, 1], [0, 1]);
  const headingTranslate = interpolate(headingEntrance, [0, 1], [10, 0]);

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 44,
      }}
    >
      <div
        style={{
          opacity: headingOpacity,
          transform: `translateY(${headingTranslate}px)`,
          fontFamily: "Geist, system-ui, sans-serif",
          fontSize: 64,
          fontWeight: 700,
          color: brand.textPrimary,
          letterSpacing: "-0.04em",
          textAlign: "center",
        }}
      >
        Honest software.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {points.map((point, i) => {
          const entrance = spring({
            frame: frame - 18 - i * 16,
            fps,
            config: { damping: 200 },
          });
          const opacity = interpolate(entrance, [0, 1], [0, 1]);
          const translateX = interpolate(entrance, [0, 1], [-18, 0]);

          return (
            <div
              key={point}
              style={{
                opacity,
                transform: `translateX(${translateX}px)`,
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: `${brand.accent}15`,
                  border: `1px solid ${brand.accent}40`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Check size={20} color={brand.accent} strokeWidth={2.2} />
              </div>
              <span
                style={{
                  fontFamily: "Geist Mono, monospace",
                  fontSize: 30,
                  fontWeight: 500,
                  color: brand.textPrimary,
                  letterSpacing: "-0.02em",
                }}
              >
                {point}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
