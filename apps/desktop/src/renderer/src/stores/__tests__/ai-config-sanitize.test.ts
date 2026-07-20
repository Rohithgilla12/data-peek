import { describe, it, expect } from 'vitest'
import { sanitizeMultiConfig } from '../ai-config-sanitize'
import { AI_PROVIDERS } from '@shared/index'
import type { AIMultiProviderConfig } from '@shared/index'

const FIRST = AI_PROVIDERS[0].id

describe('sanitizeMultiConfig', () => {
  it('returns null for null/undefined/non-object input', () => {
    expect(sanitizeMultiConfig(null)).toBeNull()
    expect(sanitizeMultiConfig(undefined)).toBeNull()
    // corrupt persisted value that is not an object
    expect(sanitizeMultiConfig('boom' as unknown as AIMultiProviderConfig)).toBeNull()
  })

  it('passes through a valid config unchanged', () => {
    const config: AIMultiProviderConfig = {
      providers: { openai: { apiKey: 'sk-test' } },
      activeProvider: 'openai',
      activeModels: { openai: 'gpt-4o' }
    }
    expect(sanitizeMultiConfig(config)).toEqual(config)
  })

  it('coerces an unknown activeProvider to a configured provider', () => {
    const config = {
      providers: { anthropic: { apiKey: 'sk-ant' } },
      activeProvider: 'deleted-provider',
      activeModels: {}
    } as unknown as AIMultiProviderConfig
    expect(sanitizeMultiConfig(config)?.activeProvider).toBe('anthropic')
  })

  it('falls back to the first known provider when none configured are valid', () => {
    const config = {
      providers: {},
      activeProvider: 'gone',
      activeModels: {}
    } as unknown as AIMultiProviderConfig
    expect(sanitizeMultiConfig(config)?.activeProvider).toBe(FIRST)
  })

  it('repairs a missing providers/activeModels map instead of crashing', () => {
    const config = { activeProvider: 'openai' } as unknown as AIMultiProviderConfig
    const result = sanitizeMultiConfig(config)
    expect(result?.providers).toEqual({})
    expect(result?.activeModels).toEqual({})
    expect(result?.activeProvider).toBe('openai')
  })

  it('handles a stale activeProvider together with a missing providers map', () => {
    // the exact shape that crashed the settings modal
    const config = { activeProvider: 'stale' } as unknown as AIMultiProviderConfig
    expect(sanitizeMultiConfig(config)?.activeProvider).toBe(FIRST)
  })
})
