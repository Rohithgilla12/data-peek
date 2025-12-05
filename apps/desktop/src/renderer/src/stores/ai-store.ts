import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AIProvider, AIConfig, AIMultiProviderConfig, AIProviderConfig } from '@shared/index'

// Re-export types for convenience
export type { AIProvider, AIConfig, AIMultiProviderConfig, AIProviderConfig }

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
  // Multi-provider Configuration
  multiProviderConfig: AIMultiProviderConfig | null
  isConfigured: boolean

  // Legacy config (for backward compatibility during transition)
  config: AIConfig | null

  // UI State
  isPanelOpen: boolean
  isSettingsOpen: boolean
  isLoading: boolean

  // Conversations (keyed by connection ID)
  conversations: Record<string, AIConversation>

  // Legacy Actions (kept for backward compatibility)
  setConfig: (config: AIConfig | null) => void
  clearConfig: () => void

  // Multi-provider Actions
  setMultiProviderConfig: (config: AIMultiProviderConfig | null) => void
  setProviderConfig: (provider: AIProvider, config: AIProviderConfig) => void
  removeProviderConfig: (provider: AIProvider) => void
  setActiveProvider: (provider: AIProvider) => void
  setActiveModel: (provider: AIProvider, model: string) => void
  loadConfigFromMain: () => Promise<void>

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

// Default models for each provider (must match main process)
const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5-20250929',
  google: 'gemini-2.5-flash',
  groq: 'llama-3.3-70b-versatile',
  ollama: 'llama3.2'
}

// Helper to check if multi-provider config is valid
const isMultiProviderConfigured = (config: AIMultiProviderConfig | null): boolean => {
  if (!config?.providers || !config.activeProvider) return false
  const activeConfig = config.providers[config.activeProvider]
  if (!activeConfig) return false
  if (config.activeProvider === 'ollama') {
    // Ollama works with default localhost URL, so just check if config exists
    return true
  }
  return !!activeConfig.apiKey
}

// Helper to derive legacy AIConfig from multi-provider config
const deriveLegacyConfig = (multiConfig: AIMultiProviderConfig | null): AIConfig | null => {
  if (!multiConfig?.providers || !multiConfig.activeProvider) return null
  const providerConfig = multiConfig.providers[multiConfig.activeProvider]
  if (!providerConfig) return null

  return {
    provider: multiConfig.activeProvider,
    apiKey: providerConfig.apiKey,
    model:
      multiConfig.activeModels?.[multiConfig.activeProvider] ||
      DEFAULT_MODELS[multiConfig.activeProvider],
    baseUrl: providerConfig.baseUrl
  }
}

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      // Initial state
      multiProviderConfig: null,
      config: null,
      isConfigured: false,
      isPanelOpen: false,
      isSettingsOpen: false,
      isLoading: false,
      conversations: {},

      // Legacy configuration actions (for backward compatibility)
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

      // Multi-provider configuration actions
      setMultiProviderConfig: (config) => {
        set({
          multiProviderConfig: config,
          config: deriveLegacyConfig(config),
          isConfigured: isMultiProviderConfigured(config)
        })
      },

      setProviderConfig: (provider, providerConfig) => {
        const { multiProviderConfig } = get()
        const newConfig: AIMultiProviderConfig = {
          providers: {
            ...(multiProviderConfig?.providers || {}),
            [provider]: providerConfig
          },
          activeProvider: multiProviderConfig?.activeProvider || provider,
          activeModels: multiProviderConfig?.activeModels || {}
        }
        set({
          multiProviderConfig: newConfig,
          config: deriveLegacyConfig(newConfig),
          isConfigured: isMultiProviderConfigured(newConfig)
        })
      },

      removeProviderConfig: (provider) => {
        const { multiProviderConfig } = get()
        if (!multiProviderConfig) return

        const newProviders = { ...multiProviderConfig.providers }
        delete newProviders[provider]

        // If removing active provider, switch to first available
        let newActiveProvider = multiProviderConfig.activeProvider
        if (provider === multiProviderConfig.activeProvider) {
          const remainingProviders = Object.keys(newProviders) as AIProvider[]
          newActiveProvider = remainingProviders[0] || 'openai'
        }

        const newConfig: AIMultiProviderConfig = {
          providers: newProviders,
          activeProvider: newActiveProvider,
          activeModels: multiProviderConfig.activeModels
        }

        set({
          multiProviderConfig: newConfig,
          config: deriveLegacyConfig(newConfig),
          isConfigured: isMultiProviderConfigured(newConfig)
        })
      },

      setActiveProvider: (provider) => {
        const { multiProviderConfig } = get()
        if (!multiProviderConfig) return

        const newConfig: AIMultiProviderConfig = {
          ...multiProviderConfig,
          activeProvider: provider
        }

        set({
          multiProviderConfig: newConfig,
          config: deriveLegacyConfig(newConfig),
          isConfigured: isMultiProviderConfigured(newConfig)
        })
      },

      setActiveModel: (provider, model) => {
        const { multiProviderConfig } = get()
        if (!multiProviderConfig) return

        const newConfig: AIMultiProviderConfig = {
          ...multiProviderConfig,
          activeModels: {
            ...(multiProviderConfig.activeModels || {}),
            [provider]: model
          }
        }

        set({
          multiProviderConfig: newConfig,
          config: deriveLegacyConfig(newConfig),
          isConfigured: isMultiProviderConfigured(newConfig)
        })
      },

      loadConfigFromMain: async () => {
        try {
          const result = await window.api.ai.getMultiProviderConfig()
          if (result.success && result.data) {
            set({
              multiProviderConfig: result.data,
              config: deriveLegacyConfig(result.data),
              isConfigured: isMultiProviderConfigured(result.data)
            })
          }
        } catch (error) {
          console.error('Failed to load AI config from main:', error)
        }
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
        // Only persist multi-provider config, not conversations or UI state
        multiProviderConfig: state.multiProviderConfig,
        isConfigured: state.isConfigured
      })
    }
  )
)

// Selector hooks for performance
export const useAIConfig = () => useAIStore((state) => state.config)
export const useAIMultiProviderConfig = () => useAIStore((state) => state.multiProviderConfig)
export const useAIConfigured = () => useAIStore((state) => state.isConfigured)
export const useAIPanelOpen = () => useAIStore((state) => state.isPanelOpen)
export const useAISettingsOpen = () => useAIStore((state) => state.isSettingsOpen)
export const useAILoading = () => useAIStore((state) => state.isLoading)
