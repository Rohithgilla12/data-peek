const SENSITIVE_KEYS = [
  'password',
  'license_key',
  'licenseKey',
  'api_key',
  'apiKey',
  'secret',
  'token',
  'authorization'
]

function redactSensitive(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj

  if (Array.isArray(obj)) {
    return obj.map(redactSensitive)
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase()
    if (SENSITIVE_KEYS.some((sk) => lowerKey.includes(sk))) {
      result[key] = '***REDACTED***'
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSensitive(value)
    } else {
      result[key] = value
    }
  }
  return result
}

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

function timestamp(): string {
  return new Date().toISOString()
}

export function createLogger(module: string) {
  return {
    debug: (message: string, ...args: unknown[]) => {
      if (process.env.LOG_LEVEL === 'debug') {
        console.debug(`[${timestamp()}] [debug] [${module}]`, message, ...args.length ? [formatArgs(args)] : [])
      }
    },

    info: (message: string, ...args: unknown[]) => {
      console.info(`[${timestamp()}] [info] [${module}]`, message, ...args.length ? [formatArgs(args)] : [])
    },

    warn: (message: string, ...args: unknown[]) => {
      console.warn(`[${timestamp()}] [warn] [${module}]`, message, ...args.length ? [formatArgs(args)] : [])
    },

    error: (message: string, ...args: unknown[]) => {
      console.error(`[${timestamp()}] [error] [${module}]`, message, ...args.length ? [formatArgs(args)] : [])
    }
  }
}

export type Logger = ReturnType<typeof createLogger>
