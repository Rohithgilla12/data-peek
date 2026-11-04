import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

type Violation = { file: string; line: number; match: string }

const repoRoot = path.resolve(__dirname, '../../../../../..')
const uiSrc = path.join(repoRoot, 'packages/ui/src')
const rendererSrc = path.join(repoRoot, 'apps/desktop/src/renderer/src')

function listSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) files.push(...listSourceFiles(full))
    else if (/\.tsx?$/.test(entry)) files.push(full)
  }
  return files
}

/**
 * Finds every line under `roots` that matches `pattern`. `allow` holds paths relative to each
 * root that are permitted to match. Reported files are relative to the repo root.
 */
function scanSource(roots: string[], pattern: RegExp, allow: string[]): Violation[] {
  const violations: Violation[] = []
  for (const root of roots) {
    for (const file of listSourceFiles(root)) {
      if (allow.includes(path.relative(root, file).split(path.sep).join('/'))) continue
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((text, index) => {
          const match = pattern.exec(text)
          if (match) {
            violations.push({
              file: path.relative(repoRoot, file).split(path.sep).join('/'),
              line: index + 1,
              match: match[0]
            })
          }
        })
    }
  }
  return violations
}

describe('design-system guard: shared ui icons', () => {
  it('shared ui never imports lucide-react', () => {
    expect(scanSource([uiSrc], /from ['"]lucide-react['"]/, [])).toEqual([])
  })

  it('shared ui imports phosphor only in icons.ts', () => {
    expect(scanSource([uiSrc], /from ['"]@phosphor-icons\/react/, ['icons.ts'])).toEqual([])
  })
})

describe('design-system guard: renderer icons', () => {
  it('renderer never imports lucide-react', () => {
    expect(scanSource([rendererSrc], /from ['"]lucide-react['"]/, [])).toEqual([])
  })

  it('renderer imports phosphor only in components/icons.ts', () => {
    expect(
      scanSource([rendererSrc], /from ['"]@phosphor-icons\/react/, ['components/icons.ts'])
    ).toEqual([])
  })
})

const HUES =
  'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone'
// Matches mid-string, so variant prefixes (`hover:`, `dark:`, `group-hover:`) are covered too.
const RAW_PALETTE_PATTERN = new RegExp(
  `\\b(text|bg|border|border-[trblxyse]|ring|ring-offset|fill|stroke|from|to|via|shadow|outline|divide|decoration|accent|caret|placeholder)-(${HUES})-\\d{2,3}`
)

// Arbitrary colour values in a class token: a hex, or a colour function inside the brackets (a shadow glow, for instance).
// A colour function inside `[...]` is the signal; bare rgba()/hsl() in .ts logic files is not matched.
const ARBITRARY_COLOUR_PATTERN =
  /\b(text|bg|border|fill|stroke|ring|shadow|outline|decoration|from|to|via)-\[(#|[^\]\s'"]*(rgba?|hsla?|oklch)\()/

const NEUTRALS = 'muted-foreground (text), muted/card (surface), border (line), or foreground'
const SUGGESTED_TOKEN: Record<string, string> = {
  red: 'destructive',
  rose: 'destructive',
  green: 'success (status) or cat-green (kind)',
  emerald: 'success',
  amber: 'warning',
  yellow: 'warning (status) or cat-yellow (kind)',
  orange: 'warning (status) or cat-orange (kind)',
  blue: 'primary (emphasis) or cat-blue (kind)',
  sky: 'primary or cat-cyan',
  indigo: 'primary or cat-blue',
  violet: 'cat-purple',
  purple: 'cat-purple',
  fuchsia: 'cat-pink',
  pink: 'cat-pink',
  cyan: 'cat-cyan',
  teal: 'cat-teal',
  lime: 'cat-green',
  zinc: NEUTRALS,
  gray: NEUTRALS,
  slate: NEUTRALS,
  neutral: NEUTRALS,
  stone: NEUTRALS
}

// Fixed colours by design (exported images, Monaco themes, persisted user colours, easter egg).
const RAW_PALETTE_ALLOW = [
  'components/query-editor/share-results-image.tsx',
  'components/share-image-dialog.tsx',
  'components/health-share-content.tsx',
  'components/sql-editor.tsx',
  'lib/environment.ts',
  'stores/pokemon-buddy-store.ts'
]

describe('design-system guard: renderer colours', () => {
  it('renderer uses tokens, not raw palette classes', () => {
    const violations = scanSource([rendererSrc, uiSrc], RAW_PALETTE_PATTERN, RAW_PALETTE_ALLOW)
    const message = violations
      .map((v) => {
        const hue = /-([a-z]+)-\d+$/.exec(v.match)?.[1]
        return `${v.file}:${v.line} ${v.match} -> use ${hue ? SUGGESTED_TOKEN[hue] : 'a token'}`
      })
      .join('\n')
    expect(violations, message).toEqual([])
  })
})

// Non-chrome code that legitimately carries literal colours (brand logos, third-party palettes).
const ARBITRARY_COLOUR_ALLOW: string[] = []

describe('design-system guard: arbitrary colours', () => {
  it('renderer and shared ui use token colours, not arbitrary colour values', () => {
    const violations = scanSource([rendererSrc, uiSrc], ARBITRARY_COLOUR_PATTERN, [
      ...RAW_PALETTE_ALLOW,
      ...ARBITRARY_COLOUR_ALLOW
    ])
    const message = violations.map((v) => `${v.file}:${v.line} ${v.match} -> use a colour token`)
    expect(violations, message.join('\n')).toEqual([])
  })
})

describe('design-system guard: typography', () => {
  it('renderer and shared ui use the type scale, not arbitrary sizes', () => {
    const violations = scanSource([rendererSrc, uiSrc], /\btext-\[(\.|\d|length:)/, [])
    const message = violations
      .map((v) => `${v.file}:${v.line} ${v.match} -> use text-2xs (11px), text-xs, or text-sm`)
      .join('\n')
    expect(violations, message).toEqual([])
  })

  it('renderer and shared ui use no weight above 600', () => {
    const violations = scanSource([rendererSrc, uiSrc], /\bfont-(bold|extrabold|black)\b/, [
      'components/query-editor/share-results-image.tsx',
      'components/share-image-dialog.tsx',
      'components/health-share-content.tsx'
    ])
    const message = violations.map((v) => `${v.file}:${v.line} ${v.match} -> use font-semibold`)
    expect(violations, message.join('\n')).toEqual([])
  })
})
