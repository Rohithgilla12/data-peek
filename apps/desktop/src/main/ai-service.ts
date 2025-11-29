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
import type { SchemaInfo } from '@shared/index'

// Types
export type AIProvider = 'openai' | 'anthropic' | 'google' | 'groq' | 'ollama'

export interface AIConfig {
  provider: AIProvider
  apiKey?: string
  model: string
  baseUrl?: string
}

export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// Response types for structured output
export type AIResponseType = 'message' | 'query' | 'chart' | 'metric' | 'schema'

export interface AIQueryResponse {
  type: 'query'
  message: string
  sql: string
  explanation: string
  warning?: string
}

export interface AIChartResponse {
  type: 'chart'
  message: string
  title: string
  description?: string
  chartType: 'bar' | 'line' | 'pie' | 'area'
  sql: string
  xKey: string
  yKeys: string[]
}

export interface AIMetricResponse {
  type: 'metric'
  message: string
  label: string
  sql: string
  format: 'number' | 'currency' | 'percent' | 'duration'
}

export interface AISchemaResponse {
  type: 'schema'
  message: string
  tables: string[]
}

export interface AIMessageResponse {
  type: 'message'
  message: string
}

export type AIStructuredResponse =
  | AIQueryResponse
  | AIChartResponse
  | AIMetricResponse
  | AISchemaResponse
  | AIMessageResponse

// Zod schema for structured output
const responseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('query'),
    message: z.string().describe('A brief explanation of what the query does'),
    sql: z.string().describe('The complete, valid SQL query'),
    explanation: z.string().describe('Detailed explanation of the query'),
    warning: z.string().optional().describe('Warning for mutations or potential issues')
  }),
  z.object({
    type: z.literal('chart'),
    message: z.string().describe('Brief description of the visualization'),
    title: z.string().describe('Chart title'),
    description: z.string().optional().describe('Chart description'),
    chartType: z
      .enum(['bar', 'line', 'pie', 'area'])
      .describe('Chart type based on data nature'),
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

// Stored response data types (without message field since it's in content)
export interface StoredQueryData {
  type: 'query'
  sql: string
  explanation: string
  warning?: string
}

export interface StoredChartData {
  type: 'chart'
  title: string
  description?: string
  chartType: 'bar' | 'line' | 'pie' | 'area'
  sql: string
  xKey: string
  yKeys: string[]
}

export interface StoredMetricData {
  type: 'metric'
  label: string
  sql: string
  format: 'number' | 'currency' | 'percent' | 'duration'
}

export interface StoredSchemaData {
  type: 'schema'
  tables: string[]
}

export type StoredResponseData =
  | StoredQueryData
  | StoredChartData
  | StoredMetricData
  | StoredSchemaData
  | null

// Stored chat message type (with serializable createdAt)
export interface StoredChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  responseData?: StoredResponseData
  createdAt: string // ISO string for storage
}

// Chat history store structure: map of connectionId -> messages
type ChatHistoryStore = Record<string, StoredChatMessage[]>

// Store for AI config (will be initialized with electron-store)
type AIStoreType = import('electron-store').default<{ aiConfig: AIConfig | null }>
type ChatStoreType = import('electron-store').default<{ chatHistory: ChatHistoryStore }>
let aiStore: AIStoreType | null = null
let chatStore: ChatStoreType | null = null

/**
 * Initialize the AI config and chat stores
 */
export async function initAIStore(): Promise<void> {
  const Store = (await import('electron-store')).default

  aiStore = new Store<{ aiConfig: AIConfig | null }>({
    name: 'data-peek-ai-config',
    encryptionKey: 'data-peek-ai-secure-key-v1',
    defaults: {
      aiConfig: null
    }
  })

  chatStore = new Store<{ chatHistory: ChatHistoryStore }>({
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
   - Add warning for mutations (INSERT/UPDATE/DELETE)

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
 * Get chat history for a connection
 */
export function getChatHistory(connectionId: string): StoredChatMessage[] {
  if (!chatStore) return []
  const history = chatStore.get('chatHistory', {})
  return history[connectionId] || []
}

/**
 * Save chat history for a connection
 */
export function saveChatHistory(connectionId: string, messages: StoredChatMessage[]): void {
  if (!chatStore) return
  const history = chatStore.get('chatHistory', {})
  history[connectionId] = messages
  chatStore.set('chatHistory', history)
}

/**
 * Clear chat history for a connection
 */
export function clearChatHistory(connectionId: string): void {
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
