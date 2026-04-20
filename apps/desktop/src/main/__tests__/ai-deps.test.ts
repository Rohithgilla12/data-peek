/**
 * AI SDK dependency consistency guard.
 *
 * The @ai-sdk/* packages all depend on @ai-sdk/provider-utils. If two
 * installed @ai-sdk packages resolve different major versions of
 * provider-utils, Electron's asar packaging can pick the wrong one at
 * runtime and the app crashes with errors like:
 *
 *     TypeError: (0 , import_provider_utils6.createProviderToolFactoryWithOutputSchema)
 *                is not a function
 *
 * This is exactly what shipped in v0.21.0 when @ai-sdk/xai (needing
 * provider-utils@4) was installed alongside ai@5 (pinned to
 * provider-utils@3). This test fails fast in CI if the same split
 * recurs — before anyone packages a release.
 *
 * The check uses Node's module resolution from apps/desktop (which is
 * where the real runtime imports happen), not a fixed filesystem path.
 * That keeps it honest regardless of pnpm's hoisting strategy —
 * `shamefully-hoist=true` on CI puts @ai-sdk under apps/desktop/
 * node_modules, while a hoisted local workspace lifts them to the
 * monorepo root.
 */

import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { describe, expect, it } from 'vitest'

interface PackageJson {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

function readPackageJson(pkgDir: string): PackageJson | null {
  const file = path.join(pkgDir, 'package.json')
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as PackageJson
  } catch {
    return null
  }
}

// Resolve packages from apps/desktop (where the real imports happen).
// __dirname is .../apps/desktop/src/main/__tests__
const DESKTOP_DIR = path.resolve(__dirname, '../../../')
const desktopRequire = createRequire(path.join(DESKTOP_DIR, 'package.json'))

/**
 * Find every @ai-sdk/* directory reachable from apps/desktop. Walks
 * the node_modules parents of the resolved `@ai-sdk/openai` (a
 * package we know is a direct dep) to discover every sibling
 * package, across both hoisted and isolated layouts.
 */
function findAiSdkDirectories(): string[] {
  let openaiPkgPath: string
  try {
    openaiPkgPath = desktopRequire.resolve('@ai-sdk/openai/package.json')
  } catch {
    return []
  }

  const dirs = new Set<string>()
  // openaiPkgPath = .../node_modules/@ai-sdk/openai/package.json
  // Add the @ai-sdk parent.
  dirs.add(path.dirname(path.dirname(openaiPkgPath)))

  // Also walk up every node_modules/@ai-sdk we can see from apps/desktop,
  // so nested copies (e.g. via ai-v5 aliases) don't hide a bad version.
  let current = DESKTOP_DIR
  while (true) {
    const candidate = path.join(current, 'node_modules/@ai-sdk')
    if (fs.existsSync(candidate)) dirs.add(candidate)
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return [...dirs]
}

interface Requirement {
  package: string
  version: string
  requires: string
  from: string
}

function collectProviderUtilsRequirements(): Requirement[] {
  const aiSdkDirs = findAiSdkDirectories()
  const results: Requirement[] = []

  for (const dir of aiSdkDirs) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === 'provider-utils' || entry.name === 'provider') continue

      const pkgDir = path.join(dir, entry.name)
      const pkg = readPackageJson(pkgDir)
      if (!pkg) continue
      const requires = pkg.dependencies?.['@ai-sdk/provider-utils']
      if (!requires) continue
      results.push({
        package: pkg.name ?? `@ai-sdk/${entry.name}`,
        version: pkg.version ?? 'unknown',
        requires,
        from: pkgDir
      })
    }
  }

  return results
}

function majorOf(range: string): string {
  const cleaned = range.replace(/^[^\d]*/, '')
  return cleaned.split('.')[0] ?? range
}

describe('@ai-sdk dependency consistency', () => {
  it('discovers installed @ai-sdk packages', () => {
    // Sanity: if this fails, the discovery walk itself is broken —
    // fix the walker before trusting the major-version assertions.
    const requirements = collectProviderUtilsRequirements()
    expect(
      requirements.length,
      `No @ai-sdk packages found via apps/desktop resolver. Searched:\n  ${findAiSdkDirectories().join('\n  ')}`
    ).toBeGreaterThan(0)
  })

  it('all @ai-sdk/* packages agree on the major version of provider-utils', () => {
    const requirements = collectProviderUtilsRequirements()
    if (requirements.length === 0) return // handled by the discovery test

    const majors = new Map<string, Requirement[]>()
    for (const r of requirements) {
      const major = majorOf(r.requires)
      if (!majors.has(major)) majors.set(major, [])
      majors.get(major)!.push(r)
    }

    if (majors.size > 1) {
      const summary = [...majors.entries()]
        .map(
          ([major, pkgs]) =>
            `  provider-utils@${major}.x (${pkgs.length}):\n` +
            pkgs.map((p) => `    - ${p.package}@${p.version} needs ${p.requires}`).join('\n')
        )
        .join('\n')

      throw new Error(
        `Multiple major versions of @ai-sdk/provider-utils are installed.\n` +
          `This crashes the packaged Electron app at require-time.\n` +
          `Either downgrade the offending package or remove it:\n\n${summary}\n`
      )
    }

    expect(majors.size).toBe(1)
  })

  it('the resolved `ai` package agrees on provider-utils major', () => {
    let aiPkgPath: string
    try {
      aiPkgPath = desktopRequire.resolve('ai/package.json')
    } catch {
      throw new Error('Could not resolve `ai` from apps/desktop')
    }
    const aiPkg = readPackageJson(path.dirname(aiPkgPath))
    expect(aiPkg).toBeTruthy()
    const aiRequires = aiPkg!.dependencies?.['@ai-sdk/provider-utils']
    expect(aiRequires, '`ai` is expected to depend on @ai-sdk/provider-utils').toBeTruthy()

    const requirements = collectProviderUtilsRequirements()
    for (const r of requirements) {
      expect(
        majorOf(r.requires),
        `${r.package}@${r.version} requires provider-utils ${r.requires}, but ai requires ${aiRequires}`
      ).toBe(majorOf(aiRequires!))
    }
  })
})
