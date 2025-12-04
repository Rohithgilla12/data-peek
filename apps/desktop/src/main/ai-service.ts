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
// Using flat object instead of discriminatedUnion for Anthropic/OpenAI tool compatibility
// (discriminatedUnion produces anyOf without root type:object which providers reject)
// Using .nullish() instead of .nullable() to accept undefined when fields are missing
const responseSchema = z.object({
  type: z.enum(['query', 'chart', 'metric', 'schema', 'message']).describe('Response type'),
  message: z.string().describe('Brief explanation or response message'),
  // Query fields (null/undefined when type is not query)
  sql: z.string().nullish().describe('SQL query - for query/chart/metric types'),
  explanation: z.string().nullish().describe('Detailed explanation - for query type'),
  warning: z.string().nullish().describe('Warning for mutations - for query type'),
  requiresConfirmation: z
    .boolean()
    .nullish()
    .describe('True for destructive queries - for query type'),
  // Chart fields (null/undefined when type is not chart)
  title: z.string().nullish().describe('Chart title - for chart type'),
  description: z.string().nullish().describe('Chart description - for chart type'),
  chartType: z
    .enum(['bar', 'line', 'pie', 'area'])
    .nullish()
    .describe('Chart type - for chart type'),
  xKey: z.string().nullish().describe('X-axis column - for chart type'),
  yKeys: z.array(z.string()).nullish().describe('Y-axis columns - for chart type'),
  // Metric fields (null/undefined when type is not metric)
  label: z.string().nullish().describe('Metric label - for metric type'),
  format: z
    .enum(['number', 'currency', 'percent', 'duration'])
    .nullish()
    .describe('Value format - for metric type'),
  // Schema fields (null/undefined when type is not schema)
  tables: z.array(z.string()).nullish().describe('Table names - for schema type')
})

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

## Response Format

Set the "type" field and fill ONLY the relevant fields. **IMPORTANT: All fields must be present in the response.** Set unused fields to null (not undefined). Include every field listed below.

### type: "query"
Use when user asks for data or wants to run a query.
- Fill: message, sql, explanation
- Optional: warning, requiresConfirmation (set true for UPDATE/DELETE/DROP/TRUNCATE)
- Null: title, description, chartType, xKey, yKeys, label, format, tables
- Include LIMIT 100 for SELECT queries unless specified

### type: "chart"
Use when user asks to visualize, chart, graph, or plot data.
- Fill: message, sql, title, chartType, xKey, yKeys
- Optional: description
- Null: explanation, warning, requiresConfirmation, label, format, tables
- chartType: bar (comparisons), line (time trends), pie (proportions ≤8 items), area (cumulative)

### type: "metric"
Use when user asks for a single KPI/number (total, count, average).
- Fill: message, sql, label, format
- Null: explanation, warning, requiresConfirmation, title, description, chartType, xKey, yKeys, tables
- format: number, currency, percent, or duration

### type: "schema"
Use when user asks about table structure or columns.
- Fill: message, tables
- Null: sql, explanation, warning, requiresConfirmation, title, description, chartType, xKey, yKeys, label, format

### type: "message"
Use for general questions, clarifications, or when no SQL is needed.
- Fill: message
- Null: ALL other fields

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

    // Normalize undefined to null for consistency
    const normalizedData = {
      ...result.object,
      sql: result.object.sql ?? null,
      explanation: result.object.explanation ?? null,
      warning: result.object.warning ?? null,
      requiresConfirmation: result.object.requiresConfirmation ?? null,
      title: result.object.title ?? null,
      description: result.object.description ?? null,
      chartType: result.object.chartType ?? null,
      xKey: result.object.xKey ?? null,
      yKeys: result.object.yKeys ?? null,
      label: result.object.label ?? null,
      format: result.object.format ?? null,
      tables: result.object.tables ?? null
    }

    return {
      success: true,
      data: normalizedData as AIStructuredResponse
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[ai-service] generateChatResponse error:', JSON.stringify(error, null, 2))

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
