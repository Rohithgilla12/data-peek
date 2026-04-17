import { Composition } from 'remotion'
import { LaunchVideo } from './compositions/LaunchVideo'
import { ReleaseVideo } from './compositions/ReleaseVideo'
import { ReleaseVideo018 } from './compositions/ReleaseVideo018'
import { ReleaseVideo019 } from './compositions/ReleaseVideo019'
import { ReleaseVideo020 } from './compositions/ReleaseVideo020'
import { NotebookDemo } from './compositions/NotebookDemo'
import './global.css'

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="NotebookDemo"
        component={NotebookDemo}
        durationInFrames={1350}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="ReleaseVideo-v0-20-0"
        component={ReleaseVideo020}
        durationInFrames={728}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ version: '0.20.0' }}
      />
      <Composition
        id="ReleaseVideo-v0-19-0"
        component={ReleaseVideo019}
        durationInFrames={728}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          version: '0.19.0',
        }}
      />
      <Composition
        id="ReleaseVideo-v0-18-0"
        component={ReleaseVideo018}
        durationInFrames={708}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          version: '0.18.0',
        }}
      />
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
