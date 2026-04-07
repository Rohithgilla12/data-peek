import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Sequence,
} from 'remotion'
import { brand } from '../../lib/colors'
import { CyanGlow } from '../../components/CyanGlow'
import { Globe, TableProperties, Filter, HardDrive, Package } from 'lucide-react'

type OutroProps = {
  version: string
}

const featureIcons = [
  { icon: Globe, color: '#6b8cf5' },
  { icon: TableProperties, color: '#3b82f6' },
  { icon: Filter, color: '#f59e0b' },
  { icon: HardDrive, color: '#a855f7' },
  { icon: Package, color: '#10b981' },
]

export const Outro: React.FC<OutroProps> = ({ version }) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const fadeOut = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 36,
        opacity: fadeOut,
      }}
    >
      <CyanGlow size={500} delay={0} />

      <div style={{ display: 'flex', gap: 16 }}>
        {featureIcons.map(({ icon: Icon, color }, i) => {
          const entrance = spring({
            frame: frame - i * 4,
            fps,
            config: { damping: 12, stiffness: 100 },
          })
          const scale = interpolate(entrance, [0, 1], [0, 1])

          return (
            <div
              key={i}
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                backgroundColor: `${color}15`,
                border: `1px solid ${color}40`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `scale(${scale})`,
              }}
            >
              <Icon size={22} color={color} strokeWidth={1.5} />
            </div>
          )
        })}
      </div>

      <Sequence from={15} layout="none">
        <TitleReveal version={version} />
      </Sequence>

      <Sequence from={30} layout="none">
        <CtaReveal />
      </Sequence>
    </AbsoluteFill>
  )
}

const TitleReveal: React.FC<{ version: string }> = ({ version }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const entrance = spring({ frame, fps, config: { damping: 200 } })
  const opacity = interpolate(entrance, [0, 1], [0, 1])
  const translateY = interpolate(entrance, [0, 1], [20, 0])

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 56,
          fontWeight: 700,
          color: brand.textPrimary,
          letterSpacing: '-0.04em',
        }}
      >
        data-peek{' '}
        <span style={{ color: brand.accent }}>v{version}</span>
      </div>
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 22,
          color: brand.textMuted,
        }}
      >
        Desktop. Web. Everywhere.
      </div>
    </div>
  )
}

const CtaReveal: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const entrance = spring({ frame, fps, config: { damping: 200 } })
  const opacity = interpolate(entrance, [0, 1], [0, 1])

  return (
    <div
      style={{
        opacity,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 24,
          color: brand.textMuted,
        }}
      >
        Try it now
      </div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <div
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 28,
            fontWeight: 500,
            color: brand.accent,
            borderBottom: `2px solid ${brand.accent}60`,
            paddingBottom: 4,
          }}
        >
          datapeek.dev
        </div>
        <span
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 18,
            color: brand.textMuted,
          }}
        >
          |
        </span>
        <div
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 28,
            fontWeight: 500,
            color: '#10b981',
            borderBottom: '2px solid #10b98160',
            paddingBottom: 4,
          }}
        >
          app.datapeek.dev
        </div>
      </div>
    </div>
  )
}
