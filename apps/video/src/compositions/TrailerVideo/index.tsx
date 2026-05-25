import { AbsoluteFill, staticFile, interpolate, useVideoConfig } from 'remotion'
import { Audio } from '@remotion/media'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { slide } from '@remotion/transitions/slide'
import { Fragment } from 'react'
import { Background } from '../../components/Background'
import { ensureFonts } from '../../lib/fonts'
import { Hook } from './Hook'
import { Reveal } from './Reveal'
import { Speed } from './Speed'
import { CommandPalette } from './CommandPalette'
import { MultiDb } from './MultiDb'
import { InlineEdit } from './InlineEdit'
import { PowerMontage } from './PowerMontage'
import { Pricing } from './Pricing'
import { Cta } from './Cta'

ensureFonts()

const TRANSITION_DURATION = 14
const fadeTiming = linearTiming({ durationInFrames: TRANSITION_DURATION })
const fadePresentation = fade()
const slideLeft = slide({ direction: 'from-right' })
const slideRight = slide({ direction: 'from-left' })

const scenes: {
  component: React.FC
  duration: number
  transition: 'fade' | 'slide-left' | 'slide-right'
}[] = [
  { component: Hook, duration: 96, transition: 'fade' },
  { component: Reveal, duration: 162, transition: 'fade' },
  { component: Speed, duration: 198, transition: 'slide-left' },
  { component: CommandPalette, duration: 198, transition: 'slide-left' },
  { component: MultiDb, duration: 198, transition: 'slide-right' },
  { component: InlineEdit, duration: 198, transition: 'slide-left' },
  { component: PowerMontage, duration: 318, transition: 'fade' },
  { component: Pricing, duration: 198, transition: 'fade' },
  { component: Cta, duration: 380, transition: 'fade' },
]

const presentationFor = (kind: 'fade' | 'slide-left' | 'slide-right') => {
  if (kind === 'slide-left') return slideLeft
  if (kind === 'slide-right') return slideRight
  return fadePresentation
}

export const TrailerVideo: React.FC = () => {
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
            [0, 0.18, 0.18, 0],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          )
        }
      />
      <TransitionSeries>
        {scenes.map((scene, i) => {
          const Scene = scene.component
          return (
            <Fragment key={i}>
              {i > 0 && (
                <TransitionSeries.Transition
                  presentation={presentationFor(scene.transition)}
                  timing={fadeTiming}
                />
              )}
              <TransitionSeries.Sequence durationInFrames={scene.duration}>
                <Scene />
              </TransitionSeries.Sequence>
            </Fragment>
          )
        })}
      </TransitionSeries>
    </AbsoluteFill>
  )
}
