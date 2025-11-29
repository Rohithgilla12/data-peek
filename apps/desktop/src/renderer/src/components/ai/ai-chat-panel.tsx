'use client'

import * as React from 'react'
import {
  X,
  Settings,
  Sparkles,
  Send,
  Loader2,
  Database,
  DatabaseZap,
  Trash2,
  Lightbulb,
  Maximize2,
  Minimize2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { AIMessage } from './ai-message'
import { AISuggestions } from './ai-suggestions'
import type { ConnectionConfig, SchemaInfo } from '@data-peek/shared'

// Structured AI response types
export type AIResponseType = 'message' | 'query' | 'chart' | 'metric' | 'schema'

export interface AIQueryData {
  type: 'query'
  sql: string
  explanation: string
  warning?: string
}

export interface AIChartData {
  type: 'chart'
  title: string
  description?: string
  chartType: 'bar' | 'line' | 'pie' | 'area'
  sql: string
  xKey: string
  yKeys: string[]
}

export interface AIMetricData {
  type: 'metric'
  label: string
  sql: string
  format: 'number' | 'currency' | 'percent' | 'duration'
}

export interface AISchemaData {
  type: 'schema'
  tables: string[]
}

export type AIResponseData = AIQueryData | AIChartData | AIMetricData | AISchemaData | null

export interface AIChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  responseData?: AIResponseData
  createdAt: Date
}

interface AIChatPanelProps {
  isOpen: boolean
  onClose: () => void
  onOpenSettings: () => void
  connection: ConnectionConfig | null
  schemas: SchemaInfo[]
  isConfigured: boolean
  onOpenInTab: (sql: string) => void
}

export function AIChatPanel({
  isOpen,
  onClose,
  onOpenSettings,
  connection,
  schemas,
  isConfigured,
  onOpenInTab
}: AIChatPanelProps) {
  const [messages, setMessages] = React.useState<AIChatMessage[]>([])
  const [input, setInput] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(false)
  const [isExpanded, setIsExpanded] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const previousConnectionId = React.useRef<string | null>(null)
  const isInitialLoad = React.useRef(true)

  // Load chat history when connection changes
  React.useEffect(() => {
    const connectionId = connection?.id || null

    // Skip if connection hasn't changed
    if (connectionId === previousConnectionId.current) return
    previousConnectionId.current = connectionId

    // Clear messages when no connection
    if (!connectionId) {
      setMessages([])
      return
    }

    // Load chat history for this connection
    const loadHistory = async () => {
      try {
        const response = await window.api.ai.getChatHistory(connectionId)
        if (response.success && response.data) {
          // Convert stored messages to AIChatMessage format
          const loadedMessages: AIChatMessage[] = response.data.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            responseData: m.responseData as AIResponseData,
            createdAt: new Date(m.createdAt)
          }))
          setMessages(loadedMessages)
        }
      } catch (err) {
        console.error('Failed to load chat history:', err)
      }
    }

    loadHistory()
  }, [connection?.id])

  // Save chat history when messages change (debounced)
  React.useEffect(() => {
    const connectionId = connection?.id
    if (!connectionId || messages.length === 0) return

    // Skip initial load to avoid overwriting
    if (isInitialLoad.current) {
      isInitialLoad.current = false
      return
    }

    const saveHistory = async () => {
      try {
        // Convert AIChatMessage to StoredChatMessage format
        const storedMessages = messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          responseData: m.responseData || null,
          createdAt: m.createdAt.toISOString()
        }))
        await window.api.ai.saveChatHistory(connectionId, storedMessages)
      } catch (err) {
        console.error('Failed to save chat history:', err)
      }
    }

    // Debounce save
    const timeoutId = setTimeout(saveHistory, 500)
    return () => clearTimeout(timeoutId)
  }, [messages, connection?.id])

  // Auto-scroll to bottom on new messages
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Focus input when panel opens
  React.useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || !isConfigured || !connection) return

    const userMessage: AIChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      createdAt: new Date()
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // Build message history for AI context
      const aiMessages = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content
      }))

      // Determine database type from connection
      const dbType = connection.dbType || 'postgresql'

      // Call actual AI service via IPC
      const response = await window.api.ai.chat(aiMessages, schemas, dbType)

      if (response.success && response.data) {
        const data = response.data

        // Extract response data based on type
        let responseData: AIResponseData = null
        if (data.type === 'query') {
          responseData = {
            type: 'query',
            sql: data.sql,
            explanation: data.explanation,
            warning: data.warning
          }
        } else if (data.type === 'chart') {
          responseData = {
            type: 'chart',
            title: data.title,
            description: data.description,
            chartType: data.chartType,
            sql: data.sql,
            xKey: data.xKey,
            yKeys: data.yKeys
          }
        } else if (data.type === 'metric') {
          responseData = {
            type: 'metric',
            label: data.label,
            sql: data.sql,
            format: data.format
          }
        } else if (data.type === 'schema') {
          responseData = {
            type: 'schema',
            tables: data.tables
          }
        }

        const assistantMessage: AIChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.message,
          responseData,
          createdAt: new Date()
        }

        setMessages((prev) => [...prev, assistantMessage])
      } else {
        // Show error message
        const errorMessage: AIChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Sorry, I encountered an error: ${response.error || 'Unknown error'}`,
          createdAt: new Date()
        }
        setMessages((prev) => [...prev, errorMessage])
      }
    } catch (error) {
      console.error('AI chat error:', error)
      const errorMessage: AIChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createdAt: new Date()
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion)
    inputRef.current?.focus()
  }

  const handleClearChat = async () => {
    setMessages([])
    // Also clear persisted history
    if (connection?.id) {
      try {
        await window.api.ai.clearChatHistory(connection.id)
      } catch (err) {
        console.error('Failed to clear chat history:', err)
      }
    }
  }

  const panelWidth = isExpanded ? 560 : 420
  const tableCount = schemas.reduce((acc, s) => acc + s.tables.length, 0)

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop with gradient */}
      <div
        className="fixed inset-0 z-40 bg-gradient-to-r from-transparent via-black/20 to-black/40 backdrop-blur-[2px] transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex flex-col',
          'bg-gradient-to-b from-background via-background to-background/95',
          'border-l border-border/50',
          'shadow-2xl shadow-black/20',
          'transition-all duration-300 ease-out'
        )}
        style={{ width: `${panelWidth}px` }}
      >
        {/* Decorative top gradient line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500/0 via-blue-500/70 to-purple-500/0" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-sm" />
              <div className="relative flex items-center justify-center size-8 rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20">
                <Sparkles className="size-4 text-blue-400" />
              </div>
            </div>
            <div>
              <h2 className="font-semibold text-sm">AI Assistant</h2>
              <p className="text-[10px] text-muted-foreground">Powered by your API key</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setIsExpanded(!isExpanded)}
                >
                  {isExpanded ? (
                    <Minimize2 className="size-3.5" />
                  ) : (
                    <Maximize2 className="size-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isExpanded ? 'Collapse' : 'Expand'}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={handleClearChat}
                  disabled={messages.length === 0}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Clear chat</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" onClick={onOpenSettings}>
                  <Settings className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">AI Settings</TooltipContent>
            </Tooltip>

            <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Connection Context Bar */}
        {connection && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30 bg-muted/20">
            <Database className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Connected to</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
              {connection.name || connection.database}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {tableCount} table{tableCount !== 1 ? 's' : ''} available
            </span>
          </div>
        )}

        {/* Not Configured State */}
        {!isConfigured && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="relative mb-4">
              <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-full blur-xl" />
              <div className="relative flex items-center justify-center size-16 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 border border-border">
                <Sparkles className="size-8 text-blue-400/50" />
              </div>
            </div>
            <h3 className="font-semibold mb-2">Configure AI Assistant</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-[280px]">
              Add your API key to start asking questions about your database in natural language.
            </p>
            <Button onClick={onOpenSettings} className="gap-2">
              <Settings className="size-4" />
              Configure API Key
            </Button>
          </div>
        )}

        {/* No Connection State */}
        {isConfigured && !connection && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="relative mb-4">
              <div className="absolute -inset-4 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-full blur-xl" />
              <div className="relative flex items-center justify-center size-16 rounded-full bg-gradient-to-br from-amber-500/5 to-orange-500/5 border border-amber-500/20">
                <DatabaseZap className="size-8 text-amber-400/50" />
              </div>
            </div>
            <h3 className="font-semibold mb-2">Connect to a Database</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-[280px]">
              Select a database connection to start asking questions about your data.
            </p>
            <p className="text-xs text-muted-foreground/60">
              Use <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">⌘P</kbd> to
              open the connection picker
            </p>
          </div>
        )}

        {/* Chat Messages */}
        {isConfigured && connection && (
          <>
            <ScrollArea className="flex-1 px-4" ref={scrollRef}>
              <div className="py-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="relative mb-6">
                      <div className="absolute -inset-3 bg-gradient-to-r from-blue-500/5 to-purple-500/5 rounded-full blur-lg animate-pulse" />
                      <Lightbulb className="relative size-10 text-muted-foreground/30" />
                    </div>
                    <p className="text-sm text-muted-foreground mb-6">
                      Ask me anything about your database
                    </p>

                    {/* Suggestions */}
                    <AISuggestions
                      schemas={schemas}
                      onSelect={handleSuggestionClick}
                    />
                  </div>
                ) : (
                  messages.map((message) => (
                    <AIMessage
                      key={message.id}
                      message={message}
                      onOpenInTab={onOpenInTab}
                      connection={connection}
                      schemas={schemas}
                    />
                  ))
                )}

                {/* Loading indicator */}
                {isLoading && (
                  <div className="flex items-start gap-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
                    <div className="flex items-center justify-center size-7 rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 shrink-0">
                      <Sparkles className="size-3.5 text-blue-400" />
                    </div>
                    <div className="flex items-center gap-2 py-2">
                      <div className="flex gap-1">
                        <span
                          className="size-1.5 rounded-full bg-blue-400 animate-bounce"
                          style={{ animationDelay: '0ms' }}
                        />
                        <span
                          className="size-1.5 rounded-full bg-blue-400 animate-bounce"
                          style={{ animationDelay: '150ms' }}
                        />
                        <span
                          className="size-1.5 rounded-full bg-blue-400 animate-bounce"
                          style={{ animationDelay: '300ms' }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="p-4 border-t border-border/50 bg-gradient-to-t from-muted/20 to-transparent">
              <div
                className={cn(
                  'relative flex items-end gap-2 rounded-xl',
                  'bg-background/80 backdrop-blur-sm',
                  'border border-border/50',
                  'p-2 transition-all duration-200',
                  'focus-within:border-blue-500/30 focus-within:ring-2 focus-within:ring-blue-500/10'
                )}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your data..."
                  rows={1}
                  className={cn(
                    'flex-1 resize-none bg-transparent',
                    'text-sm placeholder:text-muted-foreground/50',
                    'focus:outline-none',
                    'min-h-[36px] max-h-[120px] py-2 px-2'
                  )}
                  style={{
                    height: 'auto',
                    overflow: 'hidden'
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = 'auto'
                    target.style.height = Math.min(target.scrollHeight, 120) + 'px'
                  }}
                />
                <Button
                  size="icon"
                  className={cn(
                    'size-8 rounded-lg shrink-0 transition-all duration-200',
                    input.trim()
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg shadow-blue-500/20'
                      : 'bg-muted text-muted-foreground'
                  )}
                  onClick={handleSendMessage}
                  disabled={!input.trim() || isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground/50 mt-2 text-center">
                Press Enter to send, Shift+Enter for new line
              </p>
            </div>
          </>
        )}
      </div>
    </>
  )
}
