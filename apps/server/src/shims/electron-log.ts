/**
 * Shim for 'electron-log/main' module.
 * Redirects all logging to console with a similar interface.
 */

function formatMessage(...args: unknown[]): string {
  return args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
}

const transports = {
  console: { level: 'debug' },
  file: { level: 'debug', maxSize: 5 * 1024 * 1024, format: '' }
}

function scope(module: string) {
  return {
    debug: (msg: string, ...args: unknown[]) => console.debug(`[debug] [${module}]`, msg, ...args),
    info: (msg: string, ...args: unknown[]) => console.info(`[info] [${module}]`, msg, ...args),
    warn: (msg: string, ...args: unknown[]) => console.warn(`[warn] [${module}]`, msg, ...args),
    error: (msg: string, ...args: unknown[]) => console.error(`[error] [${module}]`, msg, ...args)
  }
}

const log = {
  initialize: () => {},
  transports,
  scope,
  debug: (...args: unknown[]) => console.debug('[debug]', formatMessage(...args)),
  info: (...args: unknown[]) => console.info('[info]', formatMessage(...args)),
  warn: (...args: unknown[]) => console.warn('[warn]', formatMessage(...args)),
  error: (...args: unknown[]) => console.error('[error]', formatMessage(...args))
}

export default log
