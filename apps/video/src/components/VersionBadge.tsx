import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion'
import { brand } from '../lib/colors'

type VersionBadgeProps = {
  version: string
}

export const VersionBadge: React.FC<VersionBadgeProps> = ({ version }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const scale = spring({ frame, fps, config: { damping: 200 } })
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
  })

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 20px',
        borderRadius: 999,
        border: `1px solid ${brand.accent}60`,
        backgroundColor: `${brand.accent}15`,
      }}
    >
      <span
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 24,
          fontWeight: 500,
          color: brand.accent,
          letterSpacing: '-0.02em',
        }}
      >
        v{version}
      </span>
    </div>
  )
}
