import { AbsoluteFill } from 'remotion'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import {
  BarChart3,
  EyeOff,
  FileUp,
  FlaskConical,
  Bell,
  Activity,
} from 'lucide-react'
import { Background } from '../../components/Background'
import { Intro } from './Intro'
import { FeatureScene } from './FeatureScene'
import { Outro } from './Outro'
import {
  ColumnStatsIllustration,
  DataMaskingIllustration,
  CsvImportIllustration,
  DataGeneratorIllustration,
  PgNotificationsIllustration,
  HealthMonitorIllustration,
} from './illustrations'
import { ensureFonts } from '../../lib/fonts'

ensureFonts()

type LaunchVideoProps = {
  version: string
}

const TRANSITION_DURATION = 9
const fadeTiming = linearTiming({ durationInFrames: TRANSITION_DURATION })
const fadePresentation = fade()

const features = [
  {
    icon: BarChart3,
    title: 'Column Statistics',
    description:
      'One-click data profiling. Min, max, avg, histograms, and top values per column.',
    color: '#06b6d4',
    illustration: ColumnStatsIllustration,
  },
  {
    icon: EyeOff,
    title: 'Data Masking',
    description:
      'Blur sensitive columns for demos. Auto-mask with regex patterns.',
    color: '#f59e0b',
    illustration: DataMaskingIllustration,
  },
  {
    icon: FileUp,
    title: 'CSV Import',
    description:
      'Import with auto column mapping, type inference, and conflict handling.',
    color: '#10b981',
    illustration: CsvImportIllustration,
  },
  {
    icon: FlaskConical,
    title: 'Data Generator',
    description:
      'Generate realistic fake data with Faker.js. FK-aware, up to 100k rows.',
    color: '#8b5cf6',
    illustration: DataGeneratorIllustration,
  },
  {
    icon: Bell,
    title: 'PG Notifications',
    description:
      'Subscribe to LISTEN/NOTIFY channels with real-time event log.',
    color: '#3b82f6',
    illustration: PgNotificationsIllustration,
  },
  {
    icon: Activity,
    title: 'Health Monitor',
    description:
      'Active queries, table sizes, cache hit ratios, and lock detection.',
    color: '#ef4444',
    illustration: HealthMonitorIllustration,
  },
]

export const LaunchVideo: React.FC<LaunchVideoProps> = ({ version }) => {
  return (
    <AbsoluteFill>
      <Background />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={120}>
          <Intro version={version} />
        </TransitionSeries.Sequence>

        {features.map((feature) => (
          <>
            <TransitionSeries.Transition
              key={`t-${feature.title}`}
              presentation={fadePresentation}
              timing={fadeTiming}
            />
            <TransitionSeries.Sequence
              key={feature.title}
              durationInFrames={108}
            >
              <FeatureScene
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                color={feature.color}
                illustration={feature.illustration}
              />
            </TransitionSeries.Sequence>
          </>
        ))}

        <TransitionSeries.Transition
          presentation={fadePresentation}
          timing={fadeTiming}
        />
        <TransitionSeries.Sequence durationInFrames={110}>
          <Outro version={version} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  )
}
