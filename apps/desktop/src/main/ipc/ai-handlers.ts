import { ipcMain } from 'electron'
import type { SchemaInfo, AIConfig, AIMessage, StoredChatMessage } from '@shared/index'
import {
  getAIConfig,
  setAIConfig,
  clearAIConfig,
  validateAPIKey,
  streamChatResponse,
  getChatSessions,
  getChatSession,
  createChatSession,
  updateChatSession,
  deleteChatSession
} from '../ai-service'
import { createLogger } from '../lib/logger'

const log = createLogger('ai-handlers')

/**
 * Register AI-related IPC handlers
 */
export function registerAIHandlers(): void {
  // ============================================
  // Configuration
  // ============================================

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

  // Validate API key
  ipcMain.handle('ai:validate-key', async (_, apiKey: string) => {
    try {
      const result = await validateAPIKey(apiKey)
      return { success: true, data: result }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  })

  // ============================================
  // Chat (with streaming)
  // ============================================

  ipcMain.handle(
    'ai:chat',
    async (
      event,
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
      log.debug('Received chat request, messages count:', messages.length)

      try {
        const config = getAIConfig()
        if (!config) {
          return {
            success: false,
            error: 'AI not configured. Please add your Anthropic API key.'
          }
        }

        // Stream text deltas to the renderer
        const onTextDelta = (text: string): void => {
          try {
            event.sender.send('ai:stream-delta', text)
          } catch {
            // Window may have been closed during streaming
          }
        }

        // Signal stream start
        event.sender.send('ai:stream-start')

        const result = await streamChatResponse(config, messages, schemas, dbType, onTextDelta)

        // Signal stream end
        event.sender.send('ai:stream-end')

        if (result.success) {
          return {
            success: true,
            data: {
              text: result.text,
              structured: result.structured
            }
          }
        } else {
          return { success: false, error: result.error }
        }
      } catch (error: unknown) {
        log.error('Chat error:', error)
        event.sender.send('ai:stream-end')
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }
  )

  // ============================================
  // Chat Sessions
  // ============================================

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
