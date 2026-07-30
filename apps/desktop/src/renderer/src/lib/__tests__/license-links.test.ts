import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildTrackingUrl,
  DATAPEEK_BASE_URL,
  LICENSE_PURCHASE_PATH,
  LICENSE_DASHBOARD_PATH
} from '@shared/index'

const WEB_APP_DIR = resolve(__dirname, '../../../../../../web')

describe('buildTrackingUrl', () => {
  it('appends UTM params as a query string', () => {
    const url = buildTrackingUrl('/download', { source: 'desktop', medium: 'app' })
    expect(url).toBe(`${DATAPEEK_BASE_URL}/download?utm_source=desktop&utm_medium=app`)
  })

  it('returns the plain URL when no UTM params are given', () => {
    expect(buildTrackingUrl('/download')).toBe(`${DATAPEEK_BASE_URL}/download`)
  })

  it('inserts UTM params before a hash fragment, not after it', () => {
    const url = buildTrackingUrl('/#pricing', { source: 'desktop' })
    expect(url).toBe(`${DATAPEEK_BASE_URL}/?utm_source=desktop#pricing`)

    const parsed = new URL(url)
    expect(parsed.hash).toBe('#pricing')
    expect(parsed.searchParams.get('utm_source')).toBe('desktop')
  })

  it('appends to an existing query string while preserving the hash', () => {
    const url = buildTrackingUrl('/download?os=mac#latest', { source: 'desktop' })
    expect(url).toBe(`${DATAPEEK_BASE_URL}/download?os=mac&utm_source=desktop#latest`)
  })

  it('keeps a hash-only path intact without UTM params', () => {
    expect(buildTrackingUrl('/#pricing')).toBe(`${DATAPEEK_BASE_URL}/#pricing`)
  })
})

describe('license purchase link', () => {
  // Regression test: the in-app "Purchase one" button used to point at /pricing
  // before that page existed on the marketing site, so users got a 404.
  it('builds a well-formed tracking URL', () => {
    const url = new URL(buildTrackingUrl(LICENSE_PURCHASE_PATH, { source: 'desktop' }))
    expect(url.pathname).toBe(LICENSE_PURCHASE_PATH)
    expect(url.searchParams.get('utm_source')).toBe('desktop')
  })

  it('targets a page that exists on the marketing site', () => {
    const pagePath = resolve(WEB_APP_DIR, `src/app${LICENSE_PURCHASE_PATH}/page.tsx`)
    expect(existsSync(pagePath)).toBe(true)
  })
})

describe('license dashboard link', () => {
  it('is covered by a marketing-site redirect so it does not 404', () => {
    const nextConfig = readFileSync(resolve(WEB_APP_DIR, 'next.config.ts'), 'utf-8')
    expect(nextConfig).toContain(`source: "${LICENSE_DASHBOARD_PATH}"`)
  })
})
