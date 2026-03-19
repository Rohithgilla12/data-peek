import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'
import { brand } from '../lib/colors'

export const Background: React.FC = () => {
  const frame = useCurrentFrame()

  const glowOpacity = interpolate(frame, [0, 60], [0, 0.15], {
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{ backgroundColor: brand.background }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(${brand.border}40 1px, transparent 1px),
            linear-gradient(90deg, ${brand.border}40 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          opacity: 0.4,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 800,
          height: 800,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${brand.accent}30 0%, transparent 70%)`,
          opacity: glowOpacity,
          filter: 'blur(80px)',
        }}
      />
    </AbsoluteFill>
  )
}
