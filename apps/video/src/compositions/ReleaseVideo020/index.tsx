import { AbsoluteFill } from 'remotion'
import { Audio } from '@remotion/media'
import { staticFile, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { slide } from '@remotion/transitions/slide'
import { BookOpen, Pin, Keyboard, Share2 } from 'lucide-react'
import { Background } from '../../components/Background'
import { FixScene } from '../ReleaseVideo/FixScene'
import { Intro } from './Intro'
import { Outro } from './Outro'
import {
  NotebookCellsIllustration,
  PinnedResultsIllustration,
  KeyboardNavIllustration,
  ExportShareIllustration,
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
    icon: BookOpen,
    title: 'SQL Notebooks',
    description:
      'Mix executable SQL cells with Markdown documentation. Jupyter-style, wired to your database.',
    color: '#6b8cf5',
    illustration: NotebookCellsIllustration,
  },
  {
    icon: Pin,
    title: 'Pin Results',
    description:
      "Pin query output so it persists across sessions. Your runbook shows what 'normal' looks like.",
    color: '#f59e0b',
    illustration: PinnedResultsIllustration,
  },
  {
    icon: Keyboard,
    title: 'Keyboard-First',
    description:
      'Shift+Enter to run and advance. Cmd+J/K to navigate. Jupyter muscle memory.',
    color: '#a855f7',
    illustration: KeyboardNavIllustration,
  },
  {
    icon: Share2,
    title: 'Export & Share',
    description:
      'Export as .dpnb (reimportable) or Markdown (readable anywhere). Same runbook, any connection.',
    color: '#10b981',
    illustration: ExportShareIllustration,
  },
]

export const ReleaseVideo020: React.FC<ReleaseVideoProps> = ({ version }) => {
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
        <TransitionSeries.Sequence durationInFrames={100}>
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
        <TransitionSeries.Sequence durationInFrames={100}>
          <Outro version={version} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  )
}
