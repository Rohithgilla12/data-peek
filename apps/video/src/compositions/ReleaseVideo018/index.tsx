import { AbsoluteFill } from 'remotion'
import { Audio } from '@remotion/media'
import { staticFile, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { slide } from '@remotion/transitions/slide'
import { Database, Sparkles, Tag, Image, Keyboard } from 'lucide-react'
import { Background } from '../../components/Background'
import { FixScene } from '../ReleaseVideo/FixScene'
import { Intro } from './Intro'
import { Outro } from './Outro'
import {
  PgExportIllustration,
  PokemonBuddyIllustration,
  EnvironmentTagIllustration,
  ShareCardsIllustration,
  HotkeysIllustration,
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

const features = [
  {
    icon: Database,
    title: 'PostgreSQL Export/Import',
    description:
      'Full pg_dump and pg_restore with streaming SQL parsing, cancel tokens, and SAVEPOINT recovery.',
    color: '#10b981',
    illustration: PgExportIllustration,
  },
  {
    icon: Sparkles,
    title: 'Pokemon Buddy',
    description:
      'A companion that reacts to your query habits with achievements, mood tracking, and fun analytics.',
    color: '#a855f7',
    illustration: PokemonBuddyIllustration,
  },
  {
    icon: Tag,
    title: 'Environment Tagging',
    description:
      'Tag connections as Production, Staging, or Dev. Accent strips and badge pills keep you oriented.',
    color: '#f59e0b',
    illustration: EnvironmentTagIllustration,
  },
  {
    icon: Image,
    title: 'Share Cards Overhaul',
    description:
      'ray.so-inspired gradients, IDE window chrome, line numbers, and noise texture — all in OKLCH.',
    color: '#3b82f6',
    illustration: ShareCardsIllustration,
  },
  {
    icon: Keyboard,
    title: 'TanStack Hotkeys',
    description:
      'Declarative, conflict-aware keyboard shortcuts powered by @tanstack/react-hotkeys.',
    color: '#06b6d4',
    illustration: HotkeysIllustration,
  },
]

export const ReleaseVideo018: React.FC<ReleaseVideoProps> = ({ version }) => {
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

        {features.map((feat, i) => (
          <>
            <TransitionSeries.Transition
              key={`t-${feat.title}`}
              presentation={i === 0 ? fadePresentation : slidePresentation}
              timing={fadeTiming}
            />
            <TransitionSeries.Sequence
              key={feat.title}
              durationInFrames={120}
            >
              <FixScene
                icon={feat.icon}
                title={feat.title}
                description={feat.description}
                color={feat.color}
                illustration={feat.illustration}
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
