/**
 * AI Service - Main Process
 *
 * Handles AI provider configuration, API key storage, and structured responses.
 * Uses AI SDK's generateObject for typed JSON output.
 */

import { generateObject, generateText } from 'ai'
import { createProviderClient } from './ai-providers'
import {
  responseSchema,
  normalizeStructuredResponse,
  buildSystemPrompt,
  providerNeedsKey,
  buildDashboardPrompt,
  dashboardSpecSchema,
  type DashboardSpec
} from './ai-schema'
import type {
  SchemaInfo,
  AIProvider,
  AIConfig,
  AIMessage,
  AIStructuredResponse,
  StoredChatMessage,
  ChatSession,
  AIMultiProviderConfig,
  AIProviderConfig,
  AIChatStreamEvent
} from '@shared/index'
import { DEFAULT_MODELS } from '@shared/index'
import { randomUUID } from 'crypto'

// Re-export types for main process consumers
export type {
  AIProvider,
  AIConfig,
  AIMessage,
  AIStructuredResponse,
  StoredChatMessage,
  ChatSession,
  AIMultiProviderConfig,
  AIProviderConfig
}

import { DpStorage } from './storage'
import { createLogger } from './lib/logger'

const log = createLogger('ai-service')

// Chat history store structure: map of connectionId -> sessions
type ChatHistoryStore = Record<string, ChatSession[]>

// Store types
interface AIStoreData {
  // Legacy single-provider config (for migration)
  aiConfig?: AIConfig | null
  // New multi-provider config
  multiProviderConfig?: AIMultiProviderConfig | null
}

let aiStore: DpStorage<AIStoreData> | null = null
let chatStore: DpStorage<{ chatHistory: ChatHistoryStore }> | null = null

/**
 * Initialize the AI config and chat stores
 */
export async function initAIStore(): Promise<void> {
  aiStore = await DpStorage.create<AIStoreData>({
    name: 'data-peek-ai-config',
    defaults: {
      aiConfig: null,
      multiProviderConfig: null
    }
  })

  // Migrate legacy config to multi-provider format
  migrateLegacyConfig()

  chatStore = await DpStorage.create<{ chatHistory: ChatHistoryStore }>({
    name: 'data-peek-ai-chat-history',
    defaults: {
      chatHistory: {}
    }
  })
}

/**
 * Migrate legacy single-provider config to multi-provider format
 */
function migrateLegacyConfig(): void {
  if (!aiStore) return

  const legacyConfig = aiStore.get('aiConfig', null)
  const multiConfig = aiStore.get('multiProviderConfig', null)

  // If there's a legacy config but no multi-provider config, migrate it
  if (legacyConfig && !multiConfig) {
    const newConfig: AIMultiProviderConfig = {
      providers: {
        [legacyConfig.provider]: {
          apiKey: legacyConfig.apiKey,
          baseUrl: legacyConfig.baseUrl
        }
      },
      activeProvider: legacyConfig.provider,
      activeModels: {
        [legacyConfig.provider]: legacyConfig.model
      }
    }
    aiStore.set('multiProviderConfig', newConfig)
    // Clear legacy config after migration
    aiStore.set('aiConfig', null)
    log.info('Migrated legacy AI config to multi-provider format')
  }
}

/**
 * Get the multi-provider AI configuration
 */
export function getMultiProviderConfig(): AIMultiProviderConfig | null {
  if (!aiStore) return null
  return aiStore.get('multiProviderConfig', null) ?? null
}

/**
 * Save multi-provider AI configuration
 */
export function setMultiProviderConfig(config: AIMultiProviderConfig | null): void {
  if (!aiStore) return
  aiStore.set('multiProviderConfig', config)
}

/**
 * Get configuration for a specific provider
 */
export function getProviderConfig(provider: AIProvider): AIProviderConfig | null {
  const config = getMultiProviderConfig()
  if (!config) return null
  return config.providers[provider] || null
}

/**
 * Set configuration for a specific provider
 */
export function setProviderConfig(provider: AIProvider, providerConfig: AIProviderConfig): void {
  const config = getMultiProviderConfig() || {
    providers: {},
    activeProvider: provider,
    activeModels: {}
  }

  config.providers[provider] = providerConfig

  // If this is the first provider being configured, make it active
  if (!config.providers[config.activeProvider]?.apiKey && providerNeedsKey(provider)) {
    config.activeProvider = provider
  }

  setMultiProviderConfig(config)
}

/**
 * Remove configuration for a specific provider
 */
export function removeProviderConfig(provider: AIProvider): void {
  const config = getMultiProviderConfig()
  if (!config) return

  delete config.providers[provider]
  delete config.activeModels[provider]

  // If we removed the active provider, switch to another configured one
  if (config.activeProvider === provider) {
    const configuredProviders = Object.keys(config.providers) as AIProvider[]
    config.activeProvider = configuredProviders[0] || 'openai'
  }

  setMultiProviderConfig(config)
}

/**
 * Set the active provider
 */
export function setActiveProvider(provider: AIProvider): void {
  const config = getMultiProviderConfig()
  if (!config) return

  config.activeProvider = provider
  setMultiProviderConfig(config)
}

/**
 * Set the active model for a provider
 */
export function setActiveModel(provider: AIProvider, model: string): void {
  const config = getMultiProviderConfig()
  if (!config) return

  config.activeModels[provider] = model
  setMultiProviderConfig(config)
}

/**
 * Get the current AI configuration (legacy format for backward compatibility)
 * Converts multi-provider config to single AIConfig
 */
export function getAIConfig(): AIConfig | null {
  const multiConfig = getMultiProviderConfig()
  if (!multiConfig) return null

  const provider = multiConfig.activeProvider
  const providerConfig = multiConfig.providers[provider]

  // Keyless providers (ollama, claude-cli) run locally without a stored key.
  if (providerNeedsKey(provider) && !providerConfig?.apiKey) {
    return null
  }

  return {
    provider,
    apiKey: providerConfig?.apiKey,
    model: multiConfig.activeModels[provider] || DEFAULT_MODELS[provider],
    baseUrl: providerConfig?.baseUrl
  }
}

/**
 * Save AI configuration (legacy format for backward compatibility)
 * Converts single AIConfig to multi-provider format
 */
export function setAIConfig(config: AIConfig | null): void {
  if (!config) {
    // Don't clear everything when null is passed - use clearAIConfig() for that
    log.debug('setAIConfig called with null, ignoring. Use clearAIConfig() to clear.')
    return
  }

  const multiConfig = getMultiProviderConfig() || {
    providers: {},
    activeProvider: config.provider,
    activeModels: {}
  }

  multiConfig.providers[config.provider] = {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl
  }
  multiConfig.activeProvider = config.provider
  multiConfig.activeModels[config.provider] = config.model

  setMultiProviderConfig(multiConfig)
}

/**
 * Clear AI configuration
 */
export function clearAIConfig(): void {
  if (!aiStore) return
  aiStore.set('multiProviderConfig', null)
}

/**
 * Get the AI model instance based on provider.
 * Thin wrapper around the pure factory in ai-providers.ts (kept as a
 * separate module so it can be unit-tested without Electron).
 */
function getModel(config: AIConfig) {
  return createProviderClient(config)
}

/**
 * Validate an API key by making a simple request
 */
export async function validateAPIKey(
  config: AIConfig
): Promise<{ valid: boolean; error?: string }> {
  try {
    const model = getModel(config)

    // Make a simple request to validate the key
    await generateText({
      model,
      prompt: 'Say "ok"',
      maxOutputTokens: 5
    })

    return { valid: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    // Parse common API errors
    if (message.includes('401') || message.includes('Unauthorized')) {
      return { valid: false, error: 'Invalid API key' }
    }
    if (message.includes('403') || message.includes('Forbidden')) {
      return { valid: false, error: 'API key does not have required permissions' }
    }
    if (message.includes('429')) {
      return { valid: false, error: 'Rate limit exceeded. Please try again later.' }
    }
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
      return { valid: false, error: 'Could not connect to AI provider. Check your network.' }
    }

    return { valid: false, error: message }
  }
}

/**
 * Generate a whole dashboard spec from a prompt. claude-cli grounds it against
 * the live DB via the harness; other providers use generateObject (from schema).
 */
export async function generateDashboard(
  config: AIConfig,
  prompt: string,
  schemas: SchemaInfo[],
  dbType: string,
  connectionId?: string
): Promise<{ success: boolean; spec?: DashboardSpec; error?: string }> {
  if (config.provider === 'claude-cli') {
    if (!connectionId) return { success: false, error: 'No connection selected.' }
    const { generateDashboardViaHarness } = await import('./harness-service')
    return generateDashboardViaHarness(prompt, schemas, dbType, connectionId)
  }
  try {
    const model = getModel(config)
    const result = await generateObject({
      model,
      schema: dashboardSpecSchema,
      system: buildDashboardPrompt(schemas, dbType),
      prompt: prompt || 'Design a useful overview dashboard for this database.',
      temperature: 0.2
    })
    return { success: true, spec: result.object }
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Generate a structured chat response using AI SDK's generateObject
 */
export async function generateChatResponse(
  config: AIConfig,
  messages: AIMessage[],
  schemas: SchemaInfo[],
  dbType: string,
  connectionId?: string
): Promise<{
  success: boolean
  data?: AIStructuredResponse
  error?: string
  meta?: { grounded: boolean; agentic: boolean; turns?: number }
}> {
  // Bring-your-own-harness: the local `claude` CLI isn't an AI SDK model, so it
  // gets its own code path (spawn + parse) rather than generateObject. Given the
  // connection id + a running MCP server it can query the live DB to ground its answer.
  if (config.provider === 'claude-cli') {
    const { generateChatResponseViaHarness } = await import('./harness-service')
    return generateChatResponseViaHarness(config, messages, schemas, dbType, connectionId)
  }

  try {
    const model = getModel(config)
    const systemPrompt = buildSystemPrompt(schemas, dbType)

    // Build the conversation context
    const lastUserMessage = messages[messages.length - 1]
    const conversationContext = messages
      .slice(0, -1)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n')

    const prompt = conversationContext
      ? `Previous conversation:\n${conversationContext}\n\nUser's current request: ${lastUserMessage.content}`
      : lastUserMessage.content

    const result = await generateObject({
      model,
      schema: responseSchema,
      system: systemPrompt,
      prompt,
      temperature: 0.1 // Lower temperature for more consistent SQL generation
    })

    return {
      success: true,
      data: normalizeStructuredResponse(result.object)
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    log.error('generateChatResponse error:', message)

    return { success: false, error: message }
  }
}

/**
 * Streaming chat: for the BYOH `claude-cli` provider, drives the CLI in
 * stream-json mode and forwards incremental events through `onEvent`. Other
 * (AI SDK) providers don't stream here — they run normally and emit their final
 * message as one event so the caller's rendering path stays uniform.
 */
export async function generateChatResponseStream(
  config: AIConfig,
  messages: AIMessage[],
  schemas: SchemaInfo[],
  dbType: string,
  connectionId: string | undefined,
  onEvent: (event: AIChatStreamEvent) => void
): Promise<{
  success: boolean
  data?: AIStructuredResponse
  error?: string
  meta?: { grounded: boolean; agentic: boolean; turns?: number }
}> {
  if (config.provider === 'claude-cli') {
    const { generateChatResponseViaHarnessStream } = await import('./harness-service')
    return generateChatResponseViaHarnessStream(
      config,
      messages,
      schemas,
      dbType,
      connectionId,
      onEvent
    )
  }

  const result = await generateChatResponse(config, messages, schemas, dbType, connectionId)
  if (result.success && result.data) onEvent({ type: 'message', text: result.data.message })
  return result
}

/**
 * Generate a title for a chat session based on its first message
 */
function generateSessionTitle(messages: StoredChatMessage[]): string {
  const firstUserMessage = messages.find((m) => m.role === 'user')
  if (!firstUserMessage) return 'New Chat'
  // Truncate to first 40 characters
  const content = firstUserMessage.content.trim()
  return content.length > 40 ? content.substring(0, 40) + '...' : content
}

/**
 * Check if data is in legacy format (array of messages instead of sessions)
 */
function isLegacyFormat(data: unknown): data is StoredChatMessage[] {
  if (!Array.isArray(data)) return false
  if (data.length === 0) return false
  // Legacy format has messages with 'role' field directly
  // New format has sessions with 'messages' array
  const first = data[0]
  return 'role' in first && !('messages' in first)
}

/**
 * Migrate legacy chat history to new session-based format
 */
function migrateLegacyToSessions(messages: StoredChatMessage[]): ChatSession[] {
  if (messages.length === 0) return []

  const now = new Date().toISOString()
  const session: ChatSession = {
    id: randomUUID(),
    title: generateSessionTitle(messages),
    messages,
    createdAt: messages[0]?.createdAt || now,
    updatedAt: messages[messages.length - 1]?.createdAt || now
  }
  return [session]
}

/**
 * Get all chat sessions for a connection
 */
export function getChatSessions(connectionId: string): ChatSession[] {
  if (!chatStore) return []
  const history = chatStore.get('chatHistory', {})
  const data = history[connectionId]

  if (!data) return []

  // Check for legacy format and migrate if needed
  if (isLegacyFormat(data)) {
    const sessions = migrateLegacyToSessions(data)
    // Save migrated data
    history[connectionId] = sessions
    chatStore.set('chatHistory', history)
    return sessions
  }

  return data as ChatSession[]
}

/**
 * Get a specific chat session
 */
export function getChatSession(connectionId: string, sessionId: string): ChatSession | null {
  const sessions = getChatSessions(connectionId)
  return sessions.find((s) => s.id === sessionId) || null
}

/**
 * Create a new chat session
 */
export function createChatSession(connectionId: string, title?: string): ChatSession {
  const now = new Date().toISOString()
  const session: ChatSession = {
    id: randomUUID(),
    title: title || 'New Chat',
    messages: [],
    createdAt: now,
    updatedAt: now
  }

  if (!chatStore) return session

  const history = chatStore.get('chatHistory', {})
  const sessions = getChatSessions(connectionId)
  sessions.unshift(session) // Add to beginning
  history[connectionId] = sessions
  chatStore.set('chatHistory', history)

  return session
}

/**
 * Update a chat session (messages and title)
 */
export function updateChatSession(
  connectionId: string,
  sessionId: string,
  updates: { messages?: StoredChatMessage[]; title?: string }
): ChatSession | null {
  if (!chatStore) return null

  const history = chatStore.get('chatHistory', {})
  const sessions = getChatSessions(connectionId)
  const index = sessions.findIndex((s) => s.id === sessionId)

  if (index === -1) return null

  const session = sessions[index]
  const now = new Date().toISOString()

  if (updates.messages !== undefined) {
    session.messages = updates.messages
    // Auto-update title if it's the default and we have messages
    if (session.title === 'New Chat' && updates.messages.length > 0) {
      session.title = generateSessionTitle(updates.messages)
    }
  }

  if (updates.title !== undefined) {
    session.title = updates.title
  }

  session.updatedAt = now
  sessions[index] = session
  history[connectionId] = sessions
  chatStore.set('chatHistory', history)

  return session
}

/**
 * Delete a chat session
 */
export function deleteChatSession(connectionId: string, sessionId: string): boolean {
  if (!chatStore) return false

  const history = chatStore.get('chatHistory', {})
  const sessions = getChatSessions(connectionId)
  const filtered = sessions.filter((s) => s.id !== sessionId)

  if (filtered.length === sessions.length) return false // Not found

  history[connectionId] = filtered
  chatStore.set('chatHistory', history)
  return true
}

/**
 * Clear all chat sessions for a connection
 */
export function clearChatSessions(connectionId: string): void {
  if (!chatStore) return
  const history = chatStore.get('chatHistory', {})
  delete history[connectionId]
  chatStore.set('chatHistory', history)
}

/**
 * Clear all chat history
 */
export function clearAllChatHistory(): void {
  if (!chatStore) return
  chatStore.set('chatHistory', {})
}

// Legacy API - kept for backward compatibility but maps to sessions
/**
 * @deprecated Use getChatSessions and session-based APIs instead
 * Get chat history for a connection (returns messages from all sessions combined)
 */
export function getChatHistory(connectionId: string): StoredChatMessage[] {
  const sessions = getChatSessions(connectionId)
  if (sessions.length === 0) return []
  // Return messages from the most recent session
  return sessions[0]?.messages || []
}

/**
 * @deprecated Use updateChatSession instead
 * Save chat history for a connection (updates the most recent session)
 */
export function saveChatHistory(connectionId: string, messages: StoredChatMessage[]): void {
  const sessions = getChatSessions(connectionId)
  if (sessions.length === 0) {
    // Create a new session
    const session = createChatSession(connectionId)
    updateChatSession(connectionId, session.id, { messages })
  } else {
    // Update the most recent session
    updateChatSession(connectionId, sessions[0].id, { messages })
  }
}

/**
 * @deprecated Use clearChatSessions instead
 * Clear chat history for a connection
 */
export function clearChatHistory(connectionId: string): void {
  clearChatSessions(connectionId)
}
