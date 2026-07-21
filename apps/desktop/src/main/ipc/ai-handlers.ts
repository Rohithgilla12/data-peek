import { ipcMain } from 'electron'
import type { SchemaInfo } from '@shared/index'
import {
  getAIConfig,
  setAIConfig,
  clearAIConfig,
  validateAPIKey,
  generateChatResponse,
  generateChatResponseStream,
  generateDashboard,
  getChatHistory,
  saveChatHistory,
  clearChatHistory,
  getChatSessions,
  getChatSession,
  createChatSession,
  updateChatSession,
  deleteChatSession,
  // Multi-provider config functions
  getMultiProviderConfig,
  setMultiProviderConfig,
  getProviderConfig,
  setProviderConfig,
  removeProviderConfig,
  setActiveProvider,
  setActiveModel,
  type AIConfig,
  type AIMessage,
  type StoredChatMessage,
  type AIMultiProviderConfig,
  type AIProviderConfig
} from '../ai-service'
import { createLogger } from '../lib/logger'

const log = createLogger('ai-handlers')

/**
 * Register AI-related handlers
 */
export function registerAIHandlers(): void {
  // Get AI configuration
  ipcMain.handle('ai:get-config', () => {
    try {
      const config = getAIConfig()
      return { success: true, data: config }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Set AI configuration
  ipcMain.handle('ai:set-config', (_, config: AIConfig) => {
    try {
      setAIConfig(config)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Clear AI configuration
  ipcMain.handle('ai:clear-config', () => {
    try {
      clearAIConfig()
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('ai:get-multi-provider-config', () => {
    try {
      const config = getMultiProviderConfig()
      return { success: true, data: config }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Set multi-provider configuration
  ipcMain.handle('ai:set-multi-provider-config', (_, config: AIMultiProviderConfig | null) => {
    try {
      setMultiProviderConfig(config)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Get configuration for a specific provider
  ipcMain.handle('ai:get-provider-config', (_, provider: string) => {
    try {
      const config = getProviderConfig(provider as AIConfig['provider'])
      return { success: true, data: config }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Set configuration for a specific provider
  ipcMain.handle(
    'ai:set-provider-config',
    (_, { provider, config }: { provider: string; config: AIProviderConfig }) => {
      try {
        setProviderConfig(provider as AIConfig['provider'], config)
        return { success: true }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Remove configuration for a specific provider
  ipcMain.handle('ai:remove-provider-config', (_, provider: string) => {
    try {
      removeProviderConfig(provider as AIConfig['provider'])
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Set the active provider
  ipcMain.handle('ai:set-active-provider', (_, provider: string) => {
    try {
      setActiveProvider(provider as AIConfig['provider'])
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Set the active model for a provider
  ipcMain.handle(
    'ai:set-active-model',
    (_, { provider, model }: { provider: string; model: string }) => {
      try {
        setActiveModel(provider as AIConfig['provider'], model)
        return { success: true }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Validate API key
  ipcMain.handle('ai:validate-key', async (_, config: AIConfig) => {
    try {
      const result = await validateAPIKey(config)
      return { success: true, data: result }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Detect whether the local `claude` CLI is installed (for the BYOH provider)
  ipcMain.handle('ai:detect-harness', async () => {
    try {
      const { detectClaudeCli } = await import('../harness-service')
      return { success: true, data: await detectClaudeCli() }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Generate a whole dashboard spec from a prompt
  ipcMain.handle(
    'ai:generate-dashboard',
    async (
      _,
      {
        prompt,
        schemas,
        dbType,
        connectionId
      }: { prompt: string; schemas: SchemaInfo[]; dbType: string; connectionId?: string }
    ) => {
      try {
        const config = getAIConfig()
        if (!config) return { success: false, error: 'AI not configured.' }
        return await generateDashboard(config, prompt, schemas, dbType, connectionId)
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  // Chat with AI - returns structured JSON response
  ipcMain.handle(
    'ai:chat',
    async (
      _,
      {
        messages,
        schemas,
        dbType,
        connectionId
      }: {
        messages: AIMessage[]
        schemas: SchemaInfo[]
        dbType: string
        connectionId?: string
      }
    ) => {
      log.debug('Received chat request, messages count:', messages.length)

      try {
        const config = getAIConfig()
        if (!config) {
          return { success: false, error: 'AI not configured. Please set up your API key.' }
        }

        const result = await generateChatResponse(config, messages, schemas, dbType, connectionId)

        if (result.success && result.data) {
          return {
            success: true,
            data: result.data, // Returns AIStructuredResponse directly
            meta: result.meta // BYOH grounding info (undefined for AI SDK providers)
          }
        } else {
          return { success: false, error: result.error }
        }
      } catch (error: unknown) {
        log.error('Chat error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Streaming chat: same as ai:chat, but pushes incremental events on
  // 'ai:chat-stream:event' (keyed by requestId) while the invoke resolves with
  // the final structured response. Used by the main chat panel; the modal
  // dialogs keep using the one-shot ai:chat handler above.
  ipcMain.handle(
    'ai:chat-stream',
    async (
      event,
      {
        requestId,
        messages,
        schemas,
        dbType,
        connectionId
      }: {
        requestId: string
        messages: AIMessage[]
        schemas: SchemaInfo[]
        dbType: string
        connectionId?: string
      }
    ) => {
      try {
        const config = getAIConfig()
        if (!config) {
          return { success: false, error: 'AI not configured. Please set up your API key.' }
        }

        const result = await generateChatResponseStream(
          config,
          messages,
          schemas,
          dbType,
          connectionId,
          (streamEvent) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send('ai:chat-stream:event', { requestId, event: streamEvent })
            }
          }
        )

        if (result.success && result.data) {
          return { success: true, data: result.data, meta: result.meta }
        }
        return { success: false, error: result.error }
      } catch (error: unknown) {
        log.error('Chat stream error:', error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.handle('ai:get-chat-history', (_, connectionId: string) => {
    try {
      const history = getChatHistory(connectionId)
      return { success: true, data: history }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Save chat history for a connection
  ipcMain.handle(
    'ai:save-chat-history',
    (_, { connectionId, messages }: { connectionId: string; messages: StoredChatMessage[] }) => {
      try {
        saveChatHistory(connectionId, messages)
        return { success: true }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Clear chat history for a connection
  ipcMain.handle('ai:clear-chat-history', (_, connectionId: string) => {
    try {
      clearChatHistory(connectionId)
      return { success: true }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Get all chat sessions for a connection
  ipcMain.handle('ai:get-sessions', (_, connectionId: string) => {
    try {
      const sessions = getChatSessions(connectionId)
      return { success: true, data: sessions }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // Get a specific chat session
  ipcMain.handle(
    'ai:get-session',
    (_, { connectionId, sessionId }: { connectionId: string; sessionId: string }) => {
      try {
        const session = getChatSession(connectionId, sessionId)
        return { success: true, data: session }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Create a new chat session
  ipcMain.handle(
    'ai:create-session',
    (_, { connectionId, title }: { connectionId: string; title?: string }) => {
      try {
        const session = createChatSession(connectionId, title)
        return { success: true, data: session }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Update a chat session
  ipcMain.handle(
    'ai:update-session',
    (
      _,
      {
        connectionId,
        sessionId,
        updates
      }: {
        connectionId: string
        sessionId: string
        updates: { messages?: StoredChatMessage[]; title?: string }
      }
    ) => {
      try {
        const session = updateChatSession(connectionId, sessionId, updates)
        return { success: true, data: session }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // Delete a chat session
  ipcMain.handle(
    'ai:delete-session',
    (_, { connectionId, sessionId }: { connectionId: string; sessionId: string }) => {
      try {
        const deleted = deleteChatSession(connectionId, sessionId)
        return { success: true, data: deleted }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )
}
