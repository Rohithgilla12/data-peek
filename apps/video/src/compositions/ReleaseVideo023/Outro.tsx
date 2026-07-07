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

export const Outro: React.FC<OutroProps> = ({ version }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const fadeOut = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

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

      <Sequence from={0} layout="none">
        <ShortcutPill />
      </Sequence>

      <Sequence from={15} layout="none">
        <TitleReveal version={version} />
      </Sequence>

      <Sequence from={30} layout="none">
        <CtaReveal />
      </Sequence>
    </AbsoluteFill>
  );
};

const ShortcutPill: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame, fps, config: { damping: 200 } });
  const scale = interpolate(e, [0, 1], [0.9, 1]);
  const op = interpolate(e, [0, 1], [0, 1]);
  return (
    <div
      style={{
        opacity: op,
        transform: `scale(${scale})`,
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 24px",
        borderRadius: 14,
        backgroundColor: brand.surface,
        border: `1px solid ${brand.accent}55`,
      }}
    >
      <Kbd>⌘</Kbd>
      <Kbd>⇧</Kbd>
      <Kbd>W</Kbd>
      <span
        style={{
          fontFamily: "Geist Mono, monospace",
          fontSize: 22,
          color: brand.textMuted,
          marginLeft: 8,
        }}
      >
        to start watching
      </span>
    </div>
  );
};

const Kbd: React.FC<React.PropsWithChildren> = ({ children }) => (
  <span
    style={{
      fontFamily: "Geist Mono, monospace",
      fontSize: 24,
      fontWeight: 600,
      color: brand.accent,
      padding: "6px 14px",
      borderRadius: 8,
      backgroundColor: `${brand.accent}14`,
      border: `1px solid ${brand.accent}30`,
      minWidth: 36,
      textAlign: "center",
    }}
  >
    {children}
  </span>
);

const TitleReveal: React.FC<{ version: string }> = ({ version }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({ frame, fps, config: { damping: 200 } });
  const opacity = interpolate(entrance, [0, 1], [0, 1]);
  const translateY = interpolate(entrance, [0, 1], [20, 0]);

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: "Geist Mono, monospace",
          fontSize: 56,
          fontWeight: 700,
          color: brand.textPrimary,
          letterSpacing: "-0.04em",
        }}
      >
        data-peek <span style={{ color: brand.accent }}>v{version}</span>
      </div>
      <div
        style={{
          fontFamily: "Geist Mono, monospace",
          fontSize: 22,
          color: brand.textMuted,
        }}
      >
        Pin a SELECT. See it move.
      </div>
    </div>
  );
};

const CtaReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({ frame, fps, config: { damping: 200 } });
  const opacity = interpolate(entrance, [0, 1], [0, 1]);

  return (
    <div
      style={{
        opacity,
        display: "flex",
        alignItems: "center",
        gap: 20,
      }}
    >
      <div
        style={{
          fontFamily: "Geist Mono, monospace",
          fontSize: 28,
          fontWeight: 500,
          color: brand.accent,
          borderBottom: `2px solid ${brand.accent}60`,
          paddingBottom: 4,
        }}
      >
        datapeek.dev
      </div>
    </div>
  );
};
