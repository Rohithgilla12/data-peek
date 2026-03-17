/**
 * CJS require hook that intercepts module resolution for:
 * 1. Electron-specific modules → local shims
 * 2. TypeScript path aliases used by desktop code → actual file paths
 *
 * This is necessary because:
 * - pnpm strict mode resolves electron/electron-log from desktop's node_modules
 * - tsx CJS loader doesn't resolve tsconfig path aliases for files outside the project
 */
const Module = require('node:module')
const path = require('node:path')

const shimsDir = path.resolve(__dirname, '..', 'shims')

// Resolve packages/shared relative to the monorepo root
// __dirname = apps/server/src → ../../.. = monorepo root
const monorepoRoot = path.resolve(__dirname, '..', '..', '..')
const sharedDir = path.resolve(monorepoRoot, 'packages', 'shared', 'src')

const SHIM_MAP = {
  // Electron shims
  'electron': path.resolve(shimsDir, 'electron', 'index.js'),
  'electron-log/main': path.resolve(shimsDir, 'electron-log', 'main.js'),
  'electron-store': path.resolve(shimsDir, 'electron-store', 'index.js'),
}

const originalResolve = Module._resolveFilename
Module._resolveFilename = function (request, parent, isMain, options) {
  // Electron shims (exact match)
  if (request in SHIM_MAP) {
    return SHIM_MAP[request]
  }

  // @shared/* path alias → packages/shared/src/*
  if (request === '@shared/index' || request === '@data-peek/shared') {
    return path.resolve(sharedDir, 'index.ts')
  }
  if (request.startsWith('@shared/')) {
    const subpath = request.slice('@shared/'.length)
    return path.resolve(sharedDir, subpath + '.ts')
  }

  return originalResolve.call(this, request, parent, isMain, options)
}
