/**
 * AI provider factory smoke test.
 *
 * Exercises createProviderClient for every declared AIProvider.
 * Catches the class of bug where an @ai-sdk/* package throws at
 * require-time (e.g. missing export in a transitive dependency) —
 * this is what blew up v0.21.0 when @ai-sdk/xai was installed against
 * a provider-utils version that lacked createProviderToolFactoryWithOutputSchema.
 *
 * If you add a provider to AIProvider in packages/shared, the
 * "covers every AIProvider" assertion below will fail until the switch
 * in ai-providers.ts is extended.
 */

import { describe, expect, it } from 'vitest'
import { AI_PROVIDERS, isHarnessProvider, type AIConfig, type AIProvider } from '@shared/index'
import { createProviderClient } from '../ai-providers'

function configFor(provider: AIProvider): AIConfig {
  return {
    provider,
    apiKey: 'test-key-not-used',
    model: provider === 'ollama' ? 'llama3' : 'test-model',
    baseUrl: undefined
  }
}

// BYOH harness providers are not AI SDK providers — they drive local CLIs via
// harness/service, so createProviderClient intentionally throws for them (callers
// route them away before reaching the factory).
const SDK_PROVIDERS = AI_PROVIDERS.filter((p) => !isHarnessProvider(p.id))

describe('createProviderClient', () => {
  for (const info of SDK_PROVIDERS) {
    it(`instantiates ${info.id} without throwing`, () => {
      const model = createProviderClient(configFor(info.id))
      expect(model).toBeTruthy()
    })
  }

  it('covers every AI-SDK AIProvider enumerated in AI_PROVIDERS', () => {
    // If someone adds a provider to the shared union but forgets to
    // extend AI_PROVIDERS or the switch, at least one of these explodes.
    for (const info of SDK_PROVIDERS) {
      expect(() => createProviderClient(configFor(info.id))).not.toThrow()
    }
  })

  it('throws for claude-cli (handled by the harness, not the AI SDK factory)', () => {
    expect(() => createProviderClient(configFor('claude-cli'))).toThrow(/harness/i)
  })

  it('throws for codex-cli (handled by the harness, not the AI SDK factory)', () => {
    expect(() => createProviderClient(configFor('codex-cli'))).toThrow(/harness/i)
  })

  it('throws for antigravity-cli (handled by the harness, not the AI SDK factory)', () => {
    expect(() => createProviderClient(configFor('antigravity-cli'))).toThrow(/harness/i)
  })

  it('throws on an unknown provider (defensive)', () => {
    expect(() =>
      createProviderClient({
        provider: 'definitely-not-a-provider' as AIProvider,
        apiKey: 'x',
        model: 'y'
      })
    ).toThrow()
  })
})
