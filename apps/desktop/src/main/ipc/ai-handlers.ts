import { ipcMain } from 'electron'
import type { SchemaInfo } from '@shared/index'
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

  // ============================================
  // Multi-Provider AI Configuration
  // ============================================

  // Get multi-provider configuration
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

  // Chat with AI - returns structured JSON response
  ipcMain.handle(
    'ai:chat',
    async (
      _,
      {
        messages,
        schemas,
        dbType
      }: {
        messages: AIMessage[]
        schemas: SchemaInfo[]
        dbType: string
      }
    ) => {
      console.log('[ai-handlers] Received chat request')
      console.log('[ai-handlers] Messages count:', messages.length)

      try {
        const config = getAIConfig()
        if (!config) {
          return { success: false, error: 'AI not configured. Please set up your API key.' }
        }

        const result = await generateChatResponse(config, messages, schemas, dbType)

        if (result.success && result.data) {
          return {
            success: true,
            data: result.data // Returns AIStructuredResponse directly
          }
        } else {
          return { success: false, error: result.error }
        }
      } catch (error: unknown) {
        console.error('[ai-handlers] Error:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // ============================================
  // Chat History and Sessions
  // ============================================

  // Get chat history for a connection
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
