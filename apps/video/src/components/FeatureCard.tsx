import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion'
import { brand } from '../lib/colors'
import type { LucideIcon } from 'lucide-react'

type FeatureCardProps = {
  icon: LucideIcon
  title: string
  description: string
  color: string
  delay?: number
}

export const FeatureCard: React.FC<FeatureCardProps> = ({
  icon: Icon,
  title,
  description,
  color,
  delay = 0,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const entrance = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
  })

  const translateY = interpolate(entrance, [0, 1], [40, 0])
  const opacity = interpolate(entrance, [0, 1], [0, 1])

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 20,
          backgroundColor: `${color}15`,
          border: `1px solid ${color}40`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={40} color={color} strokeWidth={1.5} />
      </div>
      <h2
        style={{
          fontFamily: 'Geist, system-ui, sans-serif',
          fontSize: 48,
          fontWeight: 700,
          color: brand.textPrimary,
          margin: 0,
          letterSpacing: '-0.03em',
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 24,
          fontWeight: 400,
          color: brand.textSecondary,
          margin: 0,
          maxWidth: 500,
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
    </div>
  )
}
