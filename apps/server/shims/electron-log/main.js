function scope(module) {
  return {
    debug: (msg, ...args) => console.debug(`[debug] [${module}]`, msg, ...args),
    info: (msg, ...args) => console.info(`[info] [${module}]`, msg, ...args),
    warn: (msg, ...args) => console.warn(`[warn] [${module}]`, msg, ...args),
    error: (msg, ...args) => console.error(`[error] [${module}]`, msg, ...args),
  }
}

const log = {
  initialize() {},
  transports: {
    console: { level: 'debug' },
    file: { level: 'debug', maxSize: 5 * 1024 * 1024, format: '' }
  },
  scope,
  debug: (...args) => console.debug('[debug]', ...args),
  info: (...args) => console.info('[info]', ...args),
  warn: (...args) => console.warn('[warn]', ...args),
  error: (...args) => console.error('[error]', ...args),
}

module.exports = log
module.exports.default = log
