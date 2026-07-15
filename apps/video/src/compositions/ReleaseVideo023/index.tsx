import { AbsoluteFill } from "remotion";
import { Audio } from "@remotion/media";
import { staticFile, interpolate, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Background } from "../../components/Background";
import { Intro } from "./Intro";
import { WatchHero } from "./WatchHero";
import { SafetyGate } from "./SafetyGate";
import { CellGridScene } from "./CellGridScene";
import { Outro } from "./Outro";
import { ensureFonts } from "../../lib/fonts";

ensureFonts();

type ReleaseVideoProps = {
  version: string;
};

const TRANSITION_DURATION = 12;
const fadeTiming = linearTiming({ durationInFrames: TRANSITION_DURATION });
const fadePresentation = fade();
const slidePresentation = slide({ direction: "from-right" });

export const ReleaseVideo023: React.FC<ReleaseVideoProps> = ({ version }) => {
  const { fps, durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill>
      <Background />
      <Audio
        src={staticFile("audio/bg-music-notebooks.mp3")}
        volume={(f) =>
          interpolate(
            f,
            [0, 1 * fps, durationInFrames - 2 * fps, durationInFrames],
            [0, 0.15, 0.15, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          )
        }
      />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={100}>
          <Intro version={version} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fadePresentation}
          timing={fadeTiming}
        />
        <TransitionSeries.Sequence durationInFrames={210}>
          <WatchHero />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slidePresentation}
          timing={fadeTiming}
        />
        <TransitionSeries.Sequence durationInFrames={150}>
          <SafetyGate />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slidePresentation}
          timing={fadeTiming}
        />
        <TransitionSeries.Sequence durationInFrames={170}>
          <CellGridScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fadePresentation}
          timing={fadeTiming}
        />
        <TransitionSeries.Sequence durationInFrames={120}>
          <Outro version={version} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
