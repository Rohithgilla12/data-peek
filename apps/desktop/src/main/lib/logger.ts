import log from 'electron-log/main'
import { app } from 'electron'
import { redactSensitive } from '@shared/redact'

// Initialize electron-log
// Logs are stored in:
// - macOS: ~/Library/Logs/data-peek/
// - Windows: %USERPROFILE%\AppData\Roaming\data-peek\logs\
// - Linux: ~/.config/data-peek/logs/
log.initialize()

const level = app.isPackaged ? 'info' : 'debug'
log.transports.console.level = level
log.transports.file.level = level

log.transports.file.maxSize = 5 * 1024 * 1024 // 5MB
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'object' && arg !== null) {
        return JSON.stringify(redactSensitive(arg), null, 2)
      }
      return String(arg)
    })
    .join(' ')
}

export function createLogger(module: string) {
  const scope = log.scope(module)

  return {
    debug: (message: string, ...args: unknown[]) => {
      if (args.length > 0) {
        scope.debug(message, formatArgs(args))
      } else {
        scope.debug(message)
      }
    },

    info: (message: string, ...args: unknown[]) => {
      if (args.length > 0) {
        scope.info(message, formatArgs(args))
      } else {
        scope.info(message)
      }
    },

    warn: (message: string, ...args: unknown[]) => {
      if (args.length > 0) {
        scope.warn(message, formatArgs(args))
      } else {
        scope.warn(message)
      }
    },

    error: (message: string, ...args: unknown[]) => {
      if (args.length > 0) {
        scope.error(message, formatArgs(args))
      } else {
        scope.error(message)
      }
    }
  }
}

export type Logger = ReturnType<typeof createLogger>

export { log }
