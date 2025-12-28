import { create } from 'zustand'
import type {
  ConnectionConfig,
  SchemaInfo,
  AgentSession,
  AgentStep,
  AgentSessionStatus,
  CreateWidgetInput
} from '@shared/index'

export interface PendingApproval {
  sessionId: string
  stepId: string
  tool: string
  sql: string
  reason: string
}

interface AgentState {
  isAgentMode: boolean
  activeSession: AgentSession | null
  pendingApproval: PendingApproval | null
  streamingText: string
  pendingWidgets: CreateWidgetInput[]

  setAgentMode: (enabled: boolean) => void
  startSession: (
    connectionConfig: ConnectionConfig,
    prompt: string,
    schemas: SchemaInfo[]
  ) => Promise<{ sessionId: string } | null>
  approveToolCall: () => Promise<boolean>
  declineToolCall: () => Promise<boolean>
  cancelSession: () => Promise<boolean>
  subscribeToEvents: () => () => void
  clearSession: () => void
}

export const useAgentStore = create<AgentState>((set, get) => ({
  isAgentMode: false,
  activeSession: null,
  pendingApproval: null,
  streamingText: '',
  pendingWidgets: [],

  setAgentMode: (enabled) => {
    set({ isAgentMode: enabled })
    if (!enabled) {
      set({
        activeSession: null,
        pendingApproval: null,
        streamingText: '',
        pendingWidgets: []
      })
    }
  },

  startSession: async (connectionConfig, prompt, schemas) => {
    try {
      set({
        activeSession: null,
        pendingApproval: null,
        streamingText: '',
        pendingWidgets: []
      })

      const result = await window.api.agent.start(connectionConfig, prompt, schemas)

      if (result.success && result.data) {
        set({
          activeSession: {
            id: result.data.sessionId,
            connectionId: connectionConfig.id,
            prompt,
            status: 'running',
            steps: [],
            startedAt: Date.now()
          }
        })
        return result.data
      }

      console.error('Failed to start agent session:', result.error)
      return null
    } catch (error) {
      console.error('Failed to start agent session:', error)
      return null
    }
  },

  approveToolCall: async () => {
    const { activeSession, pendingApproval } = get()
    if (!activeSession || !pendingApproval) return false

    try {
      const result = await window.api.agent.approveTool(activeSession.id)
      if (result.success) {
        set({ pendingApproval: null })
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to approve tool call:', error)
      return false
    }
  },

  declineToolCall: async () => {
    const { activeSession, pendingApproval } = get()
    if (!activeSession || !pendingApproval) return false

    try {
      const result = await window.api.agent.declineTool(activeSession.id)
      if (result.success) {
        set({ pendingApproval: null })
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to decline tool call:', error)
      return false
    }
  },

  cancelSession: async () => {
    const { activeSession } = get()
    if (!activeSession) return false

    try {
      const result = await window.api.agent.cancel(activeSession.id)
      if (result.success) {
        set({
          activeSession: {
            ...activeSession,
            status: 'cancelled',
            completedAt: Date.now()
          },
          pendingApproval: null
        })
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to cancel agent session:', error)
      return false
    }
  },

  subscribeToEvents: () => {
    const unsubSessionStarted = window.api.agent.onSessionStarted((data) => {
      const { activeSession } = get()
      if (activeSession && activeSession.id === data.sessionId) {
        set({
          activeSession: {
            ...activeSession,
            status: 'running'
          }
        })
      }
    })

    const unsubToolCall = window.api.agent.onToolCall((event) => {
      const { activeSession } = get()
      if (!activeSession || activeSession.id !== event.sessionId) return

      const newStep: AgentStep = {
        id: event.stepId,
        toolName: event.tool,
        args: event.args,
        status: 'running',
        startedAt: Date.now()
      }

      set({
        activeSession: {
          ...activeSession,
          steps: [...activeSession.steps, newStep]
        }
      })
    })

    const unsubToolResult = window.api.agent.onToolResult((event) => {
      const { activeSession } = get()
      if (!activeSession || activeSession.id !== event.sessionId) return

      const updatedSteps = activeSession.steps.map((step) =>
        step.id === event.stepId
          ? {
              ...step,
              result: event.result,
              status: event.status as AgentStep['status'],
              completedAt: Date.now()
            }
          : step
      )

      set({
        activeSession: {
          ...activeSession,
          steps: updatedSteps
        }
      })
    })

    const unsubRequiresApproval = window.api.agent.onRequiresApproval((event) => {
      const { activeSession } = get()
      if (!activeSession || activeSession.id !== event.sessionId) return

      set({
        pendingApproval: {
          sessionId: event.sessionId,
          stepId: event.stepId,
          tool: event.tool,
          sql: event.sql,
          reason: event.reason
        },
        activeSession: {
          ...activeSession,
          status: 'waiting_approval'
        }
      })
    })

    const unsubText = window.api.agent.onText((event) => {
      const { activeSession, streamingText } = get()
      if (!activeSession || activeSession.id !== event.sessionId) return

      set({
        streamingText: streamingText + event.text
      })
    })

    const unsubComplete = window.api.agent.onComplete((event) => {
      const { activeSession } = get()
      if (!activeSession || activeSession.id !== event.sessionId) return

      set({
        activeSession: {
          ...activeSession,
          status: event.status as AgentSessionStatus,
          finalMessage: event.finalMessage,
          generatedDashboardId: event.dashboardId,
          completedAt: Date.now()
        },
        pendingApproval: null,
        pendingWidgets: event.widgets ?? []
      })
    })

    return () => {
      unsubSessionStarted()
      unsubToolCall()
      unsubToolResult()
      unsubRequiresApproval()
      unsubText()
      unsubComplete()
    }
  },

  clearSession: () => {
    set({
      activeSession: null,
      pendingApproval: null,
      streamingText: '',
      pendingWidgets: []
    })
  }
}))

export const useAgentMode = () => useAgentStore((state) => state.isAgentMode)
export const useAgentSession = () => useAgentStore((state) => state.activeSession)
export const useAgentApproval = () => useAgentStore((state) => state.pendingApproval)
export const useAgentStreamingText = () => useAgentStore((state) => state.streamingText)
export const useAgentPendingWidgets = () => useAgentStore((state) => state.pendingWidgets)
