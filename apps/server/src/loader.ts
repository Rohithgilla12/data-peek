/**
 * Node.js ESM module resolution hook.
 * Intercepts:
 * 1. Electron-specific imports → CJS shims
 * 2. TypeScript path aliases (@shared/*, @data-peek/shared) → actual file paths
 */
import { pathToFileURL } from 'node:url'
import { resolve as pathResolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const shimsDir = pathResolve(__dirname, '..', 'shims')
const monorepoRoot = pathResolve(__dirname, '..', '..', '..')
const sharedDir = pathResolve(monorepoRoot, 'packages', 'shared', 'src')

const SHIM_MAP: Record<string, string> = {
  'electron': pathResolve(shimsDir, 'electron', 'index.js'),
  'electron-log/main': pathResolve(shimsDir, 'electron-log', 'main.js'),
  'electron-store': pathResolve(shimsDir, 'electron-store', 'index.js'),
}

export async function resolve(
  specifier: string,
  context: { parentURL?: string; conditions: string[] },
  nextResolve: (specifier: string, context: any) => Promise<any>
): Promise<any> {
  // Electron shims
  if (specifier in SHIM_MAP) {
    return {
      shortCircuit: true,
      url: pathToFileURL(SHIM_MAP[specifier]).href,
      format: 'commonjs'
    }
  }

  // @shared/* and @data-peek/shared path aliases
  if (specifier === '@shared/index' || specifier === '@data-peek/shared') {
    return {
      shortCircuit: true,
      url: pathToFileURL(pathResolve(sharedDir, 'index.ts')).href
    }
  }
  if (specifier.startsWith('@shared/')) {
    const subpath = specifier.slice('@shared/'.length)
    return {
      shortCircuit: true,
      url: pathToFileURL(pathResolve(sharedDir, subpath + '.ts')).href
    }
  }

  return nextResolve(specifier, context)
}
