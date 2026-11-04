import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

type Violation = { file: string; line: number; match: string }

const repoRoot = path.resolve(__dirname, '../../../../../..')
const uiSrc = path.join(repoRoot, 'packages/ui/src')

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
