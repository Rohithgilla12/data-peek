import { Composition } from 'remotion'
import { LaunchVideo } from './compositions/LaunchVideo'
import { ReleaseVideo } from './compositions/ReleaseVideo'
import './global.css'

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="ReleaseVideo-v0-17-0"
        component={ReleaseVideo}
        durationInFrames={492}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          version: '0.17.0',
        }}
      />
      <Composition
        id="LaunchVideo"
        component={LaunchVideo}
        durationInFrames={941}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          version: '0.16.0',
        }}
      />
    </>
  )
}
