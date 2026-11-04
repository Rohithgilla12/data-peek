import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

type Oklch = { l: number; c: number; h: number }

const css = readFileSync(path.resolve(__dirname, '../assets/global.css'), 'utf8')

function blockBody(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`Block not found: ${selector}`)
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}') depth--
    if (depth === 0) return css.slice(open + 1, i)
  }
  throw new Error(`Unterminated block: ${selector}`)
}

function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    out[match[1]] = match[2].trim().replace(/\s+/g, ' ')
  }
  return out
}

const themes = { light: declarations(blockBody(':root')), dark: declarations(blockBody('.dark')) }
const themeInline = declarations(blockBody('@theme inline'))

function parseOklch(value: string): Oklch {
  const match = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/)
  if (!match) throw new Error(`Not a plain oklch value: ${value}`)
  return { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) }
}

function toLinearSrgb({ l, c, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180
  const a = c * Math.cos(hr)
  const b = c * Math.sin(hr)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const rgb: [number, number, number] = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_
  ]
  return rgb.map((v) => Math.min(1, Math.max(0, v))) as [number, number, number]
}

function luminance(color: Oklch): number {
  const [r, g, b] = toLinearSrgb(color)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(a: Oklch, b: Oklch): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const catNames = ['blue', 'cyan', 'green', 'yellow', 'orange', 'purple', 'pink', 'teal'].map(
  (n) => `cat-${n}`
)
const tokenNames = ['success', 'success-foreground', 'warning', 'warning-foreground', ...catNames]
const themeNames = ['light', 'dark'] as const

describe('theme tokens', () => {
  it('declares every status and categorical token in both themes', () => {
    for (const theme of themeNames) {
      for (const name of tokenNames) {
        expect(themes[theme][`--${name}`], `${theme} --${name}`).toBeDefined()
      }
    }
  })

  it('exposes each token as a Tailwind colour', () => {
    for (const name of tokenNames) {
      expect(themeInline[`--color-${name}`], name).toBe(`var(--${name})`)
    }
  })

  it('points chart-1..5 at cat blue, cyan, green, yellow, orange', () => {
    const targets = ['blue', 'cyan', 'green', 'yellow', 'orange']
    for (const theme of themeNames) {
      targets.forEach((target, i) => {
        expect(themes[theme][`--chart-${i + 1}`], `${theme} --chart-${i + 1}`).toBe(
          `var(--cat-${target})`
        )
      })
    }
  })

  const contrastCases = themeNames.flatMap((theme) =>
    ['success', 'warning', 'destructive', ...catNames].map((name) => [theme, name] as const)
  )

  it.each(contrastCases)('%s %s reaches 4.5:1 on background and card', (theme, name) => {
    const fg = parseOklch(themes[theme][`--${name}`])
    for (const surface of ['background', 'card']) {
      const bg = parseOklch(themes[theme][`--${surface}`])
      expect(contrastRatio(fg, bg), `${theme} --${name} on --${surface}`).toBeGreaterThanOrEqual(
        4.5
      )
    }
  })

  it('defines the type scale', () => {
    expect(themeInline['--text-2xs']).toBe('0.6875rem')
    expect(themeInline['--text-2xs--line-height']).toBe('1rem')
    expect(themeInline['--text-xs']).toBe('0.75rem')
    expect(themeInline['--text-xs--line-height']).toBe('1rem')
    expect(themeInline['--text-sm']).toBe('0.8125rem')
    expect(themeInline['--text-sm--line-height']).toBe('1.25rem')
    expect(themeInline['--text-base']).toBe('0.875rem')
    expect(themeInline['--text-base--line-height']).toBe('1.375rem')
    expect(themeInline['--text-lg']).toBe('1rem')
    expect(themeInline['--text-lg--line-height']).toBe('1.5rem')
  })
})
