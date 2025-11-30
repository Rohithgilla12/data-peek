# Building an AI-Powered SQL Assistant in Electron

> How we added natural language database queries to data-peek with structured responses, multi-provider support, and persistent chat sessions.

## The Vision

Database tools are powerful but intimidating. Writing SQL requires knowing syntax, remembering table structures, and understanding joins. We wanted to bridge this gap: **ask questions in plain English, get executable SQL back**.

But we didn't stop there. We built a system that understands *intent*:
- "Show me sales trends" → generates a chart
- "Total revenue this month" → returns a formatted metric
- "What tables do I have?" → describes your schema
- "How do I join users and orders?" → explains with SQL

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Renderer Process                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  AI Chat    │  │  AI Store   │  │  Response Renderers │  │
│  │  Panel      │──│  (Zustand)  │──│  (Chart/Metric/SQL) │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │ IPC
┌────────────────────────────┴────────────────────────────────┐
│                      Main Process                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  AI Service │  │  Provider   │  │  Chat Persistence   │  │
│  │  (LLM)      │──│  Adapters   │──│  (electron-store)   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Part 1: Structured Responses with Zod

The key insight: **LLMs can output structured data, not just text**.

We use Zod schemas to define exactly what we expect from the AI:

```typescript
// Five response types, each with specific fields
const responseSchema = z.discriminatedUnion('type', [
  // SQL query with explanation
  z.object({
    type: z.literal('query'),
    sql: z.string(),
    explanation: z.string(),
    warning: z.string().optional()
  }),

  // Chart visualization
  z.object({
    type: z.literal('chart'),
    sql: z.string(),
    chartType: z.enum(['bar', 'line', 'pie', 'area']),
    xKey: z.string(),
    yKeys: z.array(z.string()),
    explanation: z.string()
  }),

  // Single metric value
  z.object({
    type: z.literal('metric'),
    sql: z.string(),
    label: z.string(),
    format: z.enum(['number', 'currency', 'percent', 'duration'])
  }),

  // Schema information
  z.object({
    type: z.literal('schema'),
    tables: z.array(z.object({
      name: z.string(),
      columns: z.array(z.object({
        name: z.string(),
        type: z.string(),
        isPrimaryKey: z.boolean().optional()
      }))
    }))
  }),

  // General conversation
  z.object({
    type: z.literal('message')
  })
])
```

With Vercel's AI SDK, we get type-safe responses:

```typescript
import { generateObject } from 'ai'

const { object } = await generateObject({
  model: openai('gpt-4o'),
  schema: responseSchema,
  messages: conversationHistory,
  system: buildSystemPrompt(schema, dbType)
})

// object is now fully typed!
if (object.type === 'query') {
  // TypeScript knows: object.sql, object.explanation exist
}
```

## Part 2: Multi-Provider Support

We support 5 AI providers without changing application code:

```typescript
function getModel(config: AIConfig) {
  switch (config.provider) {
    case 'openai':
      return openai(config.model)

    case 'anthropic':
      return anthropic(config.model)

    case 'google':
      return google(config.model)

    case 'groq':
      return groq(config.model)

    case 'ollama':
      // Ollama uses OpenAI-compatible API
      return createOpenAI({
        baseURL: config.ollamaUrl + '/v1',
        apiKey: 'ollama' // placeholder
      })(config.model)
  }
}
```

The provider abstraction means users can:
- Use cloud providers (OpenAI, Anthropic, Google, Groq)
- Run locally with Ollama for privacy
- Switch providers without losing chat history

## Part 3: Context-Aware Prompting

The system prompt is dynamically built with:

1. **Database type** - PostgreSQL vs MySQL syntax differences
2. **Full schema** - All tables, columns, types, and relationships
3. **Response guidelines** - When to use each response type
4. **Safety rules** - LIMIT clauses, mutation warnings

```typescript
function buildSystemPrompt(schemas: Schema[], dbType: string): string {
  return `
You are a database assistant for a ${dbType} database.

## Database Schema
${schemas.map(s => formatSchema(s)).join('\n')}

## Response Guidelines
- Use "query" for SELECT statements
- Use "chart" when user asks for trends, comparisons, distributions
- Use "metric" for single values (totals, counts, averages)
- Use "schema" for questions about table structure
- Use "message" for general questions

## SQL Guidelines
- Always include LIMIT 100 unless user specifies
- Add warnings for UPDATE/DELETE statements
- Use proper ${dbType} syntax
- Quote identifiers with special characters
`.trim()
}
```

## Part 4: Inline Query Execution

The magic moment: **execute AI-generated SQL without leaving the chat**.

```tsx
function AIMessage({ message, onExecute }) {
  const [result, setResult] = useState(null)

  async function executeInline() {
    const response = await window.api.db.query(
      message.responseData.sql
    )
    setResult(response.data)
  }

  return (
    <div className="ai-message">
      <SQLPreview sql={message.responseData.sql} />
      <Button onClick={executeInline}>
        Execute
      </Button>
      {result && <ResultsTable data={result} />}
    </div>
  )
}
```

For charts and metrics, we auto-execute:

```tsx
function AIChartMessage({ message }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    // Auto-fetch data when chart message renders
    window.api.db.query(message.responseData.sql)
      .then(res => setData(res.data))
  }, [])

  if (!data) return <Skeleton />

  return (
    <ResponsiveContainer>
      <BarChart data={data}>
        <XAxis dataKey={message.responseData.xKey} />
        {message.responseData.yKeys.map(key => (
          <Bar key={key} dataKey={key} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
```

## Part 5: Chat Persistence

Conversations persist across app restarts using electron-store:

```typescript
// Data model
interface ChatSession {
  id: string
  title: string
  messages: StoredChatMessage[]
  createdAt: string
  updatedAt: string
}

// Storage: per-connection session arrays
// chatHistory[connectionId] = ChatSession[]
```

Key implementation details:

1. **Debounced saves** - 500ms debounce prevents excessive writes
2. **Per-connection** - Each database connection has separate sessions
3. **Auto-titling** - First user message becomes session title
4. **Legacy migration** - Old single-conversation format auto-migrates

```tsx
// Frontend debounced save
const saveSession = useDebouncedCallback(
  async (messages) => {
    await window.api.ai.updateSession(
      connectionId,
      sessionId,
      { messages }
    )
  },
  500
)

// Save on every message change
useEffect(() => {
  if (messages.length > 0) {
    saveSession(messages)
  }
}, [messages])
```

## Part 6: The Component Gallery

### AI Chat Panel (877 lines)
Main interface with session management, message history, and input handling.

### AI Message (436 lines)
Renders responses based on type - SQL preview, charts, metrics, or text.

### AI SQL Preview
Syntax-highlighted SQL with copy and execute buttons.

### AI Chart
Recharts integration for bar, line, pie, and area visualizations.

### AI Metric Card
Formatted single values with number/currency/percent/duration support.

### AI Settings Modal
Provider selection, API key input, model picker.

### AI Suggestions
Context-aware quick actions based on your schema.

## Security Considerations

1. **Encrypted storage** - API keys stored in encrypted electron-store
2. **Local processing** - All requests made directly from user machine
3. **No telemetry** - We never see your queries or data
4. **Ollama option** - Run completely offline with local models

## Lessons Learned

### 1. Structured outputs > prompt engineering
Instead of parsing free-form text, use Zod schemas with the AI SDK. The LLM follows the schema, and you get type safety.

### 2. Context is everything
The system prompt with full schema makes the difference between useless and useful SQL generation.

### 3. Debounce persistence
Real-time saves kill performance. 500ms debounce is the sweet spot.

### 4. Provider abstraction pays off
Supporting multiple providers from day one meant users could choose based on cost, privacy, or preference.

### 5. Auto-execute thoughtfully
Charts and metrics auto-execute because users expect instant results. Queries require explicit execution for safety.

## What's Next

- [ ] Streaming responses for long queries
- [ ] Query suggestions based on history
- [ ] Custom instruction templates
- [ ] Response caching
- [ ] Offline mode with Ollama fallback

---

*This is how we built the AI assistant in data-peek. The code is open source - check out the implementation in `src/main/ai-service.ts` and `src/renderer/src/components/ai/`.*
