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
import { Zap } from 'lucide-react'

export const Speed: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const iconEntrance = spring({ frame, fps, config: { damping: 12, stiffness: 100 } })
  const iconScale = interpolate(iconEntrance, [0, 1], [0.4, 1])
  const iconOpacity = interpolate(iconEntrance, [0, 1], [0, 1])

  const numberEntrance = spring({
    frame: frame - 12,
    fps,
    config: { damping: 14, stiffness: 90 },
  })
  const numberScale = interpolate(numberEntrance, [0, 1], [0.7, 1])
  const numberOpacity = interpolate(numberEntrance, [0, 1], [0, 1])

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
      }}
    >
      <CyanGlow size={520} delay={0} />

      <div
        style={{
          transform: `scale(${iconScale})`,
          opacity: iconOpacity,
          width: 80,
          height: 80,
          borderRadius: 20,
          backgroundColor: `${brand.accent}15`,
          border: `1px solid ${brand.accent}40`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Zap size={40} color={brand.accent} strokeWidth={1.5} />
      </div>

      <div
        style={{
          opacity: numberOpacity,
          transform: `scale(${numberScale})`,
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 168,
            fontWeight: 700,
            color: brand.textPrimary,
            letterSpacing: '-0.06em',
            lineHeight: 1,
          }}
        >
          &lt;1s
        </span>
        <span
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 38,
            color: brand.accent,
            fontWeight: 500,
          }}
        >
          cold start
        </span>
      </div>

      <Sequence from={42} layout="none">
        <SubText />
      </Sequence>
    </AbsoluteFill>
  )
}

const SubText: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const entrance = spring({ frame, fps, config: { damping: 200 } })
  const opacity = interpolate(entrance, [0, 1], [0, 1])
  const translateY = interpolate(entrance, [0, 1], [10, 0])

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          marginTop: 360,
          opacity,
          transform: `translateY(${translateY}px)`,
          fontFamily: 'Geist Mono, monospace',
          fontSize: 26,
          color: brand.textMuted,
          letterSpacing: '-0.02em',
        }}
      >
        No splash. No tour. Just your data.
      </div>
    </AbsoluteFill>
  )
}
