import { create } from 'zustand'
import type {
  ParsedStatement,
  SessionState,
  StatementResult,
  StepSessionError
} from '@shared/index'
import { useConnectionStore } from './connection-store'

export interface StepSessionState {
  sessionId: string
  statements: ParsedStatement[]
  cursorIndex: number
  breakpoints: Set<number>
  state: SessionState
  lastResult: StatementResult | null
  pinnedResults: Array<{ statementIndex: number; result: StatementResult }>
  inTransaction: boolean
  lastError: StepSessionError | null
}

interface StepState {
  sessions: Map<string, StepSessionState> // keyed by tabId

  startStep: (tabId: string, sql: string, inTransaction: boolean) => Promise<boolean>
  nextStep: (tabId: string) => Promise<void>
  skipStep: (tabId: string) => Promise<void>
  continueStep: (tabId: string) => Promise<void>
  retryStep: (tabId: string) => Promise<void>
  stopStep: (tabId: string) => Promise<void>
  toggleBreakpoint: (tabId: string, statementIndex: number) => Promise<void>
  pinResult: (tabId: string, statementIndex: number) => void
  unpinResult: (tabId: string, statementIndex: number) => void
  getSession: (tabId: string) => StepSessionState | undefined
}

export const useStepStore = create<StepState>((set, get) => ({
  sessions: new Map(),

  getSession: (tabId) => get().sessions.get(tabId),

  startStep: async (tabId, sql, inTransaction) => {
    const connectionStore = useConnectionStore.getState()
    const activeConnection = connectionStore.connections.find(
      (c) => c.id === connectionStore.activeConnectionId
    )
    if (!activeConnection) return false

    const result = await window.api.step.start(activeConnection, {
      tabId,
      sql,
      inTransaction
    })
    if (!result.success || !result.data) {
      console.error('Failed to start step session:', result.error)
      return false
    }

    set((s) => {
      const next = new Map(s.sessions)
      next.set(tabId, {
        sessionId: result.data!.sessionId,
        statements: result.data!.statements,
        cursorIndex: 0,
        breakpoints: new Set(),
        state: 'paused',
        lastResult: null,
        pinnedResults: [],
        inTransaction,
        lastError: null
      })
      return { sessions: next }
    })
    return true
  },

  nextStep: async (tabId) => {
    const session = get().sessions.get(tabId)
    if (!session) return

    set((s) => updateSession(s, tabId, (sess) => ({ ...sess, state: 'running' })))

    const result = await window.api.step.next(session.sessionId)
    if (!result.success || !result.data) {
      console.error('step.next failed:', result.error)
      set((s) => updateSession(s, tabId, (sess) => ({ ...sess, state: 'errored' })))
      return
    }

    const { result: stmtResult, state } = result.data
    set((s) =>
      updateSession(s, tabId, (sess) => ({
        ...sess,
        cursorIndex: sess.cursorIndex + 1,
        state,
        lastResult: stmtResult,
        lastError:
          state === 'errored'
            ? { statementIndex: stmtResult.statementIndex, message: 'Query failed' }
            : null
      }))
    )
  },

  skipStep: async (tabId) => {
    const session = get().sessions.get(tabId)
    if (!session) return
    const result = await window.api.step.skip(session.sessionId)
    if (!result.success || !result.data) return
    set((s) =>
      updateSession(s, tabId, (sess) => ({
        ...sess,
        cursorIndex: sess.cursorIndex + 1,
        state: result.data!.state
      }))
    )
  },

  continueStep: async (tabId) => {
    const session = get().sessions.get(tabId)
    if (!session) return
    set((s) => updateSession(s, tabId, (sess) => ({ ...sess, state: 'running' })))

    const result = await window.api.step.continue(session.sessionId)
    if (!result.success || !result.data) return
    const { executedIndices, results, state } = result.data
    set((s) =>
      updateSession(s, tabId, (sess) => ({
        ...sess,
        cursorIndex: sess.cursorIndex + executedIndices.length,
        state,
        lastResult: results[results.length - 1] ?? sess.lastResult
      }))
    )
  },

  retryStep: async (tabId) => {
    const session = get().sessions.get(tabId)
    if (!session) return
    set((s) => updateSession(s, tabId, (sess) => ({ ...sess, state: 'running' })))

    const result = await window.api.step.retry(session.sessionId)
    if (!result.success || !result.data) {
      set((s) => updateSession(s, tabId, (sess) => ({ ...sess, state: 'errored' })))
      return
    }
    const { result: stmtResult, state } = result.data
    set((s) =>
      updateSession(s, tabId, (sess) => ({
        ...sess,
        cursorIndex: sess.cursorIndex + 1,
        state,
        lastResult: stmtResult
      }))
    )
  },

  stopStep: async (tabId) => {
    const session = get().sessions.get(tabId)
    if (!session) return
    await window.api.step.stop(session.sessionId)
    set((s) => {
      const next = new Map(s.sessions)
      next.delete(tabId)
      return { sessions: next }
    })
  },

  toggleBreakpoint: async (tabId, statementIndex) => {
    const session = get().sessions.get(tabId)
    if (!session) return
    const breakpoints = new Set(session.breakpoints)
    if (breakpoints.has(statementIndex)) {
      breakpoints.delete(statementIndex)
    } else {
      breakpoints.add(statementIndex)
    }
    set((s) => updateSession(s, tabId, (sess) => ({ ...sess, breakpoints })))
    await window.api.step.setBreakpoints(session.sessionId, [...breakpoints])
  },

  pinResult: (tabId, statementIndex) => {
    const session = get().sessions.get(tabId)
    if (!session?.lastResult) return
    if (session.lastResult.statementIndex !== statementIndex) return
    if (session.pinnedResults.some((p) => p.statementIndex === statementIndex)) return

    set((s) =>
      updateSession(s, tabId, (sess) => ({
        ...sess,
        pinnedResults: [
          ...sess.pinnedResults,
          { statementIndex, result: sess.lastResult! }
        ]
      }))
    )
  },

  unpinResult: (tabId, statementIndex) => {
    set((s) =>
      updateSession(s, tabId, (sess) => ({
        ...sess,
        pinnedResults: sess.pinnedResults.filter((p) => p.statementIndex !== statementIndex)
      }))
    )
  }
}))

function updateSession(
  state: StepState,
  tabId: string,
  updater: (s: StepSessionState) => StepSessionState
): Partial<StepState> {
  const existing = state.sessions.get(tabId)
  if (!existing) return {}
  const next = new Map(state.sessions)
  next.set(tabId, updater(existing))
  return { sessions: next }
}
