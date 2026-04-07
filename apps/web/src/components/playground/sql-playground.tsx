'use client'

import { useChat } from '@ai-sdk/react'
import { type UIMessage, DefaultChatTransport } from 'ai'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Send,
  Copy,
  Check,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Database,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import Link from 'next/link'

type Dialect = 'PostgreSQL' | 'MySQL' | 'SQL Server'

const DIALECTS: Dialect[] = ['PostgreSQL', 'MySQL', 'SQL Server']

const QUICK_PROMPTS = [
  {
    label: 'User auth schema',
    prompt:
      'Generate a complete user authentication schema with users, sessions, and password reset tokens',
  },
  {
    label: 'Paginated query',
    prompt:
      'Write a performant paginated query for a products table with cursor-based pagination',
  },
  {
    label: 'Analytics query',
    prompt:
      'Generate a query that shows daily active users over the last 30 days with running totals',
  },
  {
    label: 'Explain a JOIN',
    prompt:
      'Explain the difference between INNER JOIN, LEFT JOIN, RIGHT JOIN, and FULL OUTER JOIN with examples',
  },
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(() => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <button
      onClick={copy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-[--color-surface-elevated] hover:bg-[--color-border] text-[--color-text-muted] hover:text-[--color-text-secondary] transition-colors"
      title="Copy"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  )
}

function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g)

  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        const codeMatch = part.match(/^```(\w+)?\n?([\s\S]*?)```$/)
        if (codeMatch) {
          const code = codeMatch[2].trim()
          return (
            <div key={i} className="relative group">
              <pre className="bg-[--color-background] border border-[--color-border] rounded-lg p-4 overflow-x-auto text-sm leading-relaxed">
                <code className="text-[--color-text-secondary]">{code}</code>
              </pre>
              <CopyButton text={code} />
            </div>
          )
        }

        if (!part.trim()) return null

        const formatted = part
          .replace(
            /\*\*(.*?)\*\*/g,
            '<strong class="text-[--color-text-primary] font-semibold">$1</strong>'
          )
          .replace(
            /`(.*?)`/g,
            '<code class="px-1.5 py-0.5 bg-[--color-surface-elevated] rounded text-[--color-accent] text-[0.85em]">$1</code>'
          )

        return (
          <div
            key={i}
            className="text-sm leading-relaxed text-[--color-text-secondary] whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: formatted }}
          />
        )
      })}
    </div>
  )
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

export function SQLPlayground() {
  const [dialect, setDialect] = useState<Dialect>('PostgreSQL')
  const [schema, setSchema] = useState('')
  const [showSchema, setShowSchema] = useState(false)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/ai/chat' }), [])

  const { messages, sendMessage, status, setMessages } = useChat({
    transport,
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim() || isLoading) return
      setInput('')
      sendMessage(
        { text },
        { body: { dialect, schema: schema || undefined } }
      )
    },
    [sendMessage, dialect, schema, isLoading]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend(input)
      }
    },
    [input, handleSend]
  )

  const resetChat = useCallback(() => {
    setMessages([])
    setInput('')
    inputRef.current?.focus()
  }, [setMessages])

  return (
    <div className="max-w-4xl mx-auto">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-1 bg-[--color-surface] rounded-lg p-1 border border-[--color-border]">
          {DIALECTS.map((d) => (
            <button
              key={d}
              onClick={() => setDialect(d)}
              className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                dialect === d
                  ? 'bg-[--color-accent] text-[--color-background] font-medium'
                  : 'text-[--color-text-secondary] hover:text-[--color-text-primary]'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowSchema(!showSchema)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[--color-text-secondary] hover:text-[--color-text-primary] bg-[--color-surface] border border-[--color-border] transition-colors"
        >
          <Database className="w-3.5 h-3.5" />
          Schema context
          {showSchema ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>

        {messages.length > 0 && (
          <button
            onClick={resetChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[--color-text-muted] hover:text-[--color-text-secondary] transition-colors ml-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Schema input */}
      {showSchema && (
        <div className="mb-6 animate-fade-in-up">
          <textarea
            value={schema}
            onChange={(e) => setSchema(e.target.value)}
            placeholder="Paste your CREATE TABLE statements here for schema-aware SQL generation..."
            className="w-full h-32 bg-[--color-surface] border border-[--color-border] rounded-lg p-4 text-sm text-[--color-text-secondary] placeholder:text-[--color-text-muted] resize-none focus:outline-none focus:border-[--color-accent] transition-colors"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
          <p className="text-xs text-[--color-text-muted] mt-1.5">
            The AI will use your schema to generate accurate queries with correct table
            and column names.
          </p>
        </div>
      )}

      {/* Chat area */}
      <div className="bg-[--color-surface] border border-[--color-border] rounded-xl overflow-hidden">
        {/* Messages */}
        <div className="min-h-[400px] max-h-[600px] overflow-y-auto p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[400px] text-center">
              <div className="w-12 h-12 rounded-xl bg-[--color-accent-glow] flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-[--color-accent]" />
              </div>
              <h3
                className="text-lg font-medium text-[--color-text-primary] mb-2"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                AI SQL Playground
              </h3>
              <p className="text-sm text-[--color-text-muted] mb-8 max-w-md">
                Generate SQL from plain English, get explanations for complex queries,
                or fix broken SQL. Powered by AI.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {QUICK_PROMPTS.map((qp) => (
                  <button
                    key={qp.label}
                    onClick={() => handleSend(qp.prompt)}
                    className="text-left px-4 py-3 rounded-lg border border-[--color-border] hover:border-[--color-accent] text-xs text-[--color-text-secondary] hover:text-[--color-text-primary] transition-colors group"
                  >
                    <span className="flex items-center gap-2">
                      {qp.label}
                      <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const text = getMessageText(message)
              if (!text) return null

              return (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] ${
                      message.role === 'user'
                        ? 'bg-[--color-accent] text-[--color-background] rounded-2xl rounded-br-md px-4 py-3'
                        : 'w-full'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <p className="text-sm whitespace-pre-wrap">{text}</p>
                    ) : (
                      <MessageContent content={text} />
                    )}
                  </div>
                </div>
              )
            })
          )}

          {isLoading &&
            messages.length > 0 &&
            messages[messages.length - 1]?.role === 'user' && (
              <div className="flex items-center gap-2 text-[--color-text-muted]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-[--color-border] p-4">
          <div className="flex items-end gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about SQL..."
              rows={1}
              className="flex-1 bg-[--color-surface-elevated] border border-[--color-border] rounded-lg px-4 py-3 text-sm text-[--color-text-primary] placeholder:text-[--color-text-muted] resize-none focus:outline-none focus:border-[--color-accent] transition-colors min-h-[44px] max-h-[120px]"
              style={{
                fontFamily: 'var(--font-mono)',
                height: 'auto',
                overflow: 'hidden',
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement
                target.style.height = 'auto'
                target.style.height = Math.min(target.scrollHeight, 120) + 'px'
              }}
            />
            <Button
              type="button"
              size="icon"
              disabled={isLoading || !input.trim()}
              onClick={() => handleSend(input)}
              className="shrink-0 h-[44px] w-[44px]"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-[--color-text-muted] mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="mt-8 p-6 bg-[--color-surface] border border-[--color-border] rounded-xl text-center">
        <p
          className="text-sm font-medium text-[--color-text-primary] mb-1"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Want schema-aware AI that knows your actual database?
        </p>
        <p className="text-xs text-[--color-text-muted] mb-4">
          data-peek&apos;s built-in AI assistant connects directly to your database for
          context-aware SQL generation, charts, and more.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="secondary" size="sm" asChild>
            <Link href="/download">Download Free</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/#pricing">Get Pro — $29</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
