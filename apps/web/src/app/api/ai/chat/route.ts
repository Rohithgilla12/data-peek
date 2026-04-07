import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'

export const maxDuration = 30

const SYSTEM_PROMPT = `You are an expert SQL assistant for data-peek, a fast database client for developers. You help developers write, understand, and fix SQL.

Guidelines:
- Always wrap SQL in fenced code blocks with \`\`\`sql
- Use proper indentation and formatting
- Be concise and direct — developers don't need hand-holding
- When generating SQL, consider performance (indexes, query plans)
- When explaining SQL, break it down clause by clause
- When fixing SQL, show what was wrong and the corrected version
- If a schema context is provided, use the exact table/column names from it
- Default to standard SQL unless a specific dialect is requested`

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const windowMs = 60 * 60 * 1000 // 1 hour
  const maxRequests = 30

  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= maxRequests) {
    return false
  }

  entry.count++
  return true
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  if (!checkRateLimit(ip)) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { messages, dialect, schema } = await req.json()

  let systemMessage = SYSTEM_PROMPT
  systemMessage += `\n\nTarget SQL dialect: ${dialect || 'PostgreSQL'}`

  if (schema) {
    systemMessage += `\n\nUser's database schema:\n\`\`\`sql\n${schema}\n\`\`\``
  }

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: systemMessage,
    messages,
    maxOutputTokens: 2048,
  })

  return result.toUIMessageStreamResponse()
}
