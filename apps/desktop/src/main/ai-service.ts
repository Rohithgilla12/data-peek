/**
 * AI Service - Main Process
 *
 * Uses Anthropic SDK directly for Claude-powered database assistance.
 * Supports streaming responses and structured output via tool use.
 */

import Anthropic from '@anthropic-ai/sdk'
import type {
  SchemaInfo,
  AIConfig,
  AIMessage,
  AIStructuredResponse,
  StoredChatMessage,
  ChatSession
} from '@shared/index'
import { DEFAULT_CLAUDE_MODEL } from '@shared/index'
import { randomUUID } from 'crypto'

// Re-export types for main process consumers
export type { AIConfig, AIMessage, AIStructuredResponse, StoredChatMessage, ChatSession }

import { DpStorage } from './storage'
import { createLogger } from './lib/logger'

const log = createLogger('ai-service')

// Chat history store structure: map of connectionId -> sessions
type ChatHistoryStore = Record<string, ChatSession[]>

// Store types
interface AIStoreData {
  // New simplified config
  aiConfig?: AIConfig | null
  // Legacy multi-provider config (for migration only)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  multiProviderConfig?: any
}

let aiStore: DpStorage<AIStoreData> | null = null
let chatStore: DpStorage<{ chatHistory: ChatHistoryStore }> | null = null

/**
 * Tool definition for structured database responses.
 * Claude uses this tool to return structured data (SQL, charts, metrics, etc.)
 */
const DB_RESPONSE_TOOL: Anthropic.Tool = {
  name: 'db_response',
  description:
    'Respond with structured data for database queries, charts, metrics, or schema info. Use this tool when the user asks about their database, wants to run queries, visualize data, or see schema information.',
  input_schema: {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string',
        enum: ['query', 'chart', 'metric', 'schema'],
        description: 'Response type'
      },
      message: {
        type: 'string',
        description: 'Brief explanation or response message'
      },
      sql: {
        type: 'string',
        description: 'SQL query - for query/chart/metric types'
      },
      explanation: {
        type: 'string',
        description: 'Detailed explanation - for query type'
      },
      warning: {
        type: 'string',
        description: 'Warning for mutations - for query type'
      },
      requiresConfirmation: {
        type: 'boolean',
        description: 'True for destructive queries (UPDATE/DELETE/DROP) - for query type'
      },
      title: { type: 'string', description: 'Chart title - for chart type' },
      description: { type: 'string', description: 'Chart description - for chart type' },
      chartType: {
        type: 'string',
        enum: ['bar', 'line', 'pie', 'area'],
        description: 'Chart type - for chart type'
      },
      xKey: { type: 'string', description: 'X-axis column - for chart type' },
      yKeys: {
        type: 'array',
        items: { type: 'string' },
        description: 'Y-axis columns - for chart type'
      },
      label: { type: 'string', description: 'Metric label - for metric type' },
      format: {
        type: 'string',
        enum: ['number', 'currency', 'percent', 'duration'],
        description: 'Value format - for metric type'
      },
      tables: {
        type: 'array',
        items: { type: 'string' },
        description: 'Table names - for schema type'
      }
    },
    required: ['type', 'message']
  }
}

// ============================================
// Configuration Management
// ============================================

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

  // Migrate legacy multi-provider config
  migrateLegacyConfig()

  chatStore = await DpStorage.create<{ chatHistory: ChatHistoryStore }>({
    name: 'data-peek-ai-chat-history',
    defaults: {
      chatHistory: {}
    }
  })
}

/**
 * Migrate legacy multi-provider config to simplified Claude-only config
 */
function migrateLegacyConfig(): void {
  if (!aiStore) return

  const existingConfig = aiStore.get('aiConfig', null)
  if (existingConfig) return // Already has new config, no migration needed

  // Check for legacy multi-provider config
  const legacyMulti = aiStore.get('multiProviderConfig', null)
  if (!legacyMulti) return

  // Try to extract Anthropic API key from legacy config
  const anthropicConfig = legacyMulti?.providers?.anthropic
  if (anthropicConfig?.apiKey) {
    const model = legacyMulti?.activeModels?.anthropic || DEFAULT_CLAUDE_MODEL
    aiStore.set('aiConfig', {
      apiKey: anthropicConfig.apiKey,
      model
    })
    log.info('Migrated legacy Anthropic config to new format')
  }

  // Clear legacy config
  aiStore.set('multiProviderConfig', null)
}

/**
 * Get the AI configuration
 */
export function getAIConfig(): AIConfig | null {
  if (!aiStore) return null
  return aiStore.get('aiConfig', null) ?? null
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

// ============================================
// Claude API
// ============================================

/**
 * Create an Anthropic client with the user's API key
 */
function createClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey })
}

/**
 * Build the system prompt with schema context
 */
function buildSystemPrompt(schemas: SchemaInfo[], dbType: string): string {
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

## How to Respond

For database-related requests (queries, charts, metrics, schema info), use the db_response tool.
For general conversation, respond with plain text.

### Tool Usage Guide

**type: "query"** — When user asks for data or wants to run a query.
- Required: type, message, sql
- Optional: explanation, warning, requiresConfirmation (set true for UPDATE/DELETE/DROP/TRUNCATE)
- Limit results: ${dbType === 'mssql' ? 'Use SELECT TOP 100 for MSSQL' : 'Include LIMIT 100 at the end'} unless user specifies otherwise

**type: "chart"** — When user asks to visualize, chart, graph, or plot data.
- Required: type, message, sql, title, chartType, xKey, yKeys
- chartType: bar (comparisons), line (time trends), pie (proportions ≤8 items), area (cumulative)

**type: "metric"** — When user asks for a single KPI/number (total, count, average).
- Required: type, message, sql, label, format
- format: number, currency, percent, or duration

**type: "schema"** — When user asks about table structure or columns.
- Required: type, message, tables

## SQL Guidelines
- Use proper ${dbType} syntax
- Use table aliases for readability
- Quote identifiers if they contain special characters
- Be precise with JOINs based on foreign key relationships${
    dbType === 'sqlite'
      ? `
- SQLite specifics: Use double-quotes for identifiers, booleans are 0/1 integers, no RIGHT JOIN`
      : ''
  }`
}

/**
 * Convert AIMessage[] to Anthropic message format.
 * Filters out system messages and ensures alternating user/assistant roles.
 */
function toAnthropicMessages(
  messages: AIMessage[]
): Anthropic.MessageCreateParams['messages'] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }))
}

/**
 * Normalize tool input to AIStructuredResponse format
 */
function normalizeToolInput(input: Record<string, unknown>): AIStructuredResponse {
  return {
    type: (input.type as AIStructuredResponse['type']) || 'message',
    message: (input.message as string) || '',
    sql: (input.sql as string) ?? null,
    explanation: (input.explanation as string) ?? null,
    warning: (input.warning as string) ?? null,
    requiresConfirmation: (input.requiresConfirmation as boolean) ?? null,
    title: (input.title as string) ?? null,
    description: (input.description as string) ?? null,
    chartType: (input.chartType as AIStructuredResponse['chartType']) ?? null,
    xKey: (input.xKey as string) ?? null,
    yKeys: (input.yKeys as string[]) ?? null,
    label: (input.label as string) ?? null,
    format: (input.format as AIStructuredResponse['format']) ?? null,
    tables: (input.tables as string[]) ?? null
  }
}

/**
 * Validate an API key by making a simple request
 */
export async function validateAPIKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const client = createClient(apiKey)
    await client.messages.create({
      model: 'claude-haiku-4-5-20250414',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say "ok"' }]
    })
    return { valid: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    if (message.includes('401') || message.includes('authentication')) {
      return { valid: false, error: 'Invalid API key' }
    }
    if (message.includes('403') || message.includes('permission')) {
      return { valid: false, error: 'API key does not have required permissions' }
    }
    if (message.includes('429')) {
      return { valid: false, error: 'Rate limit exceeded. Please try again later.' }
    }
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
      return { valid: false, error: 'Could not connect to Anthropic API. Check your network.' }
    }

    return { valid: false, error: message }
  }
}

/**
 * Stream a chat response from Claude.
 *
 * Sends text deltas via the onTextDelta callback for live streaming.
 * Returns the complete response with both text and optional structured data.
 */
export async function streamChatResponse(
  config: AIConfig,
  messages: AIMessage[],
  schemas: SchemaInfo[],
  dbType: string,
  onTextDelta: (text: string) => void
): Promise<{
  success: boolean
  text: string
  structured: AIStructuredResponse | null
  error?: string
}> {
  try {
    const client = createClient(config.apiKey)
    const systemPrompt = buildSystemPrompt(schemas, dbType)
    const anthropicMessages = toAnthropicMessages(messages)

    const stream = client.messages.stream({
      model: config.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: anthropicMessages,
      tools: [DB_RESPONSE_TOOL],
      temperature: 0.1
    })

    let fullText = ''

    stream.on('text', (text) => {
      fullText += text
      onTextDelta(text)
    })

    const finalMessage = await stream.finalMessage()

    // Extract structured data from tool use blocks
    let structured: AIStructuredResponse | null = null
    for (const block of finalMessage.content) {
      if (block.type === 'tool_use' && block.name === 'db_response') {
        structured = normalizeToolInput(block.input as Record<string, unknown>)
      }
    }

    return { success: true, text: fullText, structured }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    log.error('streamChatResponse error:', message)
    return { success: false, text: '', structured: null, error: message }
  }
}

/**
 * Generate a non-streaming chat response (fallback)
 */
export async function generateChatResponse(
  config: AIConfig,
  messages: AIMessage[],
  schemas: SchemaInfo[],
  dbType: string
): Promise<{
  success: boolean
  text: string
  structured: AIStructuredResponse | null
  error?: string
}> {
  try {
    const client = createClient(config.apiKey)
    const systemPrompt = buildSystemPrompt(schemas, dbType)
    const anthropicMessages = toAnthropicMessages(messages)

    const response = await client.messages.create({
      model: config.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: anthropicMessages,
      tools: [DB_RESPONSE_TOOL],
      temperature: 0.1
    })

    // Extract text and structured data
    let text = ''
    let structured: AIStructuredResponse | null = null

    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text
      } else if (block.type === 'tool_use' && block.name === 'db_response') {
        structured = normalizeToolInput(block.input as Record<string, unknown>)
      }
    }

    return { success: true, text, structured }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    log.error('generateChatResponse error:', message)
    return { success: false, text: '', structured: null, error: message }
  }
}

// ============================================
// Chat Session Management
// ============================================

/**
 * Generate a title for a chat session based on its first message
 */
function generateSessionTitle(messages: StoredChatMessage[]): string {
  const firstUserMessage = messages.find((m) => m.role === 'user')
  if (!firstUserMessage) return 'New Chat'
  const content = firstUserMessage.content.trim()
  return content.length > 40 ? content.substring(0, 40) + '...' : content
}

/**
 * Check if data is in legacy format (array of messages instead of sessions)
 */
function isLegacyFormat(data: unknown): data is StoredChatMessage[] {
  if (!Array.isArray(data)) return false
  if (data.length === 0) return false
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
    const sessions = migrateLegacyToSessions(data as StoredChatMessage[])
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
  sessions.unshift(session)
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

  if (filtered.length === sessions.length) return false

  history[connectionId] = filtered
  chatStore.set('chatHistory', history)
  return true
}
