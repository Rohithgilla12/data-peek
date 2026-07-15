import { AbsoluteFill } from "remotion";
import { Audio } from "@remotion/media";
import {
  staticFile,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { ShieldCheck, Activity, DatabaseZap, TestTube2 } from "lucide-react";
import { Fragment } from "react";
import { Background } from "../../components/Background";
import { FixScene } from "../ReleaseVideo/FixScene";
import { Intro } from "./Intro";
import { Outro } from "./Outro";
import {
  PrimaryKeyEditIllustration,
  LifecycleCASIllustration,
  SchemaCacheInvalidationIllustration,
  E2EFortressIllustration,
} from "./illustrations";
import { ensureFonts } from "../../lib/fonts";

ensureFonts();

type ReleaseVideoProps = {
  version: string;
};

const TRANSITION_DURATION = 12;
const fadeTiming = linearTiming({ durationInFrames: TRANSITION_DURATION });
const fadePresentation = fade();
const slidePresentation = slide({ direction: "from-right" });

const features = [
  {
    icon: ShieldCheck,
    title: "Silent corruption, gone.",
    description:
      "Inline edits are keyed by primary key, not display index. Sort, paginate, switch tabs — your keystroke lands on the row you picked.",
    color: "#6b8cf5",
    illustration: PrimaryKeyEditIllustration,
  },
  {
    icon: Activity,
    title: "Lifecycle hardening.",
    description:
      "Late responses can't overwrite newer queries. Closing a tab cancels its in-flight query. Pinned tabs survive untouched.",
    color: "#f59e0b",
    illustration: LifecycleCASIllustration,
  },
  {
    icon: DatabaseZap,
    title: "Schema cache, made honest.",
    description:
      "DDL invalidates the cache. Concurrent fetches coalesce. A generation token blocks stale writes from repopulating after an invalidate.",
    color: "#a855f7",
    illustration: SchemaCacheInvalidationIllustration,
  },
  {
    icon: TestTube2,
    title: "From 4 tests to 25.",
    description:
      "Playwright drives Monaco, exercises the full IPC loop against a real Postgres. Every audit fix pinned by a regression spec.",
    color: "#10b981",
    illustration: E2EFortressIllustration,
  },
];

export const ReleaseVideo022: React.FC<ReleaseVideoProps> = ({ version }) => {
  const frame = useCurrentFrame();
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

        {features.map((feat, i) => (
          <Fragment key={feat.title}>
            <TransitionSeries.Transition
              presentation={i === 0 ? fadePresentation : slidePresentation}
              timing={fadeTiming}
            />
            <TransitionSeries.Sequence durationInFrames={120}>
              <FixScene
                icon={feat.icon}
                title={feat.title}
                description={feat.description}
                color={feat.color}
                illustration={feat.illustration}
              />
            </TransitionSeries.Sequence>
          </Fragment>
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
  );
};
