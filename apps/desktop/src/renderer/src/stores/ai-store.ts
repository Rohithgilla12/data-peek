import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AIProvider, AIConfig } from '@shared/index'

// Re-export types for convenience
export type { AIProvider, AIConfig }

// Message types
export interface AIToolInvocation {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  state: 'partial-call' | 'call' | 'result'
  result?: unknown
}

export interface AIChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolInvocations?: AIToolInvocation[]
  createdAt: Date
}

// Conversation for a specific connection
export interface AIConversation {
  connectionId: string
  messages: AIChatMessage[]
  lastUpdated: Date
}

interface AIState {
  // Configuration
  config: AIConfig | null
  isConfigured: boolean

  // UI State
  isPanelOpen: boolean
  isSettingsOpen: boolean
  isLoading: boolean

  // Conversations (keyed by connection ID)
  conversations: Record<string, AIConversation>

  // Actions
  setConfig: (config: AIConfig | null) => void
  clearConfig: () => void

  togglePanel: () => void
  openPanel: () => void
  closePanel: () => void

  openSettings: () => void
  closeSettings: () => void

  setLoading: (loading: boolean) => void

  // Conversation management
  addMessage: (connectionId: string, message: AIChatMessage) => void
  updateMessage: (connectionId: string, messageId: string, updates: Partial<AIChatMessage>) => void
  clearConversation: (connectionId: string) => void
  getConversation: (connectionId: string) => AIChatMessage[]
}

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      // Initial state
      config: null,
      isConfigured: false,
      isPanelOpen: false,
      isSettingsOpen: false,
      isLoading: false,
      conversations: {},

      // Configuration actions
      setConfig: (config) => {
        set({
          config,
          isConfigured: config !== null && (config.provider === 'ollama' || !!config.apiKey)
        })
      },

      clearConfig: () => {
        set({
          config: null,
          isConfigured: false
        })
      },

      // Panel actions
      togglePanel: () => {
        const { isPanelOpen, isConfigured } = get()
        if (!isConfigured && !isPanelOpen) {
          // Open settings if not configured
          set({ isSettingsOpen: true })
        } else {
          set({ isPanelOpen: !isPanelOpen })
        }
      },

      openPanel: () => set({ isPanelOpen: true }),
      closePanel: () => set({ isPanelOpen: false }),

      // Settings actions
      openSettings: () => set({ isSettingsOpen: true }),
      closeSettings: () => set({ isSettingsOpen: false }),

      // Loading state
      setLoading: (loading) => set({ isLoading: loading }),

      // Conversation actions
      addMessage: (connectionId, message) => {
        const { conversations } = get()
        const existing = conversations[connectionId]

        set({
          conversations: {
            ...conversations,
            [connectionId]: {
              connectionId,
              messages: [...(existing?.messages || []), message],
              lastUpdated: new Date()
            }
          }
        })
      },

      updateMessage: (connectionId, messageId, updates) => {
        const { conversations } = get()
        const existing = conversations[connectionId]
        if (!existing) return

        set({
          conversations: {
            ...conversations,
            [connectionId]: {
              ...existing,
              messages: existing.messages.map((msg) =>
                msg.id === messageId ? { ...msg, ...updates } : msg
              ),
              lastUpdated: new Date()
            }
          }
        })
      },

      clearConversation: (connectionId) => {
        const { conversations } = get()
        const newConversations = { ...conversations }
        delete newConversations[connectionId]

        set({ conversations: newConversations })
      },

      getConversation: (connectionId) => {
        const { conversations } = get()
        return conversations[connectionId]?.messages || []
      }
    }),
    {
      name: 'ai-store',
      partialize: (state) => ({
        // Only persist config, not conversations or UI state
        config: state.config,
        isConfigured: state.isConfigured
      })
    }
  )
)

// Selector hooks for performance
export const useAIConfig = () => useAIStore((state) => state.config)
export const useAIConfigured = () => useAIStore((state) => state.isConfigured)
export const useAIPanelOpen = () => useAIStore((state) => state.isPanelOpen)
export const useAISettingsOpen = () => useAIStore((state) => state.isSettingsOpen)
export const useAILoading = () => useAIStore((state) => state.isLoading)
