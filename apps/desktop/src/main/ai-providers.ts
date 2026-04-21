/**
 * AI Provider Factory — Pure Module
 *
 * Instantiates AI SDK clients for every supported provider. Kept free of
 * Electron imports so it can be unit-tested in plain node.
 *
 * If you add a provider here, extend the AIProvider type in
 * packages/shared, and the ai-providers.test.ts suite will fail until
 * the switch is complete.
 *
 * We deliberately avoid @ai-sdk/deepseek, @ai-sdk/mistral, and
 * @ai-sdk/xai: all three currently depend on @ai-sdk/provider-utils@4
 * while the core `ai` package is on provider-utils@3, which crashes
 * the packaged app at require-time. See ai-deps.test.ts.
 */

import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import type { AIConfig } from '@shared/index'

export function createProviderClient(config: AIConfig) {
  switch (config.provider) {
    case 'openai': {
      const openai = createOpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl })
      return openai(config.model)
    }

    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey: config.apiKey, baseURL: config.baseUrl })
      return anthropic(config.model)
    }

    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey, baseURL: config.baseUrl })
      return google(config.model)
    }

    case 'groq': {
      const groq = createGroq({ apiKey: config.apiKey, baseURL: config.baseUrl })
      return groq(config.model)
    }

    case 'deepseek': {
      const deepseek = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || 'https://api.deepseek.com/v1'
      })
      return deepseek(config.model)
    }

    case 'mistral': {
      const mistral = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || 'https://api.mistral.ai/v1'
      })
      return mistral(config.model)
    }

    case 'xai': {
      const xai = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || 'https://api.x.ai/v1'
      })
      return xai(config.model)
    }

    case 'glm': {
      const glm = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || 'https://open.bigmodel.cn/api/paas/v4'
      })
      return glm(config.model)
    }

    case 'ollama': {
      const ollama = createOpenAI({
        baseURL: config.baseUrl || 'http://localhost:11434/v1',
        apiKey: 'ollama'
      })
      return ollama(config.model)
    }

    default: {
      const _exhaustive: never = config.provider
      throw new Error(`Unknown provider: ${String(_exhaustive)}`)
    }
  }
}
