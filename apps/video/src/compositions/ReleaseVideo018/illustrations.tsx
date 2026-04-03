import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion'
import { brand } from '../../lib/colors'

export const PgExportIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const steps = [
    { label: 'pg_dump', detail: 'Stream to file', color: '#3b82f6' },
    { label: 'pg_restore', detail: 'SAVEPOINT recovery', color: '#10b981' },
    { label: 'Cancel tokens', detail: 'Per-webContents scope', color: '#f59e0b' },
    { label: 'SQL streaming', detail: 'No OOM on huge dumps', color: '#8b5cf6' },
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
        gap: 12,
      }}
    >
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 13,
          color: brand.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 4,
        }}
      >
        Export / Import pipeline
      </div>

      {steps.map((step, i) => {
        const entrance = spring({
          frame: frame - 10 - i * 14,
          fps,
          config: { damping: 200 },
        })
        const opacity = interpolate(entrance, [0, 1], [0, 1])
        const translateX = interpolate(entrance, [0, 1], [30, 0])

        const arrowOpacity = interpolate(
          spring({
            frame: frame - 30 - i * 14,
            fps,
            config: { damping: 12, stiffness: 100 },
          }),
          [0, 1],
          [0, 1]
        )

        return (
          <div key={step.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              style={{
                opacity,
                transform: `translateX(${translateX}px)`,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                backgroundColor: brand.surfaceElevated,
                borderRadius: 10,
                border: `1px solid ${brand.border}`,
                fontFamily: 'Geist Mono, monospace',
              }}
            >
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: 6,
                  backgroundColor: `${step.color}20`,
                  color: step.color,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                {step.label}
              </span>
              <span style={{ fontSize: 14, color: brand.textSecondary }}>
                {step.detail}
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  color: '#10b981',
                  opacity: arrowOpacity,
                  fontSize: 16,
                }}
              >
                ✓
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                style={{
                  opacity: arrowOpacity,
                  textAlign: 'center',
                  color: brand.textMuted,
                  fontSize: 14,
                  fontFamily: 'Geist Mono, monospace',
                }}
              >
                ↓
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export const PokemonBuddyIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const achievements = [
    { name: 'Speed Demon', desc: '< 50ms query', emoji: '⚡' },
    { name: 'Night Owl', desc: 'Querying past midnight', emoji: '🦉' },
    { name: 'Early Bird', desc: 'Querying before 6am', emoji: '🐦' },
  ]

  const buddyEntrance = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80 },
  })
  const buddyScale = interpolate(buddyEntrance, [0, 1], [0, 1])

  const bounce = Math.sin(frame * 0.15) * 4

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
        Pokemon buddy
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '16px 20px',
          backgroundColor: brand.surfaceElevated,
          borderRadius: 12,
          border: `1px solid ${brand.border}`,
          transform: `scale(${buddyScale})`,
        }}
      >
        <div
          style={{
            fontSize: 48,
            transform: `translateY(${bounce}px)`,
          }}
        >
          ⚡
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              fontFamily: 'Geist, system-ui, sans-serif',
              fontSize: 22,
              fontWeight: 700,
              color: '#fbbf24',
            }}
          >
            Pikachu
          </span>
          <span
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 13,
              color: brand.textMuted,
            }}
          >
            Mood: excited — 42 queries today
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {achievements.map((ach, i) => {
          const entrance = spring({
            frame: frame - 30 - i * 10,
            fps,
            config: { damping: 200 },
          })
          const opacity = interpolate(entrance, [0, 1], [0, 1])
          const translateY = interpolate(entrance, [0, 1], [12, 0])

          return (
            <div
              key={ach.name}
              style={{
                opacity,
                transform: `translateY(${translateY}px)`,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                backgroundColor: `${brand.accent}10`,
                borderRadius: 8,
                border: `1px solid ${brand.border}`,
                fontFamily: 'Geist Mono, monospace',
              }}
            >
              <span style={{ fontSize: 20 }}>{ach.emoji}</span>
              <span style={{ fontSize: 14, color: brand.textPrimary, fontWeight: 500 }}>
                {ach.name}
              </span>
              <span style={{ fontSize: 13, color: brand.textMuted, marginLeft: 'auto' }}>
                {ach.desc}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const EnvironmentTagIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const envs = [
    { name: 'Production', color: '#ef4444', accent: '#ef4444' },
    { name: 'Staging', color: '#f59e0b', accent: '#f59e0b' },
    { name: 'Development', color: '#10b981', accent: '#10b981' },
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
          marginBottom: 4,
        }}
      >
        Connection environments
      </div>

      {envs.map((env, i) => {
        const entrance = spring({
          frame: frame - 8 - i * 16,
          fps,
          config: { damping: 200 },
        })
        const opacity = interpolate(entrance, [0, 1], [0, 1])
        const translateY = interpolate(entrance, [0, 1], [20, 0])

        const stripWidth = interpolate(
          spring({
            frame: frame - 25 - i * 16,
            fps,
            config: { damping: 12, stiffness: 80 },
          }),
          [0, 1],
          [0, 4]
        )

        return (
          <div
            key={env.name}
            style={{
              opacity,
              transform: `translateY(${translateY}px)`,
              display: 'flex',
              alignItems: 'center',
              gap: 0,
              backgroundColor: brand.surfaceElevated,
              borderRadius: 10,
              border: `1px solid ${brand.border}`,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: stripWidth,
                alignSelf: 'stretch',
                backgroundColor: env.accent,
                flexShrink: 0,
              }}
            />
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                fontFamily: 'Geist Mono, monospace',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: env.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 15, color: brand.textPrimary, fontWeight: 500 }}>
                my-db-{env.name.toLowerCase()}
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  padding: '3px 10px',
                  borderRadius: 6,
                  backgroundColor: `${env.color}20`,
                  color: env.color,
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                {env.name}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export const ShareCardsIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const gradients = [
    { name: 'Raindrop', colors: ['#3b82f6', '#1e40af'] },
    { name: 'Sunset', colors: ['#f59e0b', '#ef4444'] },
    { name: 'Breeze', colors: ['#ec4899', '#8b5cf6'] },
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
        ray.so-inspired share cards
      </div>

      <div
        style={{
          opacity: chromeOpacity,
          borderRadius: 10,
          overflow: 'hidden',
          border: `1px solid ${brand.border}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            backgroundColor: brand.surfaceElevated,
            borderBottom: `1px solid ${brand.border}`,
          }}
        >
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ef4444' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#f59e0b' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#10b981' }} />
          <span
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 12,
              color: brand.textMuted,
              marginLeft: 8,
            }}
          >
            my-postgres — query.sql
          </span>
        </div>

        <div
          style={{
            padding: '14px 16px',
            backgroundColor: '#0d1117',
            fontFamily: 'Geist Mono, monospace',
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          <div>
            <span style={{ color: brand.textMuted, width: 24, display: 'inline-block' }}>1</span>
            <span style={{ color: '#ff7b72' }}>SELECT</span>
            <span style={{ color: brand.textSecondary }}> name, email</span>
          </div>
          <div>
            <span style={{ color: brand.textMuted, width: 24, display: 'inline-block' }}>2</span>
            <span style={{ color: '#ff7b72' }}>FROM</span>
            <span style={{ color: '#79c0ff' }}> users</span>
          </div>
          <div>
            <span style={{ color: brand.textMuted, width: 24, display: 'inline-block' }}>3</span>
            <span style={{ color: '#ff7b72' }}>WHERE</span>
            <span style={{ color: brand.textSecondary }}> active = </span>
            <span style={{ color: '#a5d6ff' }}>true</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        {gradients.map((g, i) => {
          const entrance = spring({
            frame: frame - 40 - i * 8,
            fps,
            config: { damping: 12, stiffness: 100 },
          })
          const scale = interpolate(entrance, [0, 1], [0.8, 1])
          const opacity = interpolate(entrance, [0, 1], [0, 1])

          return (
            <div
              key={g.name}
              style={{
                opacity,
                transform: `scale(${scale})`,
                flex: 1,
                height: 48,
                borderRadius: 8,
                background: `linear-gradient(140deg, ${g.colors[0]}, ${g.colors[1]})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Geist Mono, monospace',
                fontSize: 12,
                color: '#fff',
                fontWeight: 500,
              }}
            >
              {g.name}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const HotkeysIllustration: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const shortcuts = [
    { keys: ['⌘', 'Enter'], action: 'Execute query' },
    { keys: ['⌘', 'S'], action: 'Save query' },
    { keys: ['⌘', 'B'], action: 'Toggle sidebar' },
    { keys: ['⌘', 'T'], action: 'New tab' },
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
        gap: 12,
      }}
    >
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 13,
          color: brand.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 4,
        }}
      >
        @tanstack/react-hotkeys
      </div>

      {shortcuts.map((sc, i) => {
        const entrance = spring({
          frame: frame - 8 - i * 12,
          fps,
          config: { damping: 200 },
        })
        const opacity = interpolate(entrance, [0, 1], [0, 1])
        const translateY = interpolate(entrance, [0, 1], [16, 0])

        const pressEntrance = spring({
          frame: frame - 45 - i * 12,
          fps,
          config: { damping: 12, stiffness: 120 },
        })
        const pressScale = interpolate(pressEntrance, [0, 1], [1, 0.92])
        const pressBg = interpolate(pressEntrance, [0, 0.5, 1], [0, 0.15, 0])

        return (
          <div
            key={sc.action}
            style={{
              opacity,
              transform: `translateY(${translateY}px)`,
              padding: '12px 16px',
              backgroundColor: brand.surfaceElevated,
              borderRadius: 10,
              border: `1px solid ${brand.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontFamily: 'Geist Mono, monospace',
            }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              {sc.keys.map((key) => (
                <span
                  key={key}
                  style={{
                    transform: `scale(${pressScale})`,
                    padding: '4px 10px',
                    borderRadius: 6,
                    backgroundColor: `${brand.accent}${Math.round(pressBg * 255).toString(16).padStart(2, '0') || '15'}`,
                    border: `1px solid ${brand.border}`,
                    color: brand.textPrimary,
                    fontSize: 13,
                    fontWeight: 500,
                    minWidth: 28,
                    textAlign: 'center' as const,
                  }}
                >
                  {key}
                </span>
              ))}
            </div>
            <span style={{ fontSize: 14, color: brand.textSecondary }}>
              {sc.action}
            </span>
          </div>
        )
      })}
    </div>
  )
}
