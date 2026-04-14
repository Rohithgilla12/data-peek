import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion'
import { brand } from '../../lib/colors'

export const NotebookCellsIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const containerEntrance = spring({
    frame: frame - 5,
    fps,
    config: { damping: 200 },
  })
  const containerOpacity = interpolate(containerEntrance, [0, 1], [0, 1])

  const mdEntrance = spring({
    frame: frame - 15,
    fps,
    config: { damping: 200 },
  })
  const mdOpacity = interpolate(mdEntrance, [0, 1], [0, 1])
  const mdTranslateY = interpolate(mdEntrance, [0, 1], [16, 0])

  const sqlEntrance = spring({
    frame: frame - 35,
    fps,
    config: { damping: 200 },
  })
  const sqlOpacity = interpolate(sqlEntrance, [0, 1], [0, 1])
  const sqlTranslateY = interpolate(sqlEntrance, [0, 1], [16, 0])

  const resultEntrance = spring({
    frame: frame - 60,
    fps,
    config: { damping: 200 },
  })
  const resultOpacity = interpolate(resultEntrance, [0, 1], [0, 1])

  return (
    <div
      style={{
        width: 580,
        height: 420,
        backgroundColor: brand.surface,
        borderRadius: 16,
        border: `1px solid ${brand.border}`,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        opacity: containerOpacity,
      }}
    >
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 12,
          color: brand.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        runbook.dpnb
      </div>

      <div
        style={{
          opacity: mdOpacity,
          transform: `translateY(${mdTranslateY}px)`,
          backgroundColor: brand.surfaceElevated,
          borderRadius: 10,
          border: `1px solid ${brand.border}`,
          borderLeft: `3px solid #6b8cf5`,
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 10,
              color: '#6b8cf5',
              padding: '1px 6px',
              borderRadius: 4,
              backgroundColor: '#6b8cf510',
              border: '1px solid #6b8cf530',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            md
          </span>
          <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, color: brand.textMuted }}>
            markdown cell
          </span>
        </div>
        <div
          style={{
            fontFamily: 'Geist, system-ui, sans-serif',
            fontSize: 16,
            fontWeight: 700,
            color: brand.textPrimary,
          }}
        >
          # Daily Active Users Report
        </div>
        <div
          style={{
            fontFamily: 'Geist, system-ui, sans-serif',
            fontSize: 12,
            color: brand.textSecondary,
            lineHeight: 1.5,
          }}
        >
          Check DAU for the last 7 days. Compare against baseline.
        </div>
      </div>

      <div
        style={{
          opacity: sqlOpacity,
          transform: `translateY(${sqlTranslateY}px)`,
          backgroundColor: brand.surfaceElevated,
          borderRadius: 10,
          border: `1px solid ${brand.border}`,
          borderLeft: `3px solid #f59e0b`,
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 10,
              color: '#f59e0b',
              padding: '1px 6px',
              borderRadius: 4,
              backgroundColor: '#f59e0b10',
              border: '1px solid #f59e0b30',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            sql
          </span>
          <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, color: brand.textMuted }}>
            query cell
          </span>
        </div>
        <div
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 12,
            lineHeight: 1.6,
            color: brand.textSecondary,
          }}
        >
          <span style={{ color: '#6b8cf5' }}>SELECT</span>
          <span style={{ color: brand.textPrimary }}> date_trunc(</span>
          <span style={{ color: '#10b981' }}>'day'</span>
          <span style={{ color: brand.textPrimary }}>, created_at) </span>
          <span style={{ color: '#6b8cf5' }}>AS</span>
          <span style={{ color: brand.textPrimary }}> day,</span>
          <br />
          <span style={{ color: brand.textMuted }}>{'       '}</span>
          <span style={{ color: '#f59e0b' }}>count</span>
          <span style={{ color: brand.textPrimary }}>(*) </span>
          <span style={{ color: '#6b8cf5' }}>AS</span>
          <span style={{ color: brand.textPrimary }}> users</span>
          <br />
          <span style={{ color: '#6b8cf5' }}>FROM</span>
          <span style={{ color: brand.textPrimary }}> events </span>
          <span style={{ color: '#6b8cf5' }}>GROUP BY</span>
          <span style={{ color: brand.textPrimary }}> 1 </span>
          <span style={{ color: '#6b8cf5' }}>ORDER BY</span>
          <span style={{ color: brand.textPrimary }}> 1 </span>
          <span style={{ color: '#6b8cf5' }}>DESC</span>
        </div>
      </div>

      <div
        style={{
          opacity: resultOpacity,
          borderRadius: 8,
          overflow: 'hidden',
          border: `1px solid ${brand.border}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            padding: '5px 12px',
            backgroundColor: brand.surfaceElevated,
            borderBottom: `1px solid ${brand.border}`,
          }}
        >
          {['day', 'users'].map((col) => (
            <span
              key={col}
              style={{
                flex: 1,
                fontFamily: 'Geist Mono, monospace',
                fontSize: 11,
                color: brand.textMuted,
                fontWeight: 500,
              }}
            >
              {col}
            </span>
          ))}
        </div>
        {[
          { day: '2024-04-12', users: '2,847' },
          { day: '2024-04-11', users: '3,102' },
          { day: '2024-04-10', users: '2,991' },
        ].map((row, i) => {
          const rowEntrance = spring({
            frame: frame - 70 - i * 6,
            fps,
            config: { damping: 200 },
          })
          const rowOpacity = interpolate(rowEntrance, [0, 1], [0, 1])

          return (
            <div
              key={row.day}
              style={{
                opacity: rowOpacity,
                display: 'flex',
                padding: '6px 12px',
                borderBottom: `1px solid ${brand.border}`,
              }}
            >
              <span style={{ flex: 1, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: brand.textSecondary }}>
                {row.day}
              </span>
              <span style={{ flex: 1, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: '#10b981' }}>
                {row.users}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const PinnedResultsIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const containerEntrance = spring({
    frame: frame - 5,
    fps,
    config: { damping: 200 },
  })
  const containerOpacity = interpolate(containerEntrance, [0, 1], [0, 1])

  const badgeEntrance = spring({
    frame: frame - 25,
    fps,
    config: { damping: 12, stiffness: 100 },
  })
  const badgeScale = interpolate(badgeEntrance, [0, 1], [0.7, 1])
  const badgeOpacity = interpolate(badgeEntrance, [0, 1], [0, 1])

  return (
    <div
      style={{
        width: 580,
        height: 400,
        backgroundColor: brand.surface,
        borderRadius: 16,
        border: `1px solid ${brand.border}`,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        opacity: containerOpacity,
      }}
    >
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 12,
          color: brand.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        pinned query result
      </div>

      <div
        style={{
          backgroundColor: brand.surfaceElevated,
          borderRadius: 10,
          border: `1px solid ${brand.border}`,
          borderLeft: `3px solid #f59e0b`,
          padding: '10px 14px',
          fontFamily: 'Geist Mono, monospace',
          fontSize: 13,
          color: brand.textSecondary,
        }}
      >
        <span style={{ color: '#6b8cf5' }}>SELECT</span>
        {' * '}
        <span style={{ color: '#6b8cf5' }}>FROM</span>
        {' users '}
        <span style={{ color: '#6b8cf5' }}>WHERE</span>
        {' plan = '}
        <span style={{ color: '#10b981' }}>'pro'</span>
      </div>

      <div
        style={{
          opacity: badgeOpacity,
          transform: `scale(${badgeScale})`,
          transformOrigin: 'left center',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          backgroundColor: '#f59e0b10',
          borderRadius: 8,
          border: '1px solid #f59e0b30',
          alignSelf: 'flex-start',
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: '#f59e0b',
          }}
        />
        <span
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 12,
            color: '#f59e0b',
          }}
        >
          Pinned — ran Apr 12, 09:14
        </span>
      </div>

      <div
        style={{
          borderRadius: 8,
          overflow: 'hidden',
          border: `1px solid ${brand.border}`,
          flex: 1,
        }}
      >
        <div
          style={{
            display: 'flex',
            padding: '6px 12px',
            backgroundColor: brand.surfaceElevated,
            borderBottom: `1px solid ${brand.border}`,
          }}
        >
          {['id', 'email', 'plan', 'mrr'].map((col) => (
            <span
              key={col}
              style={{
                flex: 1,
                fontFamily: 'Geist Mono, monospace',
                fontSize: 11,
                color: brand.textMuted,
                fontWeight: 500,
              }}
            >
              {col}
            </span>
          ))}
        </div>
        {[
          { id: '1', email: 'alice@co.com', plan: 'pro', mrr: '$49' },
          { id: '2', email: 'bob@co.com', plan: 'pro', mrr: '$49' },
          { id: '3', email: 'carol@co.com', plan: 'pro', mrr: '$99' },
          { id: '4', email: 'dan@co.com', plan: 'pro', mrr: '$49' },
        ].map((row, i) => {
          const rowEntrance = spring({
            frame: frame - 35 - i * 8,
            fps,
            config: { damping: 200 },
          })
          const rowOpacity = interpolate(rowEntrance, [0, 1], [0, 1])

          return (
            <div
              key={row.id}
              style={{
                opacity: rowOpacity,
                display: 'flex',
                padding: '7px 12px',
                borderBottom: `1px solid ${brand.border}`,
              }}
            >
              <span style={{ flex: 1, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: brand.textMuted }}>
                {row.id}
              </span>
              <span style={{ flex: 1, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: brand.textPrimary }}>
                {row.email}
              </span>
              <span
                style={{
                  flex: 1,
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 12,
                  color: '#f59e0b',
                }}
              >
                {row.plan}
              </span>
              <span style={{ flex: 1, fontFamily: 'Geist Mono, monospace', fontSize: 12, color: '#10b981' }}>
                {row.mrr}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const KeyboardNavIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const focusIndex = Math.floor(frame / 28) % 3

  const cells = [
    { label: 'SELECT count(*) FROM users', type: 'sql' },
    { label: '## Results look normal', type: 'md' },
    { label: 'SELECT * FROM events LIMIT 20', type: 'sql' },
  ]

  return (
    <div
      style={{
        width: 580,
        height: 400,
        backgroundColor: brand.surface,
        borderRadius: 16,
        border: `1px solid ${brand.border}`,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 12,
          color: brand.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        keyboard navigation
      </div>

      {cells.map((cell, i) => {
        const isFocused = focusIndex === i
        const entrance = spring({
          frame: frame - 8 - i * 12,
          fps,
          config: { damping: 200 },
        })
        const opacity = interpolate(entrance, [0, 1], [0, 1])
        const translateY = interpolate(entrance, [0, 1], [12, 0])

        const accentColor = cell.type === 'sql' ? '#f59e0b' : '#6b8cf5'
        const focusGlow = isFocused
          ? interpolate(
              Math.sin(frame * 0.15),
              [-1, 1],
              [0.4, 1]
            )
          : 0.3

        return (
          <div
            key={i}
            style={{
              opacity,
              transform: `translateY(${translateY}px)`,
              backgroundColor: brand.surfaceElevated,
              borderRadius: 10,
              border: `2px solid ${isFocused ? accentColor : brand.border}`,
              borderLeft: `4px solid ${accentColor}`,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              boxShadow: isFocused ? `0 0 0 2px ${accentColor}30` : 'none',
              transition: 'border-color 0.15s',
            }}
          >
            <span
              style={{
                fontFamily: 'Geist Mono, monospace',
                fontSize: 10,
                color: accentColor,
                opacity: isFocused ? 1 : focusGlow,
                padding: '1px 6px',
                borderRadius: 4,
                backgroundColor: `${accentColor}12`,
                border: `1px solid ${accentColor}30`,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                flexShrink: 0,
              }}
            >
              {cell.type}
            </span>
            <span
              style={{
                fontFamily: 'Geist Mono, monospace',
                fontSize: 13,
                color: isFocused ? brand.textPrimary : brand.textSecondary,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              }}
            >
              {cell.label}
            </span>
            {isFocused && (
              <span
                style={{
                  marginLeft: 'auto',
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 10,
                  color: accentColor,
                  flexShrink: 0,
                }}
              >
                focused
              </span>
            )}
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 4 }}>
        {['Shift+Enter — run & advance', 'Cmd+J — next cell', 'Cmd+K — prev cell'].map((kb, i) => {
          const entrance = spring({
            frame: frame - 50 - i * 8,
            fps,
            config: { damping: 200 },
          })
          const opacity = interpolate(entrance, [0, 1], [0, 1])

          return (
            <span
              key={kb}
              style={{
                opacity,
                fontFamily: 'Geist Mono, monospace',
                fontSize: 10,
                color: '#a855f7',
                padding: '3px 10px',
                borderRadius: 6,
                backgroundColor: '#a855f710',
                border: '1px solid #a855f725',
              }}
            >
              {kb}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export const ExportShareIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const sourceEntrance = spring({
    frame: frame - 8,
    fps,
    config: { damping: 200 },
  })
  const sourceOpacity = interpolate(sourceEntrance, [0, 1], [0, 1])
  const sourceTranslateX = interpolate(sourceEntrance, [0, 1], [-24, 0])

  const arrowEntrance = spring({
    frame: frame - 30,
    fps,
    config: { damping: 200 },
  })
  const arrowOpacity = interpolate(arrowEntrance, [0, 1], [0, 1])

  const dpnbEntrance = spring({
    frame: frame - 45,
    fps,
    config: { damping: 12, stiffness: 100 },
  })
  const dpnbScale = interpolate(dpnbEntrance, [0, 1], [0.7, 1])
  const dpnbOpacity = interpolate(dpnbEntrance, [0, 1], [0, 1])

  const mdEntrance = spring({
    frame: frame - 65,
    fps,
    config: { damping: 12, stiffness: 100 },
  })
  const mdScale = interpolate(mdEntrance, [0, 1], [0.7, 1])
  const mdOpacity = interpolate(mdEntrance, [0, 1], [0, 1])

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
        gap: 24,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 12,
          color: brand.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          alignSelf: 'flex-start',
        }}
      >
        export & share
      </div>

      <div
        style={{
          opacity: sourceOpacity,
          transform: `translateX(${sourceTranslateX}px)`,
          padding: '14px 20px',
          backgroundColor: brand.surfaceElevated,
          borderRadius: 12,
          border: `1px solid ${brand.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            backgroundColor: `${brand.accent}15`,
            border: `1px solid ${brand.accent}30`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 14, color: brand.accent }}>
            NB
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 14, color: brand.textPrimary, fontWeight: 500 }}>
            runbook.dpnb
          </span>
          <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, color: brand.textMuted }}>
            4 cells · last run Apr 12
          </span>
        </div>
      </div>

      <div
        style={{
          opacity: arrowOpacity,
          display: 'flex',
          alignItems: 'center',
          gap: 40,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 18, color: brand.textMuted }}>↙</div>
          <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, color: brand.textMuted }}>reimportable</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 18, color: brand.textMuted }}>↘</div>
          <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, color: brand.textMuted }}>readable anywhere</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        <div
          style={{
            opacity: dpnbOpacity,
            transform: `scale(${dpnbScale})`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            padding: '16px 24px',
            backgroundColor: brand.surfaceElevated,
            borderRadius: 12,
            border: `1px solid ${brand.accent}40`,
          }}
        >
          <div
            style={{
              width: 44,
              height: 52,
              borderRadius: 8,
              backgroundColor: `${brand.accent}15`,
              border: `1px solid ${brand.accent}40`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, color: brand.accent, fontWeight: 700 }}>
              .dpnb
            </span>
          </div>
          <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, color: brand.accent }}>
            Export as .dpnb
          </span>
          <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, color: brand.textMuted }}>
            data-peek native
          </span>
        </div>

        <div
          style={{
            opacity: mdOpacity,
            transform: `scale(${mdScale})`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            padding: '16px 24px',
            backgroundColor: brand.surfaceElevated,
            borderRadius: 12,
            border: `1px solid #10b98140`,
          }}
        >
          <div
            style={{
              width: 44,
              height: 52,
              borderRadius: 8,
              backgroundColor: '#10b98115',
              border: '1px solid #10b98140',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, color: '#10b981', fontWeight: 700 }}>
              .md
            </span>
          </div>
          <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, color: '#10b981' }}>
            Export as .md
          </span>
          <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, color: brand.textMuted }}>
            readable anywhere
          </span>
        </div>
      </div>
    </div>
  )
}
