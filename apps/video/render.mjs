import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const compositionId = process.argv[2] || 'LaunchVideo'
const codec = process.argv[3] || 'h264'

console.log(`Bundling...`)
const bundled = await bundle({
  entryPoint: path.resolve(__dirname, './src/index.ts'),
  webpackOverride: (config) => config,
})

console.log(`Selecting composition "${compositionId}"...`)
const composition = await selectComposition({
  serveUrl: bundled,
  id: compositionId,
})

const outputLocation = path.resolve(
  __dirname,
  `out/${compositionId}.mp4`
)

console.log(`Rendering ${composition.width}x${composition.height} @ ${composition.fps}fps...`)
await renderMedia({
  composition,
  serveUrl: bundled,
  codec,
  outputLocation,
  onProgress: ({ progress }) => {
    if (Math.round(progress * 100) % 10 === 0) {
      process.stdout.write(`\r  ${Math.round(progress * 100)}%`)
    }
  },
})

console.log(`\nDone! Output: ${outputLocation}`)
