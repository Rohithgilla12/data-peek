import { AbsoluteFill } from 'remotion'
import { Audio } from '@remotion/media'
import { staticFile, interpolate, useVideoConfig } from 'remotion'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { slide } from '@remotion/transitions/slide'
import { Background } from '../../components/Background'
import { Intro } from './Intro'
import { TimelineScene } from './TimelineScene'
import { DiffScene } from './DiffScene'
import { Outro } from './Outro'
import { ensureFonts } from '../../lib/fonts'

ensureFonts()

type ReleaseVideoProps = {
  version: string
}

const TRANSITION_DURATION = 12
const fadeTiming = linearTiming({ durationInFrames: TRANSITION_DURATION })
const fadePresentation = fade()
const slidePresentation = slide({ direction: 'from-right' })

export const ReleaseVideo025: React.FC<ReleaseVideoProps> = ({ version }) => {
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
        <TransitionSeries.Sequence durationInFrames={95}>
          <Intro version={version} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={fadePresentation} timing={fadeTiming} />
        <TransitionSeries.Sequence durationInFrames={225}>
          <TimelineScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={slidePresentation} timing={fadeTiming} />
        <TransitionSeries.Sequence durationInFrames={175}>
          <DiffScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={fadePresentation} timing={fadeTiming} />
        <TransitionSeries.Sequence durationInFrames={125}>
          <Outro version={version} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  )
}
