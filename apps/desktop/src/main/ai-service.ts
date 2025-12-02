/**
 * AI Service - Main Process
 *
 * Handles AI provider configuration, API key storage, and structured responses.
 * Uses AI SDK's generateObject for typed JSON output.
 */

import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import type {
  SchemaInfo,
  AIProvider,
  AIConfig,
  AIMessage,
  AIStructuredResponse,
  StoredChatMessage,
  ChatSession
} from '@shared/index'

// Re-export types for main process consumers
export type {
  AIProvider,
  AIConfig,
  AIMessage,
  AIStructuredResponse,
  StoredChatMessage,
  ChatSession
}

// Zod schema for structured output
const responseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('query'),
    message: z.string().describe('A brief explanation of what the query does'),
    sql: z.string().describe('The complete, valid SQL query'),
    explanation: z.string().describe('Detailed explanation of the query'),
    warning: z.string().optional().describe('Warning for mutations or potential issues'),
    requiresConfirmation: z
      .boolean()
      .optional()
      .describe('Set to true for UPDATE, DELETE, DROP, TRUNCATE, or other destructive queries')
  }),
  z.object({
    type: z.literal('chart'),
    message: z.string().describe('Brief description of the visualization'),
    title: z.string().describe('Chart title'),
    description: z.string().optional().describe('Chart description'),
    chartType: z.enum(['bar', 'line', 'pie', 'area']).describe('Chart type based on data nature'),
    sql: z.string().describe('SQL query to fetch chart data'),
    xKey: z.string().describe('Column name for X-axis'),
    yKeys: z.array(z.string()).describe('Column name(s) for Y-axis values')
  }),
  z.object({
    type: z.literal('metric'),
    message: z.string().describe('Brief description of the metric'),
    label: z.string().describe('Metric label'),
    sql: z.string().describe('SQL query that returns a single value'),
    format: z.enum(['number', 'currency', 'percent', 'duration']).describe('Value format')
  }),
  z.object({
    type: z.literal('schema'),
    message: z.string().describe('Explanation of the schema'),
    tables: z.array(z.string()).describe('Table names to display')
  }),
  z.object({
    type: z.literal('message'),
    message: z.string().describe('The response message')
  })
])

import { DpStorage } from './storage'

// Chat history store structure: map of connectionId -> sessions
type ChatHistoryStore = Record<string, ChatSession[]>

let aiStore: DpStorage<{ aiConfig: AIConfig | null }> | null = null
let chatStore: DpStorage<{ chatHistory: ChatHistoryStore }> | null = null

/**
 * Initialize the AI config and chat stores
 */
export async function initAIStore(): Promise<void> {
  aiStore = await DpStorage.create<{ aiConfig: AIConfig | null }>({
    name: 'data-peek-ai-config',
    defaults: {
      aiConfig: null
    }
  })

  chatStore = await DpStorage.create<{ chatHistory: ChatHistoryStore }>({
    name: 'data-peek-ai-chat-history',
    defaults: {
      chatHistory: {}
    }
  })
}

/**
 * Get the current AI configuration
 */
export function getAIConfig(): AIConfig | null {
  if (!aiStore) return null
  return aiStore.get('aiConfig', null)
}

/**
 * Save AI configuration
 */
export function setAIConfig(config: AIConfig | null): void {
  if (!aiStore) return
  aiStore.set('aiConfig', config)
}

/**
 * Clear AI configuration
 */
export function clearAIConfig(): void {
  if (!aiStore) return
  aiStore.set('aiConfig', null)
}

/**
 * Get the AI model instance based on provider
 */
function getModel(config: AIConfig) {
  switch (config.provider) {
    case 'openai': {
      const openai = createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl
      })
      return openai(config.model)
    }

    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: config.apiKey,
        baseURL: config.baseUrl
      })
      return anthropic(config.model)
    }

    case 'google': {
      const google = createGoogleGenerativeAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl
      })
      return google(config.model)
    }

    case 'groq': {
      const groq = createGroq({
        apiKey: config.apiKey,
        baseURL: config.baseUrl
      })
      return groq(config.model)
    }

    case 'ollama': {
      // Ollama uses OpenAI-compatible API
      const ollama = createOpenAI({
        baseURL: config.baseUrl || 'http://localhost:11434/v1',
        apiKey: 'ollama' // Ollama doesn't need a real key
      })
      return ollama(config.model)
    }

    default:
      throw new Error(`Unknown provider: ${config.provider}`)
  }
}

/**
 * Build the system prompt with schema context
 */
function buildSystemPrompt(schemas: SchemaInfo[], dbType: string): string {
  // Build a concise schema representation
  const schemaContext = schemas
    .map((schema) => {
      const tables = schema.tables
        .map((table) => {
          const columns = table.columns
            .map((col) => {
              let colDef = `${col.name}: ${col.dataType}`
              if (col.isPrimaryKey) colDef += ' (PK)'
              if (col.foreignKey) {
                colDef += ` -> ${col.foreignKey.referencedTable}.${col.foreignKey.referencedColumn}`
              }
              return colDef
            })
            .join(', ')
          return `  ${table.name}: [${columns}]`
        })
        .join('\n')
      return `Schema "${schema.name}":\n${tables}`
    })
    .join('\n\n')

  return `You are a helpful database assistant for a ${dbType} database.

## Database Schema

${schemaContext}

## Response Guidelines

Based on the user's request, respond with ONE of these types:

1. **query** - When user asks for data or wants to run a query
   - Generate valid ${dbType} SQL
   - Include LIMIT 100 for SELECT queries unless specified
   - **CRITICAL: For UPDATE, DELETE, DROP, TRUNCATE, or any destructive operation:**
     - Set \`requiresConfirmation: true\`
     - Add a clear warning explaining the impact
     - The query will NOT be auto-executed - user must manually review and run it
   - For INSERT queries, include a warning but requiresConfirmation is optional

2. **chart** - When user asks to visualize, chart, graph, or plot data
   - Choose appropriate chartType: bar (comparisons), line (time trends), pie (proportions ≤8 items), area (cumulative)
   - SQL must return columns matching xKey and yKeys

3. **metric** - When user asks for a single KPI/number (total, count, average)
   - SQL must return exactly one value
   - Choose format: number, currency, percent, or duration

4. **schema** - When user asks about table structure or columns
   - List the relevant table names

5. **message** - For general questions, clarifications, or when no SQL is needed

## SQL Guidelines
- Use proper ${dbType} syntax
- Use table aliases for readability
- Quote identifiers if they contain special characters
- Be precise with JOINs based on foreign key relationships`
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
      maxTokens: 5
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
 * Generate a structured chat response using AI SDK's generateObject
 */
export async function generateChatResponse(
  config: AIConfig,
  messages: AIMessage[],
  schemas: SchemaInfo[],
  dbType: string
): Promise<{
  success: boolean
  data?: AIStructuredResponse
  error?: string
}> {
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
      data: result.object as AIStructuredResponse
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[ai-service] generateChatResponse error:', error)
    return { success: false, error: message }
  }
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
    id: crypto.randomUUID(),
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
    const sessions = migrateLegacyToSessions(data as StoredChatMessage[])
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
    id: crypto.randomUUID(),
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
