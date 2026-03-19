import { staticFile } from 'remotion'
import { loadFont } from '@remotion/fonts'

let fontsLoaded = false

export async function ensureFonts() {
  if (fontsLoaded) return
  await Promise.all([
    loadFont({
      family: 'Geist Mono',
      url: staticFile('fonts/GeistMono-Regular.woff2'),
      weight: '400',
    }),
    loadFont({
      family: 'Geist Mono',
      url: staticFile('fonts/GeistMono-Medium.woff2'),
      weight: '500',
    }),
    loadFont({
      family: 'Geist Mono',
      url: staticFile('fonts/GeistMono-Bold.woff2'),
      weight: '700',
    }),
    loadFont({
      family: 'Geist',
      url: staticFile('fonts/Geist-Regular.woff2'),
      weight: '400',
    }),
    loadFont({
      family: 'Geist',
      url: staticFile('fonts/Geist-Medium.woff2'),
      weight: '500',
    }),
    loadFont({
      family: 'Geist',
      url: staticFile('fonts/Geist-Bold.woff2'),
      weight: '700',
    }),
  ])
  fontsLoaded = true
}
