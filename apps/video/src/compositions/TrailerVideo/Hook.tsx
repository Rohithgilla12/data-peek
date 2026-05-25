import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { brand } from '../../lib/colors'
import { TypewriterText } from '../../components/TypewriterText'

export const Hook: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const cursorFade = spring({
    frame: frame - 70,
    fps,
    config: { damping: 200 },
  })
  const subtleFade = interpolate(cursorFade, [0, 1], [1, 0.5])

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: brand.background,
      }}
    >
      <div
        style={{
          opacity: subtleFade,
          fontFamily: 'Geist Mono, monospace',
          fontSize: 64,
          fontWeight: 500,
          color: brand.textPrimary,
          letterSpacing: '-0.03em',
          textAlign: 'center',
        }}
      >
        <TypewriterText
          text="Your SQL client should respect your time."
          charsPerSecond={22}
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 64,
            fontWeight: 500,
            color: brand.textPrimary,
            letterSpacing: '-0.03em',
          }}
          cursorColor={brand.accent}
        />
      </div>
    </AbsoluteFill>
  )
}
