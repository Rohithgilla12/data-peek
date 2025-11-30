# AI Assistant Deep Dive: Components & Patterns

> Technical deep dive into the component architecture, state management, and IPC patterns behind data-peek's AI features.

## The IPC Contract

Electron's process isolation means we need a clear contract between renderer and main. Here's our AI API surface:

```typescript
// Exposed via preload script as window.api.ai
interface AIApi {
  // Configuration
  getConfig(): Promise<AIConfig | null>
  setConfig(config: AIConfig): Promise<void>
  clearConfig(): Promise<void>
  validateKey(config: AIConfig): Promise<{ valid: boolean; error?: string }>

  // Chat generation
  chat(
    messages: AIMessage[],
    schemas: Schema[],
    dbType: string
  ): Promise<IpcResponse<AIChatResponse>>

  // Session management
  getSessions(connectionId: string): Promise<ChatSession[]>
  getSession(connectionId: string, sessionId: string): Promise<ChatSession | null>
  createSession(connectionId: string, title?: string): Promise<ChatSession>
  updateSession(
    connectionId: string,
    sessionId: string,
    updates: Partial<ChatSession>
  ): Promise<ChatSession>
  deleteSession(connectionId: string, sessionId: string): Promise<boolean>
}
```

### The IpcResponse Pattern

Every IPC call returns a consistent shape:

```typescript
interface IpcResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// Usage in renderer
const response = await window.api.ai.chat(messages, schemas, dbType)
if (response.success) {
  // response.data is typed as AIChatResponse
} else {
  // response.error contains the error message
}
```

## State Management with Zustand

We use Zustand for AI state, with selective persistence:

```typescript
// src/renderer/src/stores/ai-store.ts

interface AIState {
  // Persisted to localStorage
  config: AIConfig | null

  // In-memory only (conversations live in electron-store)
  conversations: Map<string, AIConversation>
  isPanelOpen: boolean
  isSettingsOpen: boolean
  isLoading: boolean

  // Actions
  setConfig: (config: AIConfig) => void
  setConversation: (connectionId: string, conversation: AIConversation) => void
  togglePanel: () => void
  // ...
}

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      config: null,
      conversations: new Map(),
      isPanelOpen: false,
      isSettingsOpen: false,
      isLoading: false,

      setConfig: (config) => set({ config }),

      setConversation: (connectionId, conversation) => {
        const conversations = new Map(get().conversations)
        conversations.set(connectionId, conversation)
        set({ conversations })
      },

      togglePanel: () => set((s) => ({ isPanelOpen: !s.isPanelOpen })),
    }),
    {
      name: 'data-peek-ai',
      // Only persist config, not conversations
      partialize: (state) => ({ config: state.config }),
    }
  )
)
```

### Selector Hooks for Performance

Avoid re-renders with targeted selectors:

```typescript
// Bad: subscribes to entire store
const { config, isLoading } = useAIStore()

// Good: subscribes only to what you need
const config = useAIStore((s) => s.config)
const isLoading = useAIStore((s) => s.isLoading)

// Better: custom hooks
export const useAIConfig = () => useAIStore((s) => s.config)
export const useAILoading = () => useAIStore((s) => s.isLoading)
export const useAIPanelOpen = () => useAIStore((s) => s.isPanelOpen)
```

## Component Breakdown

### AIChatPanel - The Orchestrator

This 877-line component manages:
- Session list sidebar
- Message history
- Input handling
- Session CRUD operations
- Keyboard shortcuts

Key patterns:

```tsx
function AIChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSession, setActiveSession] = useState<string | null>(null)
  const [input, setInput] = useState('')

  const connectionId = useConnectionStore((s) => s.activeConnection?.id)
  const schemas = useConnectionStore((s) => s.schemas)

  // Load sessions on connection change
  useEffect(() => {
    if (!connectionId) return

    window.api.ai.getSessions(connectionId).then((sessions) => {
      setSessions(sessions)
      if (sessions.length > 0) {
        // Auto-select most recent
        const mostRecent = sessions.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )[0]
        setActiveSession(mostRecent.id)
        setMessages(mostRecent.messages)
      }
    })
  }, [connectionId])

  // Debounced save
  const saveMessages = useDebouncedCallback(
    async (msgs: ChatMessage[]) => {
      if (!connectionId || !activeSession) return
      await window.api.ai.updateSession(connectionId, activeSession, {
        messages: msgs,
      })
    },
    500
  )

  // Auto-save on message change
  useEffect(() => {
    if (messages.length > 0) {
      saveMessages(messages)
    }
  }, [messages])

  // Send message
  async function handleSend() {
    if (!input.trim() || !connectionId) return

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      createdAt: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')

    const response = await window.api.ai.chat(
      [...messages, userMessage],
      schemas,
      'postgresql'
    )

    if (response.success) {
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.data.text,
        responseData: response.data.structured,
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMessage])
    }
  }

  // Keyboard handling
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (/* ... */)
}
```

### AIMessage - Response Type Router

Routes to the appropriate renderer based on response type:

```tsx
function AIMessage({ message }) {
  const { responseData } = message

  // No structured data = plain text message
  if (!responseData) {
    return <div className="prose">{message.content}</div>
  }

  switch (responseData.type) {
    case 'query':
      return <AIQueryMessage data={responseData} />

    case 'chart':
      return <AIChartMessage data={responseData} />

    case 'metric':
      return <AIMetricMessage data={responseData} />

    case 'schema':
      return <AISchemaMessage data={responseData} />

    case 'message':
    default:
      return <div className="prose">{message.content}</div>
  }
}
```

### AIQueryMessage - SQL with Actions

```tsx
function AIQueryMessage({ data }) {
  const [result, setResult] = useState(null)
  const [isExecuting, setIsExecuting] = useState(false)

  async function executeInline() {
    setIsExecuting(true)
    try {
      const response = await window.api.db.query(data.sql)
      if (response.success) {
        setResult(response.data)
      }
    } finally {
      setIsExecuting(false)
    }
  }

  function openInEditor() {
    // Add to query tab store
    useTabStore.getState().addTab({
      id: crypto.randomUUID(),
      title: 'AI Query',
      content: data.sql,
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{data.explanation}</p>

      <AISQLPreview sql={data.sql} />

      {data.warning && (
        <Alert variant="warning">
          <AlertDescription>{data.warning}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button size="sm" onClick={executeInline} disabled={isExecuting}>
          {isExecuting ? 'Executing...' : 'Execute'}
        </Button>
        <Button size="sm" variant="outline" onClick={openInEditor}>
          Open in Editor
        </Button>
      </div>

      {result && (
        <div className="mt-4 max-h-64 overflow-auto">
          <ResultsTable data={result} />
        </div>
      )}
    </div>
  )
}
```

### AIChartMessage - Auto-Executing Visualization

```tsx
function AIChartMessage({ data }) {
  const [chartData, setChartData] = useState(null)
  const [error, setError] = useState(null)

  // Auto-fetch on mount
  useEffect(() => {
    window.api.db.query(data.sql).then((response) => {
      if (response.success) {
        setChartData(response.data.rows)
      } else {
        setError(response.error)
      }
    })
  }, [data.sql])

  if (error) {
    return <Alert variant="error">{error}</Alert>
  }

  if (!chartData) {
    return <Skeleton className="h-64 w-full" />
  }

  const ChartComponent = {
    bar: BarChart,
    line: LineChart,
    pie: PieChart,
    area: AreaChart,
  }[data.chartType]

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{data.explanation}</p>

      <ResponsiveContainer width="100%" height={300}>
        <ChartComponent data={chartData}>
          <XAxis dataKey={data.xKey} />
          <YAxis />
          <Tooltip />
          <Legend />
          {data.yKeys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              fill={COLORS[i % COLORS.length]}
            />
          ))}
        </ChartComponent>
      </ResponsiveContainer>

      <CollapsibleSQL sql={data.sql} />
    </div>
  )
}
```

## The AI Service (Main Process)

### Provider Factory

```typescript
// src/main/ai-service.ts

import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'

function getLanguageModel(config: AIConfig) {
  switch (config.provider) {
    case 'openai':
      return openai(config.model, { apiKey: config.apiKey })

    case 'anthropic':
      return anthropic(config.model, { apiKey: config.apiKey })

    case 'google':
      return google(config.model, { apiKey: config.apiKey })

    case 'groq':
      return createOpenAI({
        baseURL: 'https://api.groq.com/openai/v1',
        apiKey: config.apiKey,
      })(config.model)

    case 'ollama':
      return createOpenAI({
        baseURL: `${config.ollamaUrl}/v1`,
        apiKey: 'ollama', // Placeholder, not validated
      })(config.model)
  }
}
```

### Structured Generation

```typescript
async function generateChatResponse(
  messages: AIMessage[],
  schemas: Schema[],
  dbType: string,
  config: AIConfig
): Promise<AIChatResponse> {
  const model = getLanguageModel(config)
  const systemPrompt = buildSystemPrompt(schemas, dbType)

  const { object, text } = await generateObject({
    model,
    schema: responseSchema,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    system: systemPrompt,
    temperature: 0.1, // Low for consistent SQL
  })

  return {
    text,
    structured: object,
  }
}
```

### Chat Persistence

```typescript
import Store from 'electron-store'

const chatStore = new Store({
  name: 'data-peek-ai-chat-history',
})

function getChatSessions(connectionId: string): ChatSession[] {
  const history = chatStore.get(`chatHistory.${connectionId}`, [])

  // Migration: old format was array of messages
  if (history.length > 0 && 'role' in history[0]) {
    // Migrate to new session format
    const migrated: ChatSession = {
      id: crypto.randomUUID(),
      title: history[0]?.content?.slice(0, 50) || 'Chat',
      messages: history,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    chatStore.set(`chatHistory.${connectionId}`, [migrated])
    return [migrated]
  }

  return history
}

function updateChatSession(
  connectionId: string,
  sessionId: string,
  updates: Partial<ChatSession>
): ChatSession {
  const sessions = getChatSessions(connectionId)
  const index = sessions.findIndex((s) => s.id === sessionId)

  if (index === -1) throw new Error('Session not found')

  const updated = {
    ...sessions[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  }

  sessions[index] = updated
  chatStore.set(`chatHistory.${connectionId}`, sessions)

  return updated
}
```

## Key Technical Decisions

### 1. Why Zod + generateObject instead of prompt engineering?

Traditional approach:
```
Return JSON with format: { "type": "query", "sql": "..." }
```

Problems:
- LLM might return invalid JSON
- No type safety
- Manual parsing and validation

Our approach with Vercel AI SDK:
```typescript
const { object } = await generateObject({
  schema: zodSchema,
  // ...
})
// object is guaranteed to match schema
```

### 2. Why debounce persistence?

Without debounce, every keystroke in the chat input that triggers a state change could write to disk. With 500ms debounce:
- Batch rapid changes into single writes
- Reduce disk I/O
- Prevent UI jank from blocking operations

### 3. Why separate config vs history stores?

```typescript
// Config store: encrypted
const configStore = new Store({
  name: 'data-peek-ai-config',
  encryptionKey: 'your-key',
})

// History store: not encrypted (no sensitive data)
const chatStore = new Store({
  name: 'data-peek-ai-chat-history',
})
```

API keys need encryption. Chat history doesn't contain secrets and benefits from being readable for debugging.

### 4. Why auto-execute charts but not queries?

- **Charts/Metrics**: User explicitly asked for visualization. They expect to see it immediately. Read-only by nature.
- **Queries**: Could be mutating (UPDATE/DELETE). User should review SQL before execution.

## Testing Considerations

### Unit Testing AI Responses

```typescript
describe('AIMessage', () => {
  it('renders query response with SQL preview', () => {
    const message = {
      responseData: {
        type: 'query',
        sql: 'SELECT * FROM users',
        explanation: 'Gets all users',
      },
    }

    render(<AIMessage message={message} />)

    expect(screen.getByText('SELECT * FROM users')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /execute/i })).toBeInTheDocument()
  })
})
```

### Mocking the AI Service

```typescript
// In tests
vi.mock('@/preload', () => ({
  api: {
    ai: {
      chat: vi.fn().mockResolvedValue({
        success: true,
        data: {
          text: 'Here is your query',
          structured: {
            type: 'query',
            sql: 'SELECT 1',
            explanation: 'Test',
          },
        },
      }),
    },
  },
}))
```

## Performance Optimizations Applied

1. **Lazy rendering** - Chart data fetched only when message scrolls into view
2. **Virtual list** - For long conversation histories (not yet implemented)
3. **Memoized components** - Prevent re-renders of unchanged messages
4. **Selective persistence** - Only config in localStorage, conversations in electron-store
5. **Staggered animations** - 50ms delays prevent layout thrash

---

*These patterns form the foundation of data-peek's AI assistant. The combination of structured outputs, clear IPC contracts, and thoughtful state management makes the feature both powerful and maintainable.*
