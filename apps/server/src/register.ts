/**
 * Custom module resolution hook that intercepts imports of Electron-specific
 * modules from desktop code and redirects them to our local shims.
 *
 * This is needed because pnpm strict mode resolves 'electron-log' from
 * apps/desktop/node_modules (the real package), not from our shims.
 */
import { register } from 'node:module'

register('./loader.ts', import.meta.url)
