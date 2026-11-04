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

const RAW_STATUS_PATTERN =
  /(text|bg|border|ring|fill|stroke|shadow|outline|divide)-(red|rose|green|emerald|amber|yellow|zinc|gray|slate|neutral|stone)-\d/

const SUGGESTED_TOKEN: Record<string, string> = {
  red: 'destructive',
  rose: 'destructive',
  green: 'success',
  emerald: 'success',
  amber: 'warning',
  yellow: 'warning',
  zinc: 'muted-foreground (text), muted/card (surface), border (line), or foreground',
  gray: 'muted-foreground (text), muted/card (surface), border (line), or foreground',
  slate: 'muted-foreground (text), muted/card (surface), border (line), or foreground',
  neutral: 'muted-foreground (text), muted/card (surface), border (line), or foreground',
  stone: 'muted-foreground (text), muted/card (surface), border (line), or foreground'
}

// Fixed colours by design (exported images, Monaco themes, persisted user colours, easter egg).
// Entries are 'path' (whole file) or 'path:line' (a single line).
const RAW_STATUS_ALLOW = [
  'components/query-editor/share-results-image.tsx',
  'components/share-image-dialog.tsx',
  'components/health-share-content.tsx',
  'components/sql-editor.tsx',
  'lib/environment.ts',
  'stores/pokemon-buddy-store.ts',
  // Task 6: hues that tell kinds apart (type, query-kind, category badges); become cat-* tokens
  'lib/built-in-snippets.ts:172',
  'lib/built-in-snippets.ts:174',
  'lib/built-in-snippets.ts:176',
  'lib/query-history-utils.ts:24',
  'lib/query-history-utils.ts:26',
  'lib/query-history-utils.ts:28',
  'lib/type-colors.ts:8',
  'lib/type-colors.ts:18',
  'components/execution-plan-viewer.tsx:131',
  'components/ai/ai-suggestions.tsx:39',
  'components/ai/ai-suggestions.tsx:51',
  'components/command-palette.tsx:67',
  'components/command-palette.tsx:68',
  'components/command-palette.tsx:69',
  'components/command-palette.tsx:74',
  'components/command-palette.tsx:315',
  'components/command-palette.tsx:354',
  'components/command-palette.tsx:363',
  'components/command-palette.tsx:384',
  'components/command-palette.tsx:486',
  'components/command-palette.tsx:495',
  'components/command-palette.tsx:508',
  'components/command-palette.tsx:522',
  'components/command-palette.tsx:543',
  'components/command-palette.tsx:552',
  'components/command-palette.tsx:566',
  'components/command-palette.tsx:647',
  'components/schema-explorer.tsx:98',
  'components/schema-explorer.tsx:108',
  'components/telemetry-panel.tsx:87',
  'components/telemetry-panel.tsx:95',
  'components/add-row-sheet.tsx:112',
  'components/add-row-sheet.tsx:114',
  'components/sidebar-omnibar.tsx:196',
  'components/sidebar-omnibar.tsx:230',
  'components/sidebar-omnibar.tsx:243',
  'components/saved-queries-dialog.tsx:83',
  'components/saved-queries-dialog.tsx:85',
  'components/saved-queries-dialog.tsx:87',
  'components/json-cell-value.tsx:43',
  'components/json-cell-value.tsx:47',
  'components/json-cell-value.tsx:215',
  'components/json-cell-value.tsx:326',
  'components/json-cell-value.tsx:344',
  'components/saved-queries.tsx:64',
  'components/saved-queries.tsx:66',
  'components/saved-queries.tsx:68'
]

describe('design-system guard: renderer colours', () => {
  it('renderer uses status tokens, not raw status hues', () => {
    const wholeFiles = RAW_STATUS_ALLOW.filter((entry) => !/:\d+$/.test(entry))
    const violations = scanSource([rendererSrc], RAW_STATUS_PATTERN, wholeFiles).filter(
      (v) =>
        !RAW_STATUS_ALLOW.includes(
          `${v.file.replace('apps/desktop/src/renderer/src/', '')}:${v.line}`
        )
    )
    const message = violations
      .map((v) => {
        const hue = /-(red|rose|green|emerald|amber|yellow|zinc|gray|slate|neutral|stone)-/.exec(
          v.match
        )?.[1]
        return `${v.file}:${v.line} ${v.match} -> use ${hue ? SUGGESTED_TOKEN[hue] : 'a token'}`
      })
      .join('\n')
    expect(violations, message).toEqual([])
  })
})
