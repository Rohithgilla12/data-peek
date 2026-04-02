import { AbsoluteFill } from 'remotion'
import { Audio } from '@remotion/media'
import { staticFile, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { slide } from '@remotion/transitions/slide'
import { Shield, Quote, Bug, Wrench } from 'lucide-react'
import { Background } from '../../components/Background'
import { Intro } from './Intro'
import { FixScene } from './FixScene'
import { Outro } from './Outro'
import {
  IdentifierQuotingIllustration,
  EnumParsingIllustration,
  StabilityIllustration,
} from './illustrations'
import { ensureFonts } from '../../lib/fonts'

ensureFonts()

type ReleaseVideoProps = {
  version: string
}

const TRANSITION_DURATION = 12
const fadeTiming = linearTiming({ durationInFrames: TRANSITION_DURATION })
const fadePresentation = fade()
const slidePresentation = slide({ direction: 'from-right' })

const fixes = [
  {
    icon: Quote,
    title: 'Identifier Quoting',
    description:
      'Case-sensitive table names now work across PostgreSQL, MySQL, and MSSQL. Proper quoting everywhere.',
    color: '#3b82f6',
    illustration: IdentifierQuotingIllustration,
  },
  {
    icon: Bug,
    title: 'Enum Array Parsing',
    description:
      'Fixed pg driver returning raw strings for enum arrays. Added error boundaries for resilience.',
    color: '#8b5cf6',
    illustration: EnumParsingIllustration,
  },
  {
    icon: Shield,
    title: 'Stability Fixes',
    description:
      'Node crypto.randomUUID fix, brew install command, and image optimization across the board.',
    color: '#10b981',
    illustration: StabilityIllustration,
  },
]

export const ReleaseVideo: React.FC<ReleaseVideoProps> = ({ version }) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  return (
    <AbsoluteFill>
      <Background />
      <Audio
        src={staticFile('audio/bg-music.mp3')}
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
          <Intro version={version} />
        </TransitionSeries.Sequence>

        {fixes.map((fix, i) => (
          <>
            <TransitionSeries.Transition
              key={`t-${fix.title}`}
              presentation={i === 0 ? fadePresentation : slidePresentation}
              timing={fadeTiming}
            />
            <TransitionSeries.Sequence
              key={fix.title}
              durationInFrames={120}
            >
              <FixScene
                icon={fix.icon}
                title={fix.title}
                description={fix.description}
                color={fix.color}
                illustration={fix.illustration}
              />
            </TransitionSeries.Sequence>
          </>
        ))}

        <TransitionSeries.Transition
          presentation={fadePresentation}
          timing={fadeTiming}
        />
        <TransitionSeries.Sequence durationInFrames={90}>
          <Outro version={version} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  )
}
