import { ipcMain } from 'electron'
import type {
  ConnectionConfig,
  SchemaInfo,
  AgentSession,
  AgentStep,
  CreateWidgetInput
} from '@shared/index'
import { createAgentStream, type AgentToolContext } from '../agent'
import { getAIConfig } from '../ai-service'
import { getAdapter } from '../db-adapter'
import { createLogger } from '../lib/logger'
import { windowManager } from '../window-manager'

const log = createLogger('agent-handlers')

interface ActiveSession {
  session: AgentSession
  pendingWidgets: CreateWidgetInput[]
  pendingApproval?: {
    stepId: string
    sql: string
    reason: string
    resolve: (approved: boolean) => void
  }
}

const activeSessions = new Map<string, ActiveSession>()

function broadcastAgentEvent(eventName: string, data: unknown) {
  windowManager.broadcastToAll(eventName, data)
}

export function registerAgentHandlers(): void {
  ipcMain.handle(
    'agent:start',
    async (
      _event,
      {
        connectionConfig,
        prompt,
        schemas
      }: { connectionConfig: ConnectionConfig; prompt: string; schemas: SchemaInfo[] }
    ) => {
      try {
        const aiConfig = getAIConfig()
        if (!aiConfig) {
          return {
            success: false,
            error: 'AI not configured. Please configure an AI provider first.'
          }
        }

        const sessionId = crypto.randomUUID()

        const session: AgentSession = {
          id: sessionId,
          connectionId: connectionConfig.id,
          prompt,
          status: 'running',
          steps: [],
          startedAt: Date.now()
        }

        const pendingWidgets: CreateWidgetInput[] = []

        activeSessions.set(sessionId, { session, pendingWidgets })

        broadcastAgentEvent('agent:session-started', { sessionId, prompt })

        runAgentSession(sessionId, connectionConfig, prompt, schemas, pendingWidgets).catch(
          (error) => {
            log.error('Agent session error:', error)
            const activeSession = activeSessions.get(sessionId)
            if (activeSession) {
              activeSession.session.status = 'error'
              activeSession.session.completedAt = Date.now()
              broadcastAgentEvent('agent:complete', {
                sessionId,
                status: 'error',
                error: error instanceof Error ? error.message : 'Agent execution failed'
              })
            }
          }
        )

        return { success: true, data: { sessionId } }
      } catch (error) {
        log.error('Failed to start agent:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to start agent'
        }
      }
    }
  )

  ipcMain.handle('agent:approve-tool', async (_, { sessionId }: { sessionId: string }) => {
    const activeSession = activeSessions.get(sessionId)
    if (!activeSession?.pendingApproval) {
      return { success: false, error: 'No pending approval for this session' }
    }

    activeSession.pendingApproval.resolve(true)
    return { success: true }
  })

  ipcMain.handle('agent:decline-tool', async (_, { sessionId }: { sessionId: string }) => {
    const activeSession = activeSessions.get(sessionId)
    if (!activeSession?.pendingApproval) {
      return { success: false, error: 'No pending approval for this session' }
    }

    activeSession.pendingApproval.resolve(false)
    return { success: true }
  })

  ipcMain.handle('agent:cancel', async (_, { sessionId }: { sessionId: string }) => {
    const activeSession = activeSessions.get(sessionId)
    if (!activeSession) {
      return { success: false, error: 'Session not found' }
    }

    activeSession.session.status = 'cancelled'
    activeSession.session.completedAt = Date.now()

    if (activeSession.pendingApproval) {
      activeSession.pendingApproval.resolve(false)
    }

    broadcastAgentEvent('agent:complete', {
      sessionId,
      status: 'cancelled'
    })

    activeSessions.delete(sessionId)
    return { success: true }
  })

  ipcMain.handle('agent:get-session', async (_, { sessionId }: { sessionId: string }) => {
    const activeSession = activeSessions.get(sessionId)
    if (!activeSession) {
      return { success: false, error: 'Session not found' }
    }
    return { success: true, data: activeSession.session }
  })

  log.debug('Agent handlers registered')
}

async function runAgentSession(
  sessionId: string,
  connectionConfig: ConnectionConfig,
  prompt: string,
  schemas: SchemaInfo[],
  pendingWidgets: CreateWidgetInput[]
) {
  const activeSession = activeSessions.get(sessionId)
  if (!activeSession) return

  const aiConfig = getAIConfig()
  if (!aiConfig) {
    throw new Error('AI not configured')
  }

  const toolContext: AgentToolContext = {
    connectionConfig,
    schemas,
    pendingWidgets,
    connectionId: connectionConfig.id
  }

  const result = await createAgentStream(prompt, aiConfig, toolContext)

  try {
    for await (const chunk of result.fullStream) {
      if (chunk.type === 'tool-call') {
        const stepId = crypto.randomUUID()
        const step: AgentStep = {
          id: stepId,
          toolName: chunk.toolName as AgentStep['toolName'],
          args: chunk.input as Record<string, unknown>,
          status: 'running',
          startedAt: Date.now()
        }

        activeSession.session.steps.push(step)

        broadcastAgentEvent('agent:tool-call', {
          sessionId,
          stepId,
          tool: chunk.toolName,
          args: chunk.input,
          requiresApproval: false
        })
      }

      if (chunk.type === 'tool-result') {
        const lastStep = activeSession.session.steps[activeSession.session.steps.length - 1]
        if (lastStep) {
          const toolResult = chunk.output as Record<string, unknown>

          if (toolResult?.requiresApproval) {
            lastStep.status = 'requires_approval'
            activeSession.session.status = 'waiting_approval'

            broadcastAgentEvent('agent:requires-approval', {
              sessionId,
              stepId: lastStep.id,
              tool: lastStep.toolName,
              sql: toolResult.sql,
              reason: toolResult.reason
            })

            const approved = await new Promise<boolean>((resolve) => {
              activeSession.pendingApproval = {
                stepId: lastStep.id,
                sql: toolResult.sql as string,
                reason: toolResult.reason as string,
                resolve
              }
            })

            activeSession.pendingApproval = undefined
            activeSession.session.status = 'running'

            if (approved) {
              try {
                const adapter = getAdapter(connectionConfig)
                const queryResult = await adapter.queryMultiple(
                  connectionConfig,
                  toolResult.sql as string,
                  {}
                )
                const firstResult = queryResult.results[0]

                lastStep.result = {
                  success: true,
                  approved: true,
                  rowCount: firstResult?.rowCount ?? 0,
                  rows: firstResult?.rows.slice(0, 100) ?? [],
                  fields: firstResult?.fields ?? []
                }
                lastStep.status = 'completed'
              } catch (error) {
                lastStep.result = {
                  success: false,
                  approved: true,
                  error: error instanceof Error ? error.message : 'Query execution failed'
                }
                lastStep.status = 'error'
              }
            } else {
              lastStep.result = {
                success: false,
                approved: false,
                message: 'User declined the query execution'
              }
              lastStep.status = 'completed'
            }
          } else {
            lastStep.result = toolResult
            lastStep.status = toolResult?.success === false ? 'error' : 'completed'
          }

          lastStep.completedAt = Date.now()

          broadcastAgentEvent('agent:tool-result', {
            sessionId,
            stepId: lastStep.id,
            tool: lastStep.toolName,
            result: lastStep.result,
            status: lastStep.status
          })
        }
      }

      if (chunk.type === 'text-delta') {
        broadcastAgentEvent('agent:text', {
          sessionId,
          text: chunk.text
        })
      }
    }

    const finalText = await result.text
    activeSession.session.status = 'completed'
    activeSession.session.finalMessage = finalText
    activeSession.session.completedAt = Date.now()

    let dashboardId: string | undefined
    if (activeSession.pendingWidgets.length > 0) {
      dashboardId = 'pending'
    }

    broadcastAgentEvent('agent:complete', {
      sessionId,
      status: 'completed',
      finalMessage: finalText,
      dashboardId,
      widgets: activeSession.pendingWidgets
    })
  } catch (error) {
    log.error('Agent stream error:', error)
    activeSession.session.status = 'error'
    activeSession.session.completedAt = Date.now()

    broadcastAgentEvent('agent:complete', {
      sessionId,
      status: 'error',
      error: error instanceof Error ? error.message : 'Agent execution failed'
    })
  } finally {
    setTimeout(() => {
      activeSessions.delete(sessionId)
    }, 60000)
  }
}
