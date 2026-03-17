import type {
  SchemaInfo,
  AIConfig,
  AIMessage,
  StoredChatMessage,
  AIMultiProviderConfig,
  AIProviderConfig,
  AIProvider
} from '@shared/index'
import {
  getAIConfig,
  setAIConfig,
  clearAIConfig,
  validateAPIKey,
  generateChatResponse,
  getChatHistory,
  saveChatHistory,
  clearChatHistory,
  getChatSessions,
  getChatSession,
  createChatSession,
  updateChatSession,
  deleteChatSession,
  getMultiProviderConfig,
  setMultiProviderConfig,
  getProviderConfig,
  setProviderConfig,
  removeProviderConfig,
  setActiveProvider,
  setActiveModel
} from '../desktop-imports.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('ai-handlers')

type RegisterFn = (channel: string, handler: (args: any) => Promise<any>) => void

function wrap(fn: () => any) {
  try {
    const result = fn()
    return { success: true, data: result }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
}

export function registerAIHandlers(register: RegisterFn): void {
  register('ai:get-config', async () => wrap(() => getAIConfig()))
  register('ai:set-config', async (config: AIConfig) => wrap(() => setAIConfig(config)))
  register('ai:clear-config', async () => wrap(() => clearAIConfig()))

  // Multi-provider
  register('ai:get-multi-provider-config', async () => wrap(() => getMultiProviderConfig()))
  register('ai:set-multi-provider-config', async (config: AIMultiProviderConfig | null) =>
    wrap(() => setMultiProviderConfig(config)))
  register('ai:get-provider-config', async (provider: string) =>
    wrap(() => getProviderConfig(provider as AIProvider)))
  register('ai:set-provider-config', async ({ provider, config }: { provider: string; config: AIProviderConfig }) =>
    wrap(() => setProviderConfig(provider as AIProvider, config)))
  register('ai:remove-provider-config', async (provider: string) =>
    wrap(() => removeProviderConfig(provider as AIProvider)))
  register('ai:set-active-provider', async (provider: string) =>
    wrap(() => setActiveProvider(provider as AIProvider)))
  register('ai:set-active-model', async ({ provider, model }: { provider: string; model: string }) =>
    wrap(() => setActiveModel(provider as AIProvider, model)))

  // Validate
  register('ai:validate-key', async (config: AIConfig) => {
    try {
      const result = await validateAPIKey(config)
      return { success: true, data: result }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Chat
  register('ai:chat', async ({ messages, schemas, dbType }: { messages: AIMessage[]; schemas: SchemaInfo[]; dbType: string }) => {
    try {
      const config = getAIConfig()
      if (!config) {
        return { success: false, error: 'AI not configured. Please set up your API key.' }
      }
      const result = await generateChatResponse(config, messages, schemas, dbType)
      if (result.success && result.data) {
        return { success: true, data: result.data }
      }
      return { success: false, error: result.error }
    } catch (error: unknown) {
      log.error('Chat error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Chat history (legacy)
  register('ai:get-chat-history', async (connectionId: string) =>
    wrap(() => getChatHistory(connectionId)))
  register('ai:save-chat-history', async ({ connectionId, messages }: { connectionId: string; messages: StoredChatMessage[] }) =>
    wrap(() => saveChatHistory(connectionId, messages)))
  register('ai:clear-chat-history', async (connectionId: string) =>
    wrap(() => clearChatHistory(connectionId)))

  // Sessions
  register('ai:get-sessions', async (connectionId: string) =>
    wrap(() => getChatSessions(connectionId)))
  register('ai:get-session', async ({ connectionId, sessionId }: { connectionId: string; sessionId: string }) =>
    wrap(() => getChatSession(connectionId, sessionId)))
  register('ai:create-session', async ({ connectionId, title }: { connectionId: string; title?: string }) =>
    wrap(() => createChatSession(connectionId, title)))
  register('ai:update-session', async ({ connectionId, sessionId, updates }: { connectionId: string; sessionId: string; updates: { messages?: StoredChatMessage[]; title?: string } }) =>
    wrap(() => updateChatSession(connectionId, sessionId, updates)))
  register('ai:delete-session', async ({ connectionId, sessionId }: { connectionId: string; sessionId: string }) =>
    wrap(() => deleteChatSession(connectionId, sessionId)))
}
