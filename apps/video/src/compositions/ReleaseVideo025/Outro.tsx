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

type OutroProps = {
  version: string;
};

const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 52,
      padding: "10px 16px",
      borderRadius: 12,
      backgroundColor: brand.surfaceElevated,
      border: `1px solid ${brand.border}`,
      fontFamily: "Geist Mono, monospace",
      fontSize: 34,
      color: brand.textPrimary,
    }}
  >
    {children}
  </span>
);

export const Outro: React.FC<OutroProps> = ({ version }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const fadeOut = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  const shortcutScale = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 90 },
  });
  const logoOpacity = interpolate(frame, [22, 40], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 30,
        opacity: fadeOut,
      }}
    >
      <CyanGlow size={500} delay={0} />

      <div
        style={{
          transform: `scale(${shortcutScale})`,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Key>⌘</Key>
        <Key>⇧</Key>
        <Key>H</Key>
        <span
          style={{
            marginLeft: 18,
            fontFamily: "Geist Mono, monospace",
            fontSize: 30,
            color: brand.textSecondary,
          }}
        >
          open the timeline
        </span>
      </div>

      <Sequence from={22} layout="none">
        <div
          style={{
            opacity: logoOpacity,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
          }}
        >
          <span
            style={{
              fontFamily: "Geist Mono, monospace",
              fontSize: 72,
              fontWeight: 700,
              color: brand.textPrimary,
              letterSpacing: "-0.05em",
            }}
          >
            data-peek <span style={{ color: brand.accent }}>{version}</span>
          </span>
          <span
            style={{
              fontFamily: "Geist Mono, monospace",
              fontSize: 28,
              color: brand.textSecondary,
            }}
          >
            Free for personal use. No account. No telemetry.
          </span>
          <span
            style={{
              fontFamily: "Geist Mono, monospace",
              fontSize: 25,
              color: brand.accent,
            }}
          >
            github.com/Rohithgilla12/data-peek
          </span>
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};
