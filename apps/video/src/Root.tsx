import { Composition } from 'remotion'
import { LaunchVideo } from './compositions/LaunchVideo'
import { ReleaseVideo } from './compositions/ReleaseVideo'
import { ReleaseVideo018 } from './compositions/ReleaseVideo018'
import { ReleaseVideo019 } from './compositions/ReleaseVideo019'
import { ReleaseVideo020 } from './compositions/ReleaseVideo020'
import { ReleaseVideo022 } from './compositions/ReleaseVideo022'
import { ReleaseVideo023 } from './compositions/ReleaseVideo023'
import { ReleaseVideo024 } from './compositions/ReleaseVideo024'
import { ReleaseVideo025 } from './compositions/ReleaseVideo025'
import { NotebookDemo } from './compositions/NotebookDemo'
import { TrailerVideo } from './compositions/TrailerVideo'
import './global.css'

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="TrailerVideo"
        component={TrailerVideo}
        durationInFrames={1900}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
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
        id="ReleaseVideo-v0-25-0"
        component={ReleaseVideo025}
        durationInFrames={620}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ version: '0.25.0' }}
      />
      <Composition
        id="ReleaseVideo-v0-24-0"
        component={ReleaseVideo024}
        durationInFrames={620}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ version: '0.24.0' }}
      />
      <Composition
        id="ReleaseVideo-v0-23-0"
        component={ReleaseVideo023}
        durationInFrames={762}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ version: '0.23.0' }}
      />
      <Composition
        id="ReleaseVideo-v0-22-0"
        component={ReleaseVideo022}
        durationInFrames={728}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ version: '0.22.0' }}
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
