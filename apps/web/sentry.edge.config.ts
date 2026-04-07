import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampler: () => {
    if (process.env.NODE_ENV === 'development') return 1
    return 0.1
  },
  debug: false,
})
