import { AbsoluteFill } from 'remotion'
import { Audio } from '@remotion/media'
import { staticFile, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { slide } from '@remotion/transitions/slide'
import { Globe, TableProperties, Filter, HardDrive, Package } from 'lucide-react'
import { Background } from '../../components/Background'
import { FixScene } from '../ReleaseVideo/FixScene'
import { Intro } from './Intro'
import { Outro } from './Outro'
import {
  WebAppIllustration,
  TableEditorIllustration,
  SmartFilterIllustration,
  LocalFirstIllustration,
  SharedUiIllustration,
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
    icon: Globe,
    title: 'Web SQL Client',
    description:
      'Full SQL client in your browser at app.datapeek.dev. Clerk auth, tRPC API, encrypted connections.',
    color: '#6b8cf5',
    illustration: WebAppIllustration,
  },
  {
    icon: TableProperties,
    title: 'Table Editor UX',
    description:
      'Inline editing, FK icons in schema explorer, boolean display, search, and polished empty states.',
    color: '#3b82f6',
    illustration: TableEditorIllustration,
  },
  {
    icon: Filter,
    title: 'Smart Filter Bar',
    description:
      'Type-aware operators that adapt to your column types. One-click WHERE clause copy.',
    color: '#f59e0b',
    illustration: SmartFilterIllustration,
  },
  {
    icon: HardDrive,
    title: 'Local-First Storage',
    description:
      'Dexie.js-powered IndexedDB with background sync to Postgres. Instant, offline-ready.',
    color: '#a855f7',
    illustration: LocalFirstIllustration,
  },
  {
    icon: Package,
    title: 'Shared UI Package',
    description:
      '@data-peek/ui — one component library powering both desktop and web apps.',
    color: '#10b981',
    illustration: SharedUiIllustration,
  },
]

export const ReleaseVideo019: React.FC<ReleaseVideoProps> = ({ version }) => {
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
