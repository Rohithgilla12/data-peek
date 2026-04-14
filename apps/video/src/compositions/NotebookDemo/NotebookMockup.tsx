import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Sequence,
} from 'remotion'
import { brand } from '../../lib/colors'
import { Play, Pin, ChevronDown } from 'lucide-react'

const SQL_TEXT = `SELECT id, amount, status
FROM payments
WHERE status = 'processing'
AND updated_at < NOW() - interval '30 mins'`

const GATEWAY_SQL = `SELECT id, gateway, error_code
FROM gateway_logs
WHERE created_at > NOW() - interval '1h'`

type SyntaxToken = { text: string; color: string }

function tokenizeSql(sql: string): SyntaxToken[] {
  const keywords = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'INSERT', 'UPDATE', 'DELETE', 'JOIN', 'ON', 'AS', 'interval']
  const tableNames = ['payments', 'gateway_logs']
  const tokens: SyntaxToken[] = []

  const parts = sql.split(/(\s+|,|'[^']*'|\bNOW\(\)|\b\w+\b)/)

  for (const part of parts) {
    if (!part) continue
    const isKeyword = keywords.includes(part.toUpperCase()) || keywords.includes(part)
    const isTable = tableNames.includes(part)
    const isString = part.startsWith("'") && part.endsWith("'")
    const isFunction = /^\w+\(\)$/.test(part)
    const isOperator = ['>', '<', '=', '>=', '<=', '!=', '-'].includes(part)
    const isNumber = /^\d+$/.test(part)

    if (isKeyword) {
      tokens.push({ text: part, color: '#a855f7' })
    } else if (isTable) {
      tokens.push({ text: part, color: '#22d3ee' })
    } else if (isString) {
      tokens.push({ text: part, color: '#fbbf24' })
    } else if (isFunction) {
      tokens.push({ text: part, color: '#22d3ee' })
    } else if (isOperator) {
      tokens.push({ text: part, color: brand.textMuted })
    } else if (isNumber) {
      tokens.push({ text: part, color: '#fbbf24' })
    } else {
      tokens.push({ text: part, color: brand.textSecondary })
    }
  }

  return tokens
}

function renderSqlWithHighlighting(sql: string, visibleChars: number): React.ReactNode {
  const visibleText = sql.slice(0, visibleChars)
  const tokens = tokenizeSql(visibleText)

  return (
    <span>
      {tokens.map((token, i) => (
        <span key={i} style={{ color: token.color }}>
          {token.text}
        </span>
      ))}
    </span>
  )
}

type CellBadgeProps = {
  type: 'SQL' | 'MD'
}

const CellBadge: React.FC<CellBadgeProps> = ({ type }) => (
  <div
    style={{
      color: type === 'SQL' ? brand.accent : brand.textMuted,
      backgroundColor: type === 'SQL' ? `${brand.accent}15` : `${brand.textMuted}20`,
      fontSize: 10,
      fontWeight: 700,
      fontFamily: 'Geist Mono, monospace',
      padding: '2px 8px',
      borderRadius: 4,
      letterSpacing: '0.05em',
    }}
  >
    {type}
  </div>
)

type ResultTableProps = {
  opacity: number
  translateY: number
}

const ResultTable: React.FC<ResultTableProps> = ({ opacity, translateY }) => {
  const rows = [
    { id: 'pay_8xk2', amount: '$142.00', status: 'processing' },
    { id: 'pay_9mf4', amount: '$89.50', status: 'processing' },
    { id: 'pay_3qz7', amount: '$256.00', status: 'processing' },
  ]
  const cols = ['id', 'amount', 'status']

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        borderTop: `1px solid ${brand.border}`,
        padding: '8px 0',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          padding: '4px 16px',
          marginBottom: 4,
        }}
      >
        {cols.map((col) => (
          <div
            key={col}
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 10,
              fontWeight: 700,
              color: brand.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {col}
          </div>
        ))}
      </div>
      {rows.map((row, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            padding: '5px 16px',
            backgroundColor: i % 2 === 0 ? `${brand.surfaceElevated}80` : 'transparent',
          }}
        >
          <div
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 12,
              color: brand.textSecondary,
            }}
          >
            {row.id}
          </div>
          <div
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 12,
              color: brand.textSecondary,
            }}
          >
            {row.amount}
          </div>
          <div
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 12,
              color: '#fbbf24',
            }}
          >
            {row.status}
          </div>
        </div>
      ))}
      <div
        style={{
          padding: '4px 16px',
          fontFamily: 'Geist Mono, monospace',
          fontSize: 10,
          color: brand.textMuted,
          marginTop: 4,
        }}
      >
        3 rows · 12ms
      </div>
    </div>
  )
}

type PinBadgeProps = {
  opacity: number
  scale: number
}

const PinBadge: React.FC<PinBadgeProps> = ({ opacity, scale }) => (
  <div
    style={{
      position: 'absolute',
      top: 8,
      right: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      opacity,
      transform: `scale(${scale})`,
      backgroundColor: `${brand.accent}20`,
      border: `1px solid ${brand.accent}40`,
      borderRadius: 6,
      padding: '3px 8px',
    }}
  >
    <Pin size={10} color={brand.accent} />
    <span
      style={{
        fontFamily: 'Geist Mono, monospace',
        fontSize: 10,
        color: brand.accent,
        fontWeight: 600,
      }}
    >
      pinned
    </span>
  </div>
)

export const NotebookMockup: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const notebookEntrance = spring({ frame, fps, config: { damping: 200 } })
  const notebookOpacity = interpolate(notebookEntrance, [0, 1], [0, 1])
  const notebookY = interpolate(notebookEntrance, [0, 1], [40, 0])

  const cell1Entrance = spring({ frame: frame - 60, fps, config: { damping: 200 } })
  const cell1Opacity = interpolate(cell1Entrance, [0, 1], [0, 1])
  const cell1Y = interpolate(cell1Entrance, [0, 1], [20, 0])

  const cell2Entrance = spring({ frame: frame - 120, fps, config: { damping: 200 } })
  const cell2Opacity = interpolate(cell2Entrance, [0, 1], [0, 1])
  const cell2Y = interpolate(cell2Entrance, [0, 1], [20, 0])

  const localSqlFrame = Math.max(0, frame - 120)
  const totalSqlChars = SQL_TEXT.length
  const framesPerChar = fps / 30
  const sqlCharsVisible = Math.min(totalSqlChars, Math.floor(localSqlFrame / framesPerChar))

  const runPulseFrame = Math.max(0, frame - 200)
  const runPulse = interpolate(
    (runPulseFrame % 20) / 20,
    [0, 0.5, 1],
    [0.5, 1, 0.5]
  )
  const runVisible = frame >= 200 && frame < 240

  const resultsEntrance = spring({ frame: frame - 240, fps, config: { damping: 200 } })
  const resultsOpacity = interpolate(resultsEntrance, [0, 1], [0, 1])
  const resultsY = interpolate(resultsEntrance, [0, 1], [20, 0])

  const pinEntrance = spring({ frame: frame - 280, fps, config: { damping: 200 } })
  const pinOpacity = interpolate(pinEntrance, [0, 1], [0, 1])
  const pinScale = interpolate(pinEntrance, [0, 1], [0.5, 1])

  const pinGlowOpacity = frame >= 280 ? interpolate(frame - 280, [0, 20], [0.8, 0.3], {
    extrapolateRight: 'clamp',
  }) : 0

  const cell3Entrance = spring({ frame: frame - 300, fps, config: { damping: 200 } })
  const cell3Opacity = interpolate(cell3Entrance, [0, 1], [0, 1])
  const cell3Y = interpolate(cell3Entrance, [0, 1], [20, 0])

  const localGatewaySqlFrame = Math.max(0, frame - 300)
  const gatewayCharsVisible = Math.min(
    GATEWAY_SQL.length,
    Math.floor(localGatewaySqlFrame / framesPerChar)
  )

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 160px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 1100,
          opacity: notebookOpacity,
          transform: `translateY(${notebookY}px)`,
          backgroundColor: brand.surface,
          border: `1px solid ${brand.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: `0 0 60px ${brand.accent}10, 0 20px 60px rgba(0,0,0,0.5)`,
        }}
      >
        <div
          style={{
            backgroundColor: brand.surfaceElevated,
            borderBottom: `1px solid ${brand.border}`,
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['#ff5f57', '#ffbd2e', '#28ca41'].map((c, i) => (
                <div
                  key={i}
                  style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: c }}
                />
              ))}
            </div>
            <div
              style={{
                fontFamily: 'Geist Mono, monospace',
                fontSize: 14,
                fontWeight: 600,
                color: brand.textPrimary,
              }}
            >
              Debug Payment Failures
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              backgroundColor: `${brand.accent}15`,
              border: `1px solid ${brand.accent}30`,
              borderRadius: 6,
              padding: '4px 10px',
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#22c55e',
              }}
            />
            <span
              style={{
                fontFamily: 'Geist Mono, monospace',
                fontSize: 11,
                color: brand.accent,
                fontWeight: 500,
              }}
            >
              payments-db
            </span>
          </div>
        </div>

        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Sequence from={60} layout="none">
            <div
              style={{
                opacity: cell1Opacity,
                transform: `translateY(${cell1Y}px)`,
                backgroundColor: brand.surface,
                border: `1px solid ${brand.border}`,
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  backgroundColor: brand.surfaceElevated,
                  borderBottom: `1px solid ${brand.border}`,
                  padding: '5px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <CellBadge type="MD" />
              </div>
              <div style={{ padding: '10px 16px' }}>
                <span
                  style={{
                    fontFamily: 'Geist Mono, monospace',
                    fontSize: 16,
                    fontWeight: 700,
                    color: brand.textPrimary,
                  }}
                >
                  ## Step 1: Check stuck payments
                </span>
              </div>
            </div>
          </Sequence>

          <Sequence from={120} layout="none">
            <div
              style={{
                opacity: cell2Opacity,
                transform: `translateY(${cell2Y}px)`,
                backgroundColor: brand.surface,
                border: `2px solid ${brand.accent}60`,
                borderRadius: 8,
                overflow: 'hidden',
                position: 'relative',
                boxShadow: `0 0 20px ${brand.accent}15`,
              }}
            >
              {frame >= 280 && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 8,
                    boxShadow: `inset 0 0 20px ${brand.accent}${Math.floor(pinGlowOpacity * 30).toString(16).padStart(2, '0')}`,
                    pointerEvents: 'none',
                  }}
                />
              )}

              <div
                style={{
                  backgroundColor: brand.surfaceElevated,
                  borderBottom: `1px solid ${brand.border}`,
                  padding: '5px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CellBadge type="SQL" />
                  {runVisible && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        opacity: runPulse,
                      }}
                    >
                      <Play size={10} color={brand.accent} fill={brand.accent} />
                      <span
                        style={{
                          fontFamily: 'Geist Mono, monospace',
                          fontSize: 10,
                          color: brand.accent,
                        }}
                      >
                        running...
                      </span>
                    </div>
                  )}
                </div>
                {frame >= 240 && (
                  <span
                    style={{
                      fontFamily: 'Geist Mono, monospace',
                      fontSize: 10,
                      color: brand.textMuted,
                    }}
                  >
                    3 rows · 12ms
                  </span>
                )}
              </div>

              <div style={{ padding: '12px 16px', position: 'relative' }}>
                <pre
                  style={{
                    fontFamily: 'Geist Mono, monospace',
                    fontSize: 13,
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {renderSqlWithHighlighting(SQL_TEXT, sqlCharsVisible)}
                  {sqlCharsVisible < SQL_TEXT.length && (
                    <span style={{ opacity: Math.round(frame / 8) % 2 === 0 ? 1 : 0, color: brand.accent }}>
                      |
                    </span>
                  )}
                </pre>

                {frame >= 280 && (
                  <PinBadge opacity={pinOpacity} scale={pinScale} />
                )}
              </div>

              {frame >= 240 && (
                <ResultTable opacity={resultsOpacity} translateY={resultsY} />
              )}
            </div>
          </Sequence>

          <Sequence from={300} layout="none">
            <div
              style={{
                opacity: cell3Opacity,
                transform: `translateY(${cell3Y}px)`,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                style={{
                  backgroundColor: brand.surface,
                  border: `1px solid ${brand.border}`,
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    backgroundColor: brand.surfaceElevated,
                    borderBottom: `1px solid ${brand.border}`,
                    padding: '5px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <CellBadge type="MD" />
                </div>
                <div style={{ padding: '10px 16px' }}>
                  <span
                    style={{
                      fontFamily: 'Geist Mono, monospace',
                      fontSize: 16,
                      fontWeight: 700,
                      color: brand.textPrimary,
                    }}
                  >
                    ## Step 2: Check gateway logs
                  </span>
                </div>
              </div>

              {frame >= 330 && (
                <div
                  style={{
                    backgroundColor: brand.surface,
                    border: `1px solid ${brand.border}`,
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      backgroundColor: brand.surfaceElevated,
                      borderBottom: `1px solid ${brand.border}`,
                      padding: '5px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <CellBadge type="SQL" />
                  </div>
                  <div style={{ padding: '12px 16px' }}>
                    <pre
                      style={{
                        fontFamily: 'Geist Mono, monospace',
                        fontSize: 13,
                        lineHeight: 1.6,
                        margin: 0,
                      }}
                    >
                      {renderSqlWithHighlighting(GATEWAY_SQL, gatewayCharsVisible)}
                      {gatewayCharsVisible < GATEWAY_SQL.length && (
                        <span
                          style={{
                            opacity: Math.round(frame / 8) % 2 === 0 ? 1 : 0,
                            color: brand.accent,
                          }}
                        >
                          |
                        </span>
                      )}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </Sequence>
        </div>

        <div
          style={{
            borderTop: `1px solid ${brand.border}`,
            padding: '6px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: brand.surfaceElevated,
          }}
        >
          <ChevronDown size={12} color={brand.textMuted} />
          <span
            style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: 11,
              color: brand.textMuted,
            }}
          >
            + Add cell
          </span>
        </div>
      </div>
    </AbsoluteFill>
  )
}