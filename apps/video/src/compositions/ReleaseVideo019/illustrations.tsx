import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion'
import { brand } from '../../lib/colors'

export const WebAppIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const panels = [
    { label: 'Schema', width: 160 },
    { label: 'Editor', width: 280 },
    { label: 'Results', width: 280 },
  ]

  const chromeEntrance = spring({
    frame: frame - 5,
    fps,
    config: { damping: 200 },
  })
  const chromeOpacity = interpolate(chromeEntrance, [0, 1], [0, 1])

  return (
    <div
      style={{
        width: 580,
        height: 400,
        backgroundColor: brand.surface,
        borderRadius: 16,
        border: `1px solid ${brand.border}`,
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 13,
          color: brand.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        app.datapeek.dev
      </div>

      <div
        style={{
          opacity: chromeOpacity,
          borderRadius: 10,
          overflow: 'hidden',
          border: `1px solid ${brand.border}`,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            backgroundColor: brand.surfaceElevated,
            borderBottom: `1px solid ${brand.border}`,
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#ef4444' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#f59e0b' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#10b981' }} />
          <span
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 11,
              color: brand.textMuted,
              marginLeft: 8,
            }}
          >
            app.datapeek.dev/query
          </span>
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            gap: 1,
            backgroundColor: brand.border,
          }}
        >
          {panels.map((panel, i) => {
            const entrance = spring({
              frame: frame - 15 - i * 10,
              fps,
              config: { damping: 200 },
            })
            const opacity = interpolate(entrance, [0, 1], [0, 1])

            return (
              <div
                key={panel.label}
                style={{
                  opacity,
                  flex: panel.width,
                  backgroundColor: brand.background,
                  padding: '12px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    fontFamily: 'Geist Mono, monospace',
                    fontSize: 10,
                    color: brand.accent,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {panel.label}
                </span>
                {Array.from({ length: 4 }).map((_, j) => (
                  <div
                    key={j}
                    style={{
                      height: i === 2 ? 16 : 10,
                      borderRadius: 4,
                      backgroundColor: `${brand.textMuted}15`,
                      width: `${60 + Math.sin(i + j) * 30}%`,
                    }}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
        }}
      >
        {['Clerk Auth', 'tRPC', 'Encrypted'].map((tag, i) => {
          const entrance = spring({
            frame: frame - 50 - i * 6,
            fps,
            config: { damping: 200 },
          })
          const opacity = interpolate(entrance, [0, 1], [0, 1])

          return (
            <span
              key={tag}
              style={{
                opacity,
                fontFamily: 'Geist Mono, monospace',
                fontSize: 11,
                color: brand.accent,
                padding: '3px 10px',
                borderRadius: 6,
                backgroundColor: `${brand.accent}15`,
                border: `1px solid ${brand.accent}30`,
              }}
            >
              {tag}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export const TableEditorIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const columns = [
    { name: 'id', type: 'int4', pk: true, fk: false },
    { name: 'name', type: 'varchar', pk: false, fk: false },
    { name: 'team_id', type: 'int4', pk: false, fk: true },
    { name: 'active', type: 'bool', pk: false, fk: false },
  ]

  const rows = [
    { id: '1', name: 'Alice', team_id: '3', active: true, edited: false },
    { id: '2', name: 'Bob', team_id: '1', active: false, edited: true },
    { id: '3', name: 'Carol', team_id: '2', active: true, edited: false },
  ]

  return (
    <div
      style={{
        width: 580,
        height: 400,
        backgroundColor: brand.surface,
        borderRadius: 16,
        border: `1px solid ${brand.border}`,
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 13,
          color: brand.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        Schema explorer + inline editing
      </div>

      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        {columns.map((col, i) => {
          const entrance = spring({
            frame: frame - 5 - i * 6,
            fps,
            config: { damping: 200 },
          })
          const opacity = interpolate(entrance, [0, 1], [0, 1])

          return (
            <div
              key={col.name}
              style={{
                opacity,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                backgroundColor: brand.surfaceElevated,
                borderRadius: 6,
                border: `1px solid ${brand.border}`,
                fontFamily: 'Geist Mono, monospace',
                fontSize: 12,
              }}
            >
              {col.pk && <span style={{ color: '#f59e0b', fontSize: 10 }}>PK</span>}
              {col.fk && <span style={{ color: '#a855f7', fontSize: 10 }}>FK</span>}
              <span style={{ color: brand.textPrimary }}>{col.name}</span>
              <span style={{ color: brand.textMuted, fontSize: 10 }}>{col.type}</span>
            </div>
          )
        })}
      </div>

      <div
        style={{
          borderRadius: 10,
          overflow: 'hidden',
          border: `1px solid ${brand.border}`,
          flex: 1,
        }}
      >
        <div
          style={{
            display: 'flex',
            padding: '6px 14px',
            backgroundColor: brand.surfaceElevated,
            borderBottom: `1px solid ${brand.border}`,
          }}
        >
          {columns.map((col) => (
            <span
              key={col.name}
              style={{
                flex: 1,
                fontFamily: 'Geist Mono, monospace',
                fontSize: 11,
                color: brand.textMuted,
                fontWeight: 500,
              }}
            >
              {col.name}
            </span>
          ))}
        </div>

        {rows.map((row, i) => {
          const entrance = spring({
            frame: frame - 20 - i * 8,
            fps,
            config: { damping: 200 },
          })
          const opacity = interpolate(entrance, [0, 1], [0, 1])

          const editGlow = row.edited
            ? interpolate(
                spring({ frame: frame - 50, fps, config: { damping: 12, stiffness: 80 } }),
                [0, 1],
                [0, 1]
              )
            : 0

          return (
            <div
              key={row.id}
              style={{
                opacity,
                display: 'flex',
                padding: '8px 14px',
                backgroundColor: row.edited
                  ? `rgba(251, 191, 36, ${editGlow * 0.08})`
                  : 'transparent',
                borderBottom: `1px solid ${brand.border}`,
              }}
            >
              <span style={{ flex: 1, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: brand.textSecondary }}>
                {row.id}
              </span>
              <span
                style={{
                  flex: 1,
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 12,
                  color: row.edited ? '#fbbf24' : brand.textPrimary,
                  fontWeight: row.edited ? 600 : 400,
                }}
              >
                {row.name}
              </span>
              <span style={{ flex: 1, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: '#a855f7' }}>
                {row.team_id}
              </span>
              <span style={{ flex: 1, fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>
                <span
                  style={{
                    padding: '1px 6px',
                    borderRadius: 4,
                    backgroundColor: row.active ? '#10b98115' : '#ef444415',
                    color: row.active ? '#10b981' : '#ef4444',
                    fontSize: 11,
                  }}
                >
                  {row.active ? 'true' : 'false'}
                </span>
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        {['FK icons', 'Boolean pills', 'Inline edit', 'Empty states'].map((tag, i) => {
          const entrance = spring({
            frame: frame - 60 - i * 5,
            fps,
            config: { damping: 200 },
          })
          const opacity = interpolate(entrance, [0, 1], [0, 1])

          return (
            <span
              key={tag}
              style={{
                opacity,
                fontFamily: 'Geist Mono, monospace',
                fontSize: 10,
                color: brand.accent,
                padding: '3px 8px',
                borderRadius: 5,
                backgroundColor: `${brand.accent}12`,
                border: `1px solid ${brand.accent}25`,
              }}
            >
              {tag}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export const SmartFilterIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const filters = [
    { col: 'age', op: '>', val: '25', type: 'integer' },
    { col: 'status', op: '=', val: "'active'", type: 'text' },
    { col: 'created', op: '>=', val: "'2024-01'", type: 'timestamp' },
  ]

  return (
    <div
      style={{
        width: 580,
        height: 400,
        backgroundColor: brand.surface,
        borderRadius: 16,
        border: `1px solid ${brand.border}`,
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 13,
          color: brand.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        Type-aware filter bar
      </div>

      {filters.map((f, i) => {
        const entrance = spring({
          frame: frame - 8 - i * 14,
          fps,
          config: { damping: 200 },
        })
        const opacity = interpolate(entrance, [0, 1], [0, 1])
        const translateX = interpolate(entrance, [0, 1], [24, 0])

        return (
          <div
            key={f.col}
            style={{
              opacity,
              transform: `translateX(${translateX}px)`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              backgroundColor: brand.surfaceElevated,
              borderRadius: 10,
              border: `1px solid ${brand.border}`,
              fontFamily: 'Geist Mono, monospace',
            }}
          >
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                backgroundColor: `${brand.accent}20`,
                color: brand.accent,
                fontSize: 11,
              }}
            >
              {f.type}
            </span>
            <span style={{ fontSize: 14, color: brand.textPrimary }}>{f.col}</span>
            <span style={{ fontSize: 14, color: '#f59e0b', fontWeight: 600 }}>{f.op}</span>
            <span style={{ fontSize: 14, color: '#10b981' }}>{f.val}</span>
          </div>
        )
      })}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          backgroundColor: `${brand.accent}08`,
          borderRadius: 8,
          border: `1px dashed ${brand.accent}30`,
        }}
      >
        <span
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 12,
            color: brand.textMuted,
          }}
        >
          WHERE age {'>'} 25 AND status = 'active' AND created {'>='}  '2024-01'
        </span>
        {(() => {
          const copyEntrance = spring({
            frame: frame - 70,
            fps,
            config: { damping: 12, stiffness: 100 },
          })
          const copyScale = interpolate(copyEntrance, [0, 1], [0.8, 1])
          const copyOpacity = interpolate(copyEntrance, [0, 1], [0, 1])

          return (
            <span
              style={{
                marginLeft: 'auto',
                opacity: copyOpacity,
                transform: `scale(${copyScale})`,
                fontFamily: 'Geist Mono, monospace',
                fontSize: 11,
                color: '#10b981',
                padding: '2px 8px',
                borderRadius: 4,
                backgroundColor: '#10b98115',
              }}
            >
              Copied!
            </span>
          )
        })()}
      </div>
    </div>
  )
}

export const LocalFirstIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const syncSteps = [
    { label: 'IndexedDB', detail: 'Dexie.js', status: 'local', color: '#a855f7' },
    { label: 'Sync queue', detail: 'Background worker', status: 'syncing', color: '#f59e0b' },
    { label: 'PostgreSQL', detail: 'Remote backup', status: 'cloud', color: '#3b82f6' },
  ]

  return (
    <div
      style={{
        width: 580,
        height: 400,
        backgroundColor: brand.surface,
        borderRadius: 16,
        border: `1px solid ${brand.border}`,
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 13,
          color: brand.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        Local-first architecture
      </div>

      {syncSteps.map((step, i) => {
        const entrance = spring({
          frame: frame - 10 - i * 16,
          fps,
          config: { damping: 200 },
        })
        const opacity = interpolate(entrance, [0, 1], [0, 1])
        const translateY = interpolate(entrance, [0, 1], [20, 0])

        const pulseOpacity = step.status === 'syncing'
          ? interpolate(Math.sin(frame * 0.12), [-1, 1], [0.4, 1])
          : 1

        return (
          <div key={step.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
              style={{
                opacity,
                transform: `translateY(${translateY}px)`,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                backgroundColor: brand.surfaceElevated,
                borderRadius: 10,
                border: `1px solid ${brand.border}`,
                fontFamily: 'Geist Mono, monospace',
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: step.color,
                  opacity: pulseOpacity,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 15, color: brand.textPrimary, fontWeight: 500 }}>
                {step.label}
              </span>
              <span style={{ fontSize: 13, color: brand.textMuted, marginLeft: 'auto' }}>
                {step.detail}
              </span>
            </div>
            {i < syncSteps.length - 1 && (
              <div
                style={{
                  textAlign: 'center',
                  color: brand.textMuted,
                  fontSize: 14,
                  fontFamily: 'Geist Mono, monospace',
                  opacity: interpolate(
                    spring({ frame: frame - 30 - i * 16, fps, config: { damping: 200 } }),
                    [0, 1],
                    [0, 1]
                  ),
                }}
              >
                ↓ sync
              </div>
            )}
          </div>
        )
      })}

      <div
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
          marginTop: 4,
        }}
      >
        {['Instant queries', 'Works offline', 'Auto-sync'].map((tag, i) => {
          const entrance = spring({
            frame: frame - 65 - i * 6,
            fps,
            config: { damping: 200 },
          })
          const opacity = interpolate(entrance, [0, 1], [0, 1])

          return (
            <span
              key={tag}
              style={{
                opacity,
                fontFamily: 'Geist Mono, monospace',
                fontSize: 11,
                color: '#10b981',
                padding: '3px 10px',
                borderRadius: 6,
                backgroundColor: '#10b98110',
                border: `1px solid #10b98125`,
              }}
            >
              {tag}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export const SharedUiIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const components = [
    { name: 'Button', variant: 3 },
    { name: 'DataTable', variant: 1 },
    { name: 'Dialog', variant: 2 },
    { name: 'Sidebar', variant: 1 },
    { name: 'Tooltip', variant: 2 },
  ]

  return (
    <div
      style={{
        width: 580,
        height: 400,
        backgroundColor: brand.surface,
        borderRadius: 16,
        border: `1px solid ${brand.border}`,
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 13,
          color: brand.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        @data-peek/ui
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        {components.map((comp, i) => {
          const entrance = spring({
            frame: frame - 8 - i * 8,
            fps,
            config: { damping: 12, stiffness: 100 },
          })
          const scale = interpolate(entrance, [0, 1], [0.7, 1])
          const opacity = interpolate(entrance, [0, 1], [0, 1])

          return (
            <div
              key={comp.name}
              style={{
                opacity,
                transform: `scale(${scale})`,
                padding: '10px 16px',
                backgroundColor: brand.surfaceElevated,
                borderRadius: 10,
                border: `1px solid ${brand.border}`,
                fontFamily: 'Geist Mono, monospace',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 14, color: brand.textPrimary }}>{comp.name}</span>
              <span
                style={{
                  fontSize: 11,
                  color: brand.textMuted,
                  padding: '1px 6px',
                  borderRadius: 4,
                  backgroundColor: `${brand.textMuted}15`,
                }}
              >
                {comp.variant}v
              </span>
            </div>
          )
        })}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '12px 16px',
          backgroundColor: `${brand.accent}08`,
          borderRadius: 10,
          border: `1px solid ${brand.accent}20`,
        }}
      >
        {['Desktop', 'Web'].map((target, i) => {
          const entrance = spring({
            frame: frame - 50 - i * 10,
            fps,
            config: { damping: 200 },
          })
          const opacity = interpolate(entrance, [0, 1], [0, 1])

          return (
            <div
              key={target}
              style={{
                opacity,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: brand.accent,
                }}
              />
              <span
                style={{
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 13,
                  color: brand.textSecondary,
                }}
              >
                {target} app
              </span>
            </div>
          )
        })}
        <span
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 12,
            color: brand.textMuted,
            marginLeft: 'auto',
          }}
        >
          One library, both platforms
        </span>
      </div>
    </div>
  )
}
