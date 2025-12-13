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
  Minimize2,
  Plus,
  MessageSquare,
  ChevronLeft,
  MoreHorizontal,
  Pencil,
  Check
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { AIMessage } from './ai-message'
import { AISuggestions } from './ai-suggestions'
import type { ConnectionConfig, SchemaInfo } from '@data-peek/shared'

// Chat session type (matching preload)
interface ChatSession {
  id: string
  title: string
  messages: StoredChatMessage[]
  createdAt: string
  updatedAt: string
}

// Stored message type (matching preload)
interface StoredChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  responseData?: AIResponseData
  createdAt: string
}

// Structured AI response types
export type AIResponseType = 'message' | 'query' | 'chart' | 'metric' | 'schema'

export interface AIQueryData {
  type: 'query'
  sql: string
  explanation: string
  warning?: string
  /** If true, query should NOT be auto-executed (UPDATE/DELETE operations) */
  requiresConfirmation?: boolean
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
  const [showSessionsList, setShowSessionsList] = React.useState(false)
  const [sessions, setSessions] = React.useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = React.useState<string | null>(null)
  const [editingSessionId, setEditingSessionId] = React.useState<string | null>(null)
  const [editingTitle, setEditingTitle] = React.useState('')
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const previousConnectionId = React.useRef<string | null>(null)
  const isInitialLoad = React.useRef(true)

  // Load sessions when connection changes
  React.useEffect(() => {
    const connectionId = connection?.id || null

    // Skip if connection hasn't changed
    if (connectionId === previousConnectionId.current) return
    previousConnectionId.current = connectionId
    isInitialLoad.current = true

    // Clear state when no connection
    if (!connectionId) {
      setMessages([])
      setSessions([])
      setCurrentSessionId(null)
      return
    }

    // Load sessions for this connection
    const loadSessions = async () => {
      try {
        const response = await window.api.ai.getSessions(connectionId)
        if (response.success && response.data) {
          setSessions(response.data)
          // Select the most recent session, or create a new one
          if (response.data.length > 0) {
            const latestSession = response.data[0]
            setCurrentSessionId(latestSession.id)
            // Convert stored messages to AIChatMessage format
            const loadedMessages: AIChatMessage[] = latestSession.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              responseData: m.responseData as AIResponseData,
              createdAt: new Date(m.createdAt)
            }))
            setMessages(loadedMessages)
          } else {
            // No sessions exist, create one
            const createResponse = await window.api.ai.createSession(connectionId)
            if (createResponse.success && createResponse.data) {
              setSessions([createResponse.data])
              setCurrentSessionId(createResponse.data.id)
              setMessages([])
            }
          }
        }
      } catch (err) {
        console.error('Failed to load chat sessions:', err)
      }
    }

    loadSessions()
  }, [connection?.id])

  // Save messages when they change (debounced)
  React.useEffect(() => {
    const connectionId = connection?.id
    if (!connectionId || !currentSessionId) return

    // Skip initial load to avoid overwriting
    if (isInitialLoad.current) {
      isInitialLoad.current = false
      return
    }

    const saveSession = async () => {
      try {
        // Convert AIChatMessage to StoredChatMessage format
        const storedMessages = messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          responseData: m.responseData || null,
          createdAt: m.createdAt.toISOString()
        }))
        const response = await window.api.ai.updateSession(connectionId, currentSessionId, {
          messages: storedMessages
        })
        // Update sessions list with new title if it changed
        if (response.success && response.data) {
          setSessions((prev) => prev.map((s) => (s.id === currentSessionId ? response.data! : s)))
        }
      } catch (err) {
        console.error('Failed to save chat session:', err)
      }
    }

    // Debounce save
    const timeoutId = setTimeout(saveSession, 500)
    return () => clearTimeout(timeoutId)
  }, [messages, connection?.id, currentSessionId])

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
        // Note: Backend uses flat schema with nullable fields for AI provider compatibility
        let responseData: AIResponseData = null
        if (data.type === 'query' && data.sql && data.explanation) {
          responseData = {
            type: 'query',
            sql: data.sql,
            explanation: data.explanation,
            warning: data.warning ?? undefined,
            requiresConfirmation: data.requiresConfirmation ?? undefined
          }
        } else if (
          data.type === 'chart' &&
          data.title &&
          data.chartType &&
          data.sql &&
          data.xKey &&
          data.yKeys
        ) {
          responseData = {
            type: 'chart',
            title: data.title,
            description: data.description ?? undefined,
            chartType: data.chartType,
            sql: data.sql,
            xKey: data.xKey,
            yKeys: data.yKeys
          }
        } else if (data.type === 'metric' && data.label && data.sql && data.format) {
          responseData = {
            type: 'metric',
            label: data.label,
            sql: data.sql,
            format: data.format
          }
        } else if (data.type === 'schema' && data.tables) {
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

  // Create a new chat session
  const handleNewSession = async () => {
    if (!connection?.id) return
    try {
      const response = await window.api.ai.createSession(connection.id)
      if (response.success && response.data) {
        setSessions((prev) => [response.data!, ...prev])
        setCurrentSessionId(response.data.id)
        setMessages([])
        setShowSessionsList(false)
      }
    } catch (err) {
      console.error('Failed to create new session:', err)
    }
  }

  // Switch to a different session
  const handleSwitchSession = async (sessionId: string) => {
    if (!connection?.id || sessionId === currentSessionId) return
    const session = sessions.find((s) => s.id === sessionId)
    if (session) {
      setCurrentSessionId(sessionId)
      // Convert stored messages to AIChatMessage format
      const loadedMessages: AIChatMessage[] = session.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        responseData: m.responseData as AIResponseData,
        createdAt: new Date(m.createdAt)
      }))
      setMessages(loadedMessages)
      isInitialLoad.current = true
      setShowSessionsList(false)
    }
  }

  // Delete a session
  const handleDeleteSession = async (sessionId: string) => {
    if (!connection?.id) return
    try {
      const response = await window.api.ai.deleteSession(connection.id, sessionId)
      if (response.success) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId))
        // If we deleted the current session, switch to another or create new
        if (sessionId === currentSessionId) {
          const remainingSessions = sessions.filter((s) => s.id !== sessionId)
          if (remainingSessions.length > 0) {
            handleSwitchSession(remainingSessions[0].id)
          } else {
            handleNewSession()
          }
        }
      }
    } catch (err) {
      console.error('Failed to delete session:', err)
    }
  }

  // Start editing a session title
  const handleStartEditTitle = (session: ChatSession) => {
    setEditingSessionId(session.id)
    setEditingTitle(session.title)
  }

  // Save edited title
  const handleSaveTitle = async () => {
    if (!connection?.id || !editingSessionId) return
    try {
      const response = await window.api.ai.updateSession(connection.id, editingSessionId, {
        title: editingTitle
      })
      if (response.success && response.data) {
        setSessions((prev) => prev.map((s) => (s.id === editingSessionId ? response.data! : s)))
      }
    } catch (err) {
      console.error('Failed to update session title:', err)
    } finally {
      setEditingSessionId(null)
      setEditingTitle('')
    }
  }

  // Clear current session's chat
  const handleClearChat = async () => {
    setMessages([])
    if (connection?.id && currentSessionId) {
      try {
        await window.api.ai.updateSession(connection.id, currentSessionId, { messages: [] })
      } catch (err) {
        console.error('Failed to clear session:', err)
      }
    }
  }

  // Get current session
  const currentSession = sessions.find((s) => s.id === currentSessionId)
  const panelWidth = isExpanded ? 560 : 420
  const tableCount = schemas.reduce((acc, s) => acc + s.tables.length, 0)

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop with gradient */}
      <div
        className="fixed inset-0 z-40 bg-gradient-to-r from-transparent via-black/20 to-black/40 transition-opacity duration-300"
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
            {showSessionsList ? (
              // Back button when showing sessions list
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setShowSessionsList(false)}
              >
                <ChevronLeft className="size-4" />
              </Button>
            ) : (
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-sm" />
                <div className="relative flex items-center justify-center size-8 rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20">
                  <Sparkles className="size-4 text-blue-400" />
                </div>
              </div>
            )}
            <div className="flex-1 min-w-0">
              {showSessionsList ? (
                <h2 className="font-semibold text-sm">Chat Sessions</h2>
              ) : (
                <>
                  <button
                    onClick={() => connection && setShowSessionsList(true)}
                    className="font-semibold text-sm hover:text-blue-400 transition-colors flex items-center gap-1.5 truncate max-w-[200px]"
                    disabled={!connection}
                  >
                    <MessageSquare className="size-3 shrink-0" />
                    <span className="truncate">{currentSession?.title || 'AI Assistant'}</span>
                  </button>
                  <p className="text-[10px] text-muted-foreground">
                    {sessions.length} chat{sessions.length !== 1 ? 's' : ''} • Click to switch
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {!showSessionsList && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={handleNewSession}
                      disabled={!connection}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">New chat</TooltipContent>
                </Tooltip>

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
              </>
            )}

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
        {connection && !showSessionsList && (
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

        {/* Sessions List View */}
        {showSessionsList && isConfigured && connection && (
          <div className="flex-1 flex flex-col">
            {/* New Chat Button */}
            <div className="p-4 border-b border-border/30">
              <Button
                onClick={handleNewSession}
                className="w-full gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
              >
                <Plus className="size-4" />
                New Chat
              </Button>
            </div>

            {/* Sessions List */}
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {sessions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <MessageSquare className="size-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No chat sessions yet</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      Click &quot;New Chat&quot; to start a conversation
                    </p>
                  </div>
                ) : (
                  sessions.map((session) => (
                    <div
                      key={session.id}
                      className={cn(
                        'group flex items-start gap-2 p-3 rounded-lg cursor-pointer transition-all',
                        session.id === currentSessionId
                          ? 'bg-blue-500/10 border border-blue-500/20'
                          : 'hover:bg-muted/50'
                      )}
                      onClick={() => handleSwitchSession(session.id)}
                    >
                      <MessageSquare
                        className={cn(
                          'size-4 shrink-0 mt-0.5',
                          session.id === currentSessionId
                            ? 'text-blue-400'
                            : 'text-muted-foreground'
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        {editingSessionId === session.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveTitle()
                                if (e.key === 'Escape') setEditingSessionId(null)
                              }}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                              className="flex-1 text-sm bg-background border border-border rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-6"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSaveTitle()
                              }}
                            >
                              <Check className="size-3" />
                            </Button>
                          </div>
                        ) : (
                          <p className="text-sm font-medium truncate">{session.title}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {session.messages.length} message
                          {session.messages.length !== 1 ? 's' : ''} •{' '}
                          {new Date(session.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      {editingSessionId !== session.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                handleStartEditTitle(session)
                              }}
                            >
                              <Pencil className="size-3.5 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteSession(session.id)
                              }}
                              className="text-red-500 focus:text-red-500"
                            >
                              <Trash2 className="size-3.5 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
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
        {isConfigured && connection && !showSessionsList && (
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
                    <AISuggestions schemas={schemas} onSelect={handleSuggestionClick} />
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
