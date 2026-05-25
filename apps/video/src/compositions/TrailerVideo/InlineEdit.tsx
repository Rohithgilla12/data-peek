import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion'
import { brand } from '../../lib/colors'
import { Undo2 } from 'lucide-react'

type Row = { id: string; email: string; plan: string; mrr: string }

const baseRows: Row[] = [
  { id: '1', email: 'alice@co.com', plan: 'pro', mrr: '$49' },
  { id: '2', email: 'bob@co.com', plan: 'free', mrr: '$0' },
  { id: '3', email: 'carol@co.com', plan: 'pro', mrr: '$99' },
  { id: '4', email: 'dan@co.com', plan: 'free', mrr: '$0' },
]

export const InlineEdit: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const containerEntrance = spring({ frame, fps, config: { damping: 200 } })
  const containerOpacity = interpolate(containerEntrance, [0, 1], [0, 1])
  const containerTranslate = interpolate(containerEntrance, [0, 1], [20, 0])

  const editStart = 40
  const editComplete = 70
  const editProgress = interpolate(frame, [editStart, editComplete], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const editingRowIndex = 1
  const newPlan = 'pro'.slice(0, Math.floor(editProgress * 3))
  const newMrr = '$49'.slice(0, Math.floor(editProgress * 3))

  const badgeEntrance = spring({
    frame: frame - 80,
    fps,
    config: { damping: 12, stiffness: 100 },
  })
  const badgeOpacity = interpolate(badgeEntrance, [0, 1], [0, 1])
  const badgeScale = interpolate(badgeEntrance, [0, 1], [0.7, 1])

  const headingEntrance = spring({
    frame: frame - 130,
    fps,
    config: { damping: 200 },
  })
  const headingOpacity = interpolate(headingEntrance, [0, 1], [0, 1])
  const headingTranslate = interpolate(headingEntrance, [0, 1], [10, 0])

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 36,
      }}
    >
      <div
        style={{
          opacity: containerOpacity,
          transform: `translateY(${containerTranslate}px)`,
          width: 820,
          backgroundColor: brand.surface,
          borderRadius: 16,
          border: `1px solid ${brand.border}`,
          overflow: 'hidden',
          boxShadow: `0 24px 60px ${brand.background}80`,
        }}
      >
        <div
          style={{
            display: 'flex',
            padding: '10px 16px',
            backgroundColor: brand.surfaceElevated,
            borderBottom: `1px solid ${brand.border}`,
          }}
        >
          {['id', 'email', 'plan', 'mrr'].map((col, i) => (
            <span
              key={col}
              style={{
                flex: i === 1 ? 2 : 1,
                fontFamily: 'Geist Mono, monospace',
                fontSize: 13,
                color: brand.textMuted,
                fontWeight: 500,
                textTransform: 'lowercase',
              }}
            >
              {col}
            </span>
          ))}
        </div>

        {baseRows.map((row, i) => {
          const isEditing = i === editingRowIndex && editProgress < 1
          const isEdited = i === editingRowIndex && editProgress >= 1
          return (
            <div
              key={row.id}
              style={{
                display: 'flex',
                padding: '14px 16px',
                borderBottom:
                  i === baseRows.length - 1 ? 'none' : `1px solid ${brand.border}`,
                backgroundColor: isEditing
                  ? `${brand.accent}08`
                  : isEdited
                  ? '#10b98108'
                  : 'transparent',
                position: 'relative',
              }}
            >
              <Cell flex={1} color={brand.textMuted}>
                {row.id}
              </Cell>
              <Cell flex={2} color={brand.textPrimary}>
                {row.email}
              </Cell>
              <Cell
                flex={1}
                color={i === editingRowIndex ? brand.accent : brand.textSecondary}
              >
                {i === editingRowIndex ? (
                  <EditableValue
                    value={editProgress >= 1 ? 'pro' : newPlan}
                    isEditing={isEditing}
                  />
                ) : (
                  row.plan
                )}
              </Cell>
              <Cell
                flex={1}
                color={
                  i === editingRowIndex && editProgress >= 1
                    ? '#10b981'
                    : brand.textSecondary
                }
              >
                {i === editingRowIndex ? (
                  <EditableValue
                    value={editProgress >= 1 ? '$49' : newMrr}
                    isEditing={isEditing}
                  />
                ) : (
                  row.mrr
                )}
              </Cell>
            </div>
          )
        })}
      </div>

      <div
        style={{
          opacity: badgeOpacity,
          transform: `scale(${badgeScale})`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 18px',
          backgroundColor: '#10b98112',
          borderRadius: 10,
          border: '1px solid #10b98140',
        }}
      >
        <Undo2 size={18} color="#10b981" strokeWidth={2} />
        <span
          style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: 16,
            color: '#10b981',
            fontWeight: 500,
          }}
        >
          Updated bob@co.com — ⌘Z to undo
        </span>
      </div>

      <div
        style={{
          opacity: headingOpacity,
          transform: `translateY(${headingTranslate}px)`,
          fontFamily: 'Geist Mono, monospace',
          fontSize: 24,
          color: brand.textSecondary,
          letterSpacing: '-0.02em',
        }}
      >
        Edit inline. Undo to revert. That's the whole flow.
      </div>
    </AbsoluteFill>
  )
}

const Cell: React.FC<{ flex: number; color: string; children: React.ReactNode }> = ({
  flex,
  color,
  children,
}) => (
  <span
    style={{
      flex,
      fontFamily: 'Geist Mono, monospace',
      fontSize: 15,
      color,
      display: 'flex',
      alignItems: 'center',
    }}
  >
    {children}
  </span>
)

const EditableValue: React.FC<{ value: string; isEditing: boolean }> = ({
  value,
  isEditing,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const cursor = Math.round(frame / (fps / 2)) % 2 === 0
  return (
    <span
      style={{
        padding: '2px 6px',
        marginLeft: -6,
        borderRadius: 4,
        backgroundColor: isEditing ? `${brand.accent}15` : 'transparent',
        border: `1px solid ${isEditing ? `${brand.accent}50` : 'transparent'}`,
      }}
    >
      {value}
      {isEditing && cursor && (
        <span style={{ color: brand.accent }}>|</span>
      )}
    </span>
  )
}
