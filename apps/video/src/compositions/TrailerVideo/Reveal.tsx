import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Sequence,
} from "remotion";
import { brand } from "../../lib/colors";
import { CyanGlow } from "../../components/CyanGlow";
import { Database } from "lucide-react";

export const Reveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const iconScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  const wordmarkEntrance = spring({
    frame: frame - 10,
    fps,
    config: { damping: 15, stiffness: 80 },
  });
  const wordmarkOpacity = interpolate(wordmarkEntrance, [0, 1], [0, 1]);
  const wordmarkScale = interpolate(wordmarkEntrance, [0, 1], [0.94, 1]);

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
      }}
    >
      <CyanGlow size={620} delay={0} />

      <div style={{ transform: `scale(${iconScale})` }}>
        <Database size={72} color={brand.accent} strokeWidth={1.5} />
      </div>

      <div
        style={{
          opacity: wordmarkOpacity,
          transform: `scale(${wordmarkScale})`,
          fontFamily: "Geist Mono, monospace",
          fontSize: 104,
          fontWeight: 700,
          color: brand.textPrimary,
          letterSpacing: "-0.05em",
        }}
      >
        data-peek
      </div>

      <Sequence from={40} layout="none">
        <Tagline />
      </Sequence>
    </AbsoluteFill>
  );
};

const Tagline: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({ frame, fps, config: { damping: 200 } });
  const opacity = interpolate(entrance, [0, 1], [0, 1]);
  const translateY = interpolate(entrance, [0, 1], [12, 0]);

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          marginTop: 360,
          opacity,
          transform: `translateY(${translateY}px)`,
          fontFamily: "Geist Mono, monospace",
          fontSize: 28,
          color: brand.textMuted,
          letterSpacing: "-0.02em",
        }}
      >
        A SQL client built for people who already know SQL.
      </div>
    </AbsoluteFill>
  );
};
