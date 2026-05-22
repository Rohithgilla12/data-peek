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
import { ShieldCheck, X, Check } from 'lucide-react'

/**
 * "It refuses to poll mutations." Lists allowed leading keywords on the left
 * and refused ones on the right with a soft staggered entrance. Pure visual,
 * no animation tricks beyond a tasteful spring entrance.
 */

const accepted: Array<{ kw: string; example: string }> = [
  { kw: 'SELECT', example: 'SELECT * FROM jobs' },
  { kw: 'WITH', example: 'WITH t AS (SELECT…)' },
  { kw: 'VALUES', example: 'VALUES (1, 2), (3, 4)' },
]

const refused: Array<{ kw: string; reason: string }> = [
  { kw: 'UPDATE', reason: 'destructive' },
  { kw: 'DELETE', reason: 'destructive' },
  { kw: 'INSERT', reason: 'destructive' },
  { kw: 'DROP', reason: 'DDL' },
  { kw: 'ALTER', reason: 'DDL' },
  { kw: 'TRUNCATE', reason: 'destructive' },
]

export const SafetyGate: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const headerEntrance = spring({ frame, fps, config: { damping: 200 } })
  const headerOp = interpolate(headerEntrance, [0, 1], [0, 1])

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 80px',
        gap: 24,
      }}
    >
      <CyanGlow size={300} delay={0} x="50%" />

      <div
        style={{
          opacity: headerOp,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <ShieldCheck size={26} color={brand.accent} strokeWidth={1.5} />
        <h2
          style={{
            fontFamily: 'Geist, system-ui, sans-serif',
            fontSize: 36,
            fontWeight: 700,
            color: brand.textPrimary,
            margin: 0,
            letterSpacing: '-0.03em',
          }}
        >
          Refuses to poll mutations.
        </h2>
      </div>

      <Sequence from={10} layout="none">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 32,
            width: 1000,
            marginTop: 16,
          }}
        >
          <Column
            heading="Pollable"
            color="#10b981"
            items={accepted.map((a) => ({
              kw: a.kw,
              detail: a.example,
              icon: <Check size={14} color="#10b981" />,
            }))}
          />
          <Column
            heading="Refused"
            color="#ef4444"
            items={refused.map((r) => ({
              kw: r.kw,
              detail: r.reason,
              icon: <X size={14} color="#ef4444" />,
            }))}
          />
        </div>
      </Sequence>
    </AbsoluteFill>
  )
}

interface ColumnProps {
  heading: string
  color: string
  items: Array<{ kw: string; detail: string; icon: React.ReactNode }>
}

const Column: React.FC<ColumnProps> = ({ heading, color, items }) => {
  return (
    <div
      style={{
        backgroundColor: brand.surface,
        border: `1px solid ${brand.border}`,
        borderRadius: 14,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          fontFamily: 'Geist Mono, monospace',
          fontSize: 11,
          color,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: 4,
        }}
      >
        {heading}
      </div>
      {items.map((item, i) => (
        <Sequence key={item.kw} from={i * 5} layout="none">
          <ItemRow {...item} accent={color} />
        </Sequence>
      ))}
    </div>
  )
}

const ItemRow: React.FC<{
  kw: string
  detail: string
  icon: React.ReactNode
  accent: string
}> = ({ kw, detail, icon, accent }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const e = spring({ frame, fps, config: { damping: 200 } })
  const op = interpolate(e, [0, 1], [0, 1])
  const tx = interpolate(e, [0, 1], [12, 0])
  return (
    <div
      style={{
        opacity: op,
        transform: `translateX(${tx}px)`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        backgroundColor: brand.surfaceElevated,
        borderRadius: 8,
        border: `1px solid ${accent}22`,
        borderLeft: `3px solid ${accent}90`,
        fontFamily: 'Geist Mono, monospace',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          borderRadius: '50%',
          backgroundColor: `${accent}22`,
        }}
      >
        {icon}
      </div>
      <span style={{ fontSize: 18, fontWeight: 600, color: brand.textPrimary }}>
        {kw}
      </span>
      <span style={{ fontSize: 14, color: brand.textMuted, marginLeft: 'auto' }}>
        {detail}
      </span>
    </div>
  )
}
