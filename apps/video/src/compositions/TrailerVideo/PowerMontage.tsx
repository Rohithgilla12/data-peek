import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion'
import { brand } from '../../lib/colors'
import { BookOpen, EyeOff, Activity, GitBranch } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Feature = {
  icon: LucideIcon
  title: string
  blurb: string
  color: string
}

const features: Feature[] = [
  {
    icon: BookOpen,
    title: 'SQL Notebooks',
    blurb: 'Runbooks that actually run.',
    color: '#6b8cf5',
  },
  {
    icon: EyeOff,
    title: 'Data Masking',
    blurb: 'PII hidden by default.',
    color: '#f59e0b',
  },
  {
    icon: Activity,
    title: 'Query Benchmark',
    blurb: 'p50, p95, p99 in one click.',
    color: '#10b981',
  },
  {
    icon: GitBranch,
    title: 'Schema ERD',
    blurb: 'Visualize your database.',
    color: '#a855f7',
  },
]

export const PowerMontage: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const headingEntrance = spring({ frame, fps, config: { damping: 200 } })
  const headingOpacity = interpolate(headingEntrance, [0, 1], [0, 1])
  const headingTranslate = interpolate(headingEntrance, [0, 1], [10, 0])

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 56,
      }}
    >
      <div
        style={{
          opacity: headingOpacity,
          transform: `translateY(${headingTranslate}px)`,
          fontFamily: 'Geist, system-ui, sans-serif',
          fontSize: 56,
          fontWeight: 700,
          color: brand.textPrimary,
          letterSpacing: '-0.04em',
          textAlign: 'center',
          maxWidth: 1200,
        }}
      >
        And the power tools when you need them.
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(340px, 1fr))',
          gap: 24,
          width: 920,
        }}
      >
        {features.map((feat, i) => {
          const cardEntrance = spring({
            frame: frame - 20 - i * 32,
            fps,
            config: { damping: 14, stiffness: 90 },
          })
          const opacity = interpolate(cardEntrance, [0, 1], [0, 1])
          const translateY = interpolate(cardEntrance, [0, 1], [24, 0])
          const Icon = feat.icon

          return (
            <div
              key={feat.title}
              style={{
                opacity,
                transform: `translateY(${translateY}px)`,
                padding: '24px 28px',
                backgroundColor: brand.surface,
                borderRadius: 16,
                border: `1px solid ${feat.color}25`,
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                boxShadow: `0 0 50px ${feat.color}08`,
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  backgroundColor: `${feat.color}15`,
                  border: `1px solid ${feat.color}40`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon size={32} color={feat.color} strokeWidth={1.6} />
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: 'Geist, system-ui, sans-serif',
                    fontSize: 24,
                    fontWeight: 600,
                    color: brand.textPrimary,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {feat.title}
                </span>
                <span
                  style={{
                    fontFamily: 'Geist Mono, monospace',
                    fontSize: 16,
                    color: brand.textSecondary,
                  }}
                >
                  {feat.blurb}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}
