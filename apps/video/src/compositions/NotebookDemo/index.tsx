import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  staticFile,
  spring,
} from 'remotion'
import { Audio } from '@remotion/media'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { slide } from '@remotion/transitions/slide'
import { Background } from '../../components/Background'
import { CyanGlow } from '../../components/CyanGlow'
import { brand } from '../../lib/colors'
import { ensureFonts } from '../../lib/fonts'
import { TitleScene } from './TitleScene'
import { NotebookMockup } from './NotebookMockup'
import { KeyboardScene } from './KeyboardScene'
import { ExportScene } from './ExportScene'
import { EndScene } from './EndScene'

ensureFonts()

const TRANSITION_DURATION = 15
const fadeTiming = linearTiming({ durationInFrames: TRANSITION_DURATION })
const fadePresentation = fade()
const slidePresentation = slide({ direction: 'from-right' })

const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const headerEntrance = spring({ frame, fps, config: { damping: 200 } })
  const headerOpacity = interpolate(headerEntrance, [0, 1], [0, 1])
  const headerY = interpolate(headerEntrance, [0, 1], [30, 0])

  const leftEntrance = spring({ frame: frame - 20, fps, config: { damping: 200 } })
  const leftOpacity = interpolate(leftEntrance, [0, 1], [0, 1])
  const leftY = interpolate(leftEntrance, [0, 1], [30, 0])

  const rightEntrance = spring({ frame: frame - 35, fps, config: { damping: 200 } })
  const rightOpacity = interpolate(rightEntrance, [0, 1], [0, 1])
  const rightY = interpolate(rightEntrance, [0, 1], [30, 0])

  const crossOpacity = interpolate(frame, [60, 75], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const solutionEntrance = spring({ frame: frame - 80, fps, config: { damping: 200 } })
  const solutionOpacity = interpolate(solutionEntrance, [0, 1], [0, 1])
  const solutionY = interpolate(solutionEntrance, [0, 1], [20, 0])

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 36,
        padding: '0 100px',
      }}
    >
      <CyanGlow size={400} x="50%" y="50%" delay={0} />

      <div
        style={{
          opacity: headerOpacity,
          transform: `translateY(${headerY}px)`,
          fontFamily: 'Geist Mono, monospace',
          fontSize: 28,
          color: brand.textMuted,
          letterSpacing: '-0.01em',
        }}
      >
        Documentation here. Queries there.
      </div>

      <div style={{ display: 'flex', gap: 32, alignItems: 'stretch' }}>
        <div
          style={{
            opacity: leftOpacity,
            transform: `translateY(${leftY}px)`,
            position: 'relative',
            flex: 1,
          }}
        >
          <div
            style={{
              backgroundColor: brand.surface,
              border: `1px solid ${brand.border}`,
              borderRadius: 12,
              overflow: 'hidden',
              height: '100%',
            }}
          >
            <div
              style={{
                backgroundColor: brand.surfaceElevated,
                borderBottom: `1px solid ${brand.border}`,
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  backgroundColor: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              />
              <span
                style={{
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 12,
                  color: brand.textMuted,
                }}
              >
                Notion
              </span>
            </div>
            <div style={{ padding: '20px 20px' }}>
              <div
                style={{
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 16,
                  fontWeight: 700,
                  color: brand.textPrimary,
                  marginBottom: 12,
                }}
              >
                Step 1: Check stuck payments
              </div>
              <div
                style={{
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 13,
                  color: brand.textSecondary,
                  marginBottom: 14,
                  lineHeight: 1.5,
                }}
              >
                Run this query on the payments DB to find any processing orders stuck for {'>'}30 mins:
              </div>
              <div
                style={{
                  backgroundColor: brand.background,
                  border: `1px solid ${brand.border}`,
                  borderRadius: 6,
                  padding: '12px 14px',
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 12,
                  color: brand.textSecondary,
                  lineHeight: 1.6,
                }}
              >
                <div>SELECT id, amount, status</div>
                <div>FROM payments</div>
                <div>WHERE status = 'processing'</div>
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 12,
                  color: brand.textMuted,
                  fontStyle: 'italic',
                }}
              >
                (copy this and run it in your SQL client)
              </div>
            </div>
          </div>

          {frame >= 60 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                opacity: crossOpacity,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                backgroundColor: `${brand.background}80`,
              }}
            >
              <div
                style={{
                  fontSize: 72,
                  color: '#ef4444',
                  fontWeight: 700,
                  textShadow: '0 0 20px #ef444460',
                }}
              >
                ✕
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            opacity: rightOpacity,
            transform: `translateY(${rightY}px)`,
            position: 'relative',
            flex: 1,
          }}
        >
          <div
            style={{
              backgroundColor: brand.surface,
              border: `1px solid ${brand.border}`,
              borderRadius: 12,
              overflow: 'hidden',
              height: '100%',
            }}
          >
            <div
              style={{
                backgroundColor: brand.surfaceElevated,
                borderBottom: `1px solid ${brand.border}`,
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div
                style={{
                  backgroundColor: `${brand.accent}20`,
                  border: `1px solid ${brand.accent}40`,
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 11,
                  fontWeight: 700,
                  color: brand.accent,
                }}
              >
                data-peek
              </div>
              <span
                style={{
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 12,
                  color: brand.textMuted,
                }}
              >
                query_tab_1.sql
              </span>
            </div>
            <div style={{ padding: '20px' }}>
              <div
                style={{
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: brand.textSecondary,
                }}
              >
                <span style={{ color: '#a855f7' }}>SELECT</span>
                {' id, amount, status\n'}
                <span style={{ color: '#a855f7' }}>FROM</span>
                {' '}
                <span style={{ color: '#22d3ee' }}>payments</span>
                {'\n'}
                <span style={{ color: '#a855f7' }}>WHERE</span>
                {" status = "}
                <span style={{ color: '#fbbf24' }}>'processing'</span>
              </div>
              <div
                style={{
                  marginTop: 16,
                  padding: '8px',
                  backgroundColor: brand.background,
                  border: `1px solid ${brand.border}`,
                  borderRadius: 6,
                }}
              >
                <div
                  style={{
                    fontFamily: 'Geist Mono, monospace',
                    fontSize: 11,
                    color: brand.textMuted,
                    marginBottom: 4,
                  }}
                >
                  Results
                </div>
                <div
                  style={{
                    fontFamily: 'Geist Mono, monospace',
                    fontSize: 12,
                    color: brand.textSecondary,
                  }}
                >
                  3 rows returned
                </div>
              </div>
              <div
                style={{
                  marginTop: 12,
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: 12,
                  color: brand.textMuted,
                  fontStyle: 'italic',
                }}
              >
                (where's the context though?)
              </div>
            </div>
          </div>

          {frame >= 60 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                opacity: crossOpacity,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                backgroundColor: `${brand.background}80`,
              }}
            >
              <div
                style={{
                  fontSize: 72,
                  color: '#ef4444',
                  fontWeight: 700,
                  textShadow: '0 0 20px #ef444460',
                }}
              >
                ✕
              </div>
            </div>
          )}
        </div>
      </div>

      {frame >= 80 && (
        <div
          style={{
            opacity: solutionOpacity,
            transform: `translateY(${solutionY}px)`,
            fontFamily: 'Geist Mono, monospace',
            fontSize: 32,
            fontWeight: 700,
            color: brand.textPrimary,
            letterSpacing: '-0.03em',
            textAlign: 'center',
          }}
        >
          What if they were the{' '}
          <span style={{ color: brand.accent }}>same thing?</span>
        </div>
      )}
    </AbsoluteFill>
  )
}

export const NotebookDemo: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  return (
    <AbsoluteFill>
      <Background />
      <Audio
        src={staticFile('audio/bg-music-notebooks.mp3')}
        volume={(f) =>
          interpolate(
            f,
            [0, 1 * fps, durationInFrames - 2 * fps, durationInFrames],
            [0, 0.15, 0.15, 0],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          )
        }
      />

      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={90}>
          <TitleScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fadePresentation}
          timing={fadeTiming}
        />
        <TransitionSeries.Sequence durationInFrames={120}>
          <ProblemScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slidePresentation}
          timing={fadeTiming}
        />
        <TransitionSeries.Sequence durationInFrames={360}>
          <NotebookMockup />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slidePresentation}
          timing={fadeTiming}
        />
        <TransitionSeries.Sequence durationInFrames={180}>
          <KeyboardScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fadePresentation}
          timing={fadeTiming}
        />
        <TransitionSeries.Sequence durationInFrames={120}>
          <ExportScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fadePresentation}
          timing={fadeTiming}
        />
        <TransitionSeries.Sequence durationInFrames={120}>
          <EndScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  )
}
