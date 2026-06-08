import { redactSensitive } from '@shared/redact'

/**
 * Renderer-side logger. Mirrors the main-process logger's redaction so connection
 * configs, AI keys, and other secrets are scrubbed before they ever reach DevTools
 * or stdout. Use this instead of raw `console.*` in renderer code.
 */

const isDev = import.meta.env.DEV

function format(args: unknown[]): unknown[] {
  return args.map((arg) => (typeof arg === 'object' && arg !== null ? redactSensitive(arg) : arg))
}

export function createLogger(module: string) {
  const prefix = `[${module}]`

  return {
    debug: (message: string, ...args: unknown[]) => {
      if (isDev) console.debug(prefix, message, ...format(args))
    },
    info: (message: string, ...args: unknown[]) => {
      console.info(prefix, message, ...format(args))
    },
    warn: (message: string, ...args: unknown[]) => {
      console.warn(prefix, message, ...format(args))
    },
    error: (message: string, ...args: unknown[]) => {
      console.error(prefix, message, ...format(args))
    }
  }
}

export type Logger = ReturnType<typeof createLogger>
