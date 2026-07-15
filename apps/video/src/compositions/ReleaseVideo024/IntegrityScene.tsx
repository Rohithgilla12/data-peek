import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { brand } from "../../lib/colors";
import { Check } from "lucide-react";

const GREEN = "#10b981";

const ITEMS: Array<{ label: string; detail: string }> = [
  { label: "JSON / JSONB cells", detail: "save what you typed" },
  { label: "Timestamps", detail: "shown as stored — no phantom offset" },
  { label: "Multi-window focus", detail: "raises the window you were using" },
  { label: "Query history", detail: "survives a restart" },
  { label: "Export", detail: "follows the active result tab" },
];

const ChecklistRow: React.FC<{
  label: string;
  detail: string;
  delay: number;
}> = ({ label, detail, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
  });
  const opacity = interpolate(entrance, [0, 1], [0, 1]);
  const translateX = interpolate(entrance, [0, 1], [-30, 0]);

  // Check pops a few frames after the row arrives.
  const tick = spring({
    frame: frame - delay - 8,
    fps,
    config: { damping: 10, stiffness: 140 },
  });
  const checkScale = interpolate(tick, [0, 1], [0, 1]);

  return (
    <div
      style={{
        opacity,
        transform: `translateX(${translateX}px)`,
        display: "flex",
        alignItems: "center",
        gap: 22,
        padding: "18px 28px",
        borderRadius: 16,
        backgroundColor: brand.surface,
        border: `1px solid ${brand.border}`,
        width: 880,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          flexShrink: 0,
          backgroundColor: `${GREEN}1a`,
          border: `1px solid ${GREEN}55`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${checkScale})`,
        }}
      >
        <Check size={26} color={GREEN} strokeWidth={2.5} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          style={{
            fontFamily: "Geist Mono, monospace",
            fontSize: 30,
            fontWeight: 600,
            color: brand.textPrimary,
            letterSpacing: "-0.02em",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: "Geist Mono, monospace",
            fontSize: 22,
            color: brand.textSecondary,
          }}
        >
          {detail}
        </span>
      </div>
    </div>
  );
};

export const IntegrityScene: React.FC = () => {
  const frame = useCurrentFrame();
  const titleOpacity = interpolate(frame, [0, 18], [0, 1], {
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
          opacity: titleOpacity,
          fontFamily: "Geist, system-ui, sans-serif",
          fontSize: 52,
          fontWeight: 700,
          color: brand.textPrimary,
          letterSpacing: "-0.03em",
          marginBottom: 8,
        }}
      >
        The quiet lies, fixed
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {ITEMS.map((item, i) => (
          <ChecklistRow
            key={item.label}
            label={item.label}
            detail={item.detail}
            delay={20 + i * 22}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};
