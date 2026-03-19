import { Composition } from 'remotion'
import { LaunchVideo } from './compositions/LaunchVideo'
import './global.css'

export const RemotionRoot = () => {
  return (
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
  )
}
