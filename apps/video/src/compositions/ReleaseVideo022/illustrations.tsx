import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { brand } from "../../lib/colors";

const CARD_W = 580;
const CARD_H = 420;

const cardStyle: React.CSSProperties = {
  width: CARD_W,
  height: CARD_H,
  backgroundColor: brand.surface,
  borderRadius: 16,
  border: `1px solid ${brand.border}`,
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  fontFamily: "Geist Mono, monospace",
  fontSize: 11,
  color: brand.textMuted,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const monoCellStyle = (color: string): React.CSSProperties => ({
  fontFamily: "Geist Mono, monospace",
  fontSize: 12,
  color: brand.textSecondary,
  backgroundColor: brand.surfaceElevated,
  border: `1px solid ${brand.border}`,
  borderLeft: `3px solid ${color}`,
  borderRadius: 8,
  padding: "10px 12px",
  display: "flex",
  alignItems: "center",
  gap: 12,
});

// ────────────────────────────────────────────────────────────────────
// 1. Primary-key keyed edits: sort moves the row, but the edit follows
// ────────────────────────────────────────────────────────────────────

export const PrimaryKeyEditIllustration: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const containerOpacity = interpolate(
    spring({ frame: frame - 5, fps, config: { damping: 200 } }),
    [0, 1],
    [0, 1],
  );

  const editEntrance = spring({
    frame: frame - 20,
    fps,
    config: { damping: 200 },
  });
  const editOpacity = interpolate(editEntrance, [0, 1], [0, 1]);

  // After ~55 frames, the rows "sort" — visualised by swapping their order.
  const sortProgress = interpolate(frame, [55, 75], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const accent = "#6b8cf5";

  const rows = [
    { pk: "42", email: "ana@acme.io", edited: true },
    { pk: "17", email: "beth@acme.io", edited: false },
    { pk: "88", email: "cal@acme.io", edited: false },
  ];

  // Indices in the sorted order — row 17 (pk) drops to row 2, etc.
  const sortedOrder = [1, 0, 2];
  const rowHeight = 56;
  const gap = 8;

  return (
    <div style={{ ...cardStyle, opacity: containerOpacity }}>
      <div style={labelStyle}>users — sorted by pk asc</div>

      <div
        style={{
          position: "relative",
          height: rows.length * (rowHeight + gap),
          marginTop: 8,
        }}
      >
        {rows.map((row, i) => {
          const fromY = i * (rowHeight + gap);
          const toY = sortedOrder.indexOf(i) * (rowHeight + gap);
          const y = interpolate(sortProgress, [0, 1], [fromY, toY]);

          return (
            <div
              key={row.pk}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${y}px)`,
                ...monoCellStyle(row.edited ? accent : brand.border),
                height: rowHeight,
              }}
            >
              <span
                style={{
                  width: 36,
                  color: brand.textMuted,
                  fontSize: 11,
                }}
              >
                pk
              </span>
              <span
                style={{
                  fontWeight: 600,
                  color: row.edited ? accent : brand.textPrimary,
                }}
              >
                {row.pk}
              </span>
              <span style={{ color: brand.textMuted }}>·</span>
              <span style={{ flex: 1 }}>{row.email}</span>
              {row.edited && (
                <span
                  style={{
                    opacity: editOpacity,
                    fontSize: 10,
                    fontWeight: 600,
                    color: accent,
                    background: `${accent}15`,
                    border: `1px solid ${accent}40`,
                    borderRadius: 4,
                    padding: "2px 6px",
                  }}
                >
                  edit · pk=42
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 12,
          borderTop: `1px dashed ${brand.border}`,
          fontFamily: "Geist Mono, monospace",
          fontSize: 11,
          color: brand.textMuted,
          display: "flex",
          gap: 12,
        }}
      >
        <span style={{ color: accent }}>●</span>
        <span>edit follows the row, not the index</span>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────
// 2. Lifecycle CAS — late response drops, cancel-on-close
// ────────────────────────────────────────────────────────────────────

export const LifecycleCASIllustration: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const containerOpacity = interpolate(
    spring({ frame: frame - 5, fps, config: { damping: 200 } }),
    [0, 1],
    [0, 1],
  );

  const amber = "#f59e0b";
  const muted = brand.textMuted;

  // Timeline events
  const tBoxOpacity = (start: number) =>
    interpolate(frame, [start, start + 10], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  // Strike A's late response after frame ~70
  const strikeProgress = interpolate(frame, [70, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ ...cardStyle, opacity: containerOpacity }}>
      <div style={labelStyle}>tab · query lifecycle</div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginTop: 8,
        }}
      >
        <TimelineRow
          color={muted}
          label="execId · A"
          status="run"
          statusColor={muted}
          opacity={tBoxOpacity(10)}
          strike={strikeProgress > 0.1}
        />
        <TimelineRow
          color={muted}
          label="execId · A"
          status="cancel"
          statusColor="#ef4444"
          opacity={tBoxOpacity(30)}
        />
        <TimelineRow
          color={amber}
          label="execId · B"
          status="run"
          statusColor={amber}
          opacity={tBoxOpacity(50)}
        />
        <TimelineRow
          color={muted}
          label="execId · A"
          status="late response"
          statusColor={muted}
          opacity={tBoxOpacity(70)}
          strike={strikeProgress > 0.4}
          ghost={strikeProgress > 0.6}
        />
        <TimelineRow
          color={amber}
          label="execId · B"
          status="✓ result"
          statusColor={amber}
          opacity={tBoxOpacity(95)}
        />
      </div>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 12,
          borderTop: `1px dashed ${brand.border}`,
          fontFamily: "Geist Mono, monospace",
          fontSize: 11,
          color: brand.textMuted,
          display: "flex",
          gap: 12,
        }}
      >
        <span style={{ color: amber }}>●</span>
        <span>compare-and-swap on executionId — stale finishes drop</span>
      </div>
    </div>
  );
};

const TimelineRow: React.FC<{
  color: string;
  label: string;
  status: string;
  statusColor: string;
  opacity: number;
  strike?: boolean;
  ghost?: boolean;
}> = ({ color, label, status, statusColor, opacity, strike, ghost }) => (
  <div
    style={{
      opacity: ghost ? opacity * 0.35 : opacity,
      ...monoCellStyle(color),
      gap: 16,
      textDecoration: strike ? "line-through" : "none",
      textDecorationColor: "#ef4444",
      textDecorationThickness: 2,
    }}
  >
    <span style={{ width: 110, fontSize: 11, color: brand.textMuted }}>
      {label}
    </span>
    <span style={{ flex: 1 }} />
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: statusColor,
      }}
    >
      {status}
    </span>
  </div>
);

// ────────────────────────────────────────────────────────────────────
// 3. Schema cache invalidation + generation token
// ────────────────────────────────────────────────────────────────────

export const SchemaCacheInvalidationIllustration: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const containerOpacity = interpolate(
    spring({ frame: frame - 5, fps, config: { damping: 200 } }),
    [0, 1],
    [0, 1],
  );

  const purple = "#a855f7";
  const red = "#ef4444";

  const opacityAt = (start: number) =>
    interpolate(frame, [start, start + 10], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  const cachePreEntries = ["id", "email", "created_at"];
  const cachePostEntries = ["id", "email", "created_at", "org_id"];

  const showPost = interpolate(frame, [80, 95], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ ...cardStyle, opacity: containerOpacity }}>
      <div style={labelStyle}>schema cache · gen 7 → 8</div>

      {/* Cache box */}
      <div
        style={{
          marginTop: 4,
          backgroundColor: brand.surfaceElevated,
          border: `1px solid ${brand.border}`,
          borderRadius: 10,
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: "Geist Mono, monospace",
            fontSize: 11,
            color: brand.textMuted,
          }}
        >
          <span>users · columns</span>
          <span style={{ color: showPost > 0.5 ? purple : brand.textMuted }}>
            gen {showPost > 0.5 ? "8" : "7"}
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {(showPost > 0.5 ? cachePostEntries : cachePreEntries).map((c) => (
            <span
              key={c}
              style={{
                fontFamily: "Geist Mono, monospace",
                fontSize: 11,
                color: showPost > 0.5 ? purple : brand.textPrimary,
                backgroundColor: brand.surface,
                border: `1px solid ${brand.border}`,
                borderRadius: 6,
                padding: "4px 8px",
              }}
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* DDL event line */}
      <div
        style={{
          opacity: opacityAt(50),
          marginTop: 4,
          ...monoCellStyle(purple),
        }}
      >
        <span style={{ color: purple, fontSize: 11 }}>DDL</span>
        <span style={{ color: brand.textPrimary }}>
          ALTER TABLE users ADD COLUMN org_id int
        </span>
      </div>

      {/* Stale fetch attempt — strike it */}
      <div
        style={{
          opacity: opacityAt(75),
          ...monoCellStyle(red),
        }}
      >
        <span style={{ color: red, fontSize: 11 }}>STALE</span>
        <span
          style={{
            color: brand.textMuted,
            textDecoration: "line-through",
            textDecorationColor: red,
          }}
        >
          in-flight fetch · gen 7 · write blocked
        </span>
      </div>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 12,
          borderTop: `1px dashed ${brand.border}`,
          fontFamily: "Geist Mono, monospace",
          fontSize: 11,
          color: brand.textMuted,
          display: "flex",
          gap: 12,
        }}
      >
        <span style={{ color: purple }}>●</span>
        <span>generation token blocks stale writes after invalidate</span>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────
// 4. E2E fortress — 4 → 25 tests
// ────────────────────────────────────────────────────────────────────

export const E2EFortressIllustration: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const containerOpacity = interpolate(
    spring({ frame: frame - 5, fps, config: { damping: 200 } }),
    [0, 1],
    [0, 1],
  );

  const green = "#10b981";

  // 5 cols × 5 rows = 25 cells. Cells 0..3 light immediately ("before").
  // Cells 4..24 light progressively from frame 20 onwards.
  const cellOpacity = (i: number) => {
    if (i < 4)
      return interpolate(frame, [5, 15], [0, 1], { extrapolateRight: "clamp" });
    const start = 25 + (i - 4) * 3;
    return interpolate(frame, [start, start + 10], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  };

  const counterValue = Math.min(
    25,
    Math.max(4, Math.floor(interpolate(frame, [20, 100], [4, 25]))),
  );

  return (
    <div style={{ ...cardStyle, opacity: containerOpacity }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <div style={labelStyle}>e2e — playwright</div>
        <div
          style={{
            fontFamily: "Geist Mono, monospace",
            fontSize: 32,
            fontWeight: 700,
            color: green,
            letterSpacing: "-0.03em",
          }}
        >
          {counterValue}
          <span
            style={{
              color: brand.textMuted,
              fontSize: 16,
              fontWeight: 500,
              marginLeft: 6,
            }}
          >
            specs
          </span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gridTemplateRows: "repeat(5, 1fr)",
          gap: 10,
          flex: 1,
          marginTop: 12,
        }}
      >
        {Array.from({ length: 25 }).map((_, i) => (
          <div
            key={i}
            style={{
              opacity: cellOpacity(i),
              borderRadius: 8,
              backgroundColor: `${green}15`,
              border: `1px solid ${green}40`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Geist Mono, monospace",
              fontSize: 11,
              color: green,
              fontWeight: 600,
            }}
          >
            ✓
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 8,
          paddingTop: 12,
          borderTop: `1px dashed ${brand.border}`,
          fontFamily: "Geist Mono, monospace",
          fontSize: 11,
          color: brand.textMuted,
          display: "flex",
          gap: 12,
        }}
      >
        <span style={{ color: green }}>●</span>
        <span>click → ipc → main → adapter → postgres → renderer</span>
      </div>
    </div>
  );
};
