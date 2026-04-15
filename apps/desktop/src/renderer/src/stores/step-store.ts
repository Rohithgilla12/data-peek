import { create } from 'zustand'
import type {
  ParsedStatement,
  SessionState,
  StatementResult,
  StepSessionError
} from '@shared/index'
import { useConnectionStore } from './connection-store'
import { notify } from './notification-store'

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
    if (!activeConnection) {
      notify.error('No connection', 'Connect to a database first.')
      return false
    }

    const result = await window.api.step.start(activeConnection, {
      tabId,
      sql,
      inTransaction
    })
    if (!result.success || !result.data) {
      notify.error('Could not start step session', result.error ?? 'Unknown error')
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
      notify.error('Step failed', result.error ?? 'Unknown error')
      set((s) =>
        updateSession(s, tabId, (sess) => ({
          ...sess,
          state: 'errored',
          lastError: {
            statementIndex: sess.cursorIndex,
            message: result.error ?? 'Unknown error'
          }
        }))
      )
      return
    }

    const { result: stmtResult, state, cursorIndex } = result.data
    set((s) =>
      updateSession(s, tabId, (sess) => ({
        ...sess,
        cursorIndex,
        state,
        lastResult: stmtResult,
        lastError: result.data!.error ?? null
      }))
    )
  },

  skipStep: async (tabId) => {
    const session = get().sessions.get(tabId)
    if (!session) return
    const result = await window.api.step.skip(session.sessionId)
    if (!result.success || !result.data) {
      notify.error('Step failed', result.error ?? 'Unknown error')
      return
    }
    set((s) =>
      updateSession(s, tabId, (sess) => ({
        ...sess,
        cursorIndex: result.data!.cursorIndex,
        state: result.data!.state
      }))
    )
  },

  continueStep: async (tabId) => {
    const session = get().sessions.get(tabId)
    if (!session) return
    set((s) => updateSession(s, tabId, (sess) => ({ ...sess, state: 'running' })))

    const result = await window.api.step.continue(session.sessionId)
    if (!result.success || !result.data) {
      notify.error('Step failed', result.error ?? 'Unknown error')
      return
    }
    const { results, state, cursorIndex } = result.data
    set((s) =>
      updateSession(s, tabId, (sess) => ({
        ...sess,
        cursorIndex,
        state,
        lastResult: results[results.length - 1] ?? sess.lastResult,
        lastError: result.data!.error ?? null
      }))
    )
  },

  retryStep: async (tabId) => {
    const session = get().sessions.get(tabId)
    if (!session) return
    set((s) => updateSession(s, tabId, (sess) => ({ ...sess, state: 'running' })))

    const result = await window.api.step.retry(session.sessionId)
    if (!result.success || !result.data) {
      notify.error('Step failed', result.error ?? 'Unknown error')
      set((s) => updateSession(s, tabId, (sess) => ({ ...sess, state: 'errored' })))
      return
    }
    const { result: stmtResult, state, cursorIndex } = result.data
    set((s) =>
      updateSession(s, tabId, (sess) => ({
        ...sess,
        cursorIndex,
        state,
        lastResult: stmtResult,
        lastError: result.data!.error ?? null
      }))
    )
  },

  stopStep: async (tabId) => {
    const session = get().sessions.get(tabId)
    if (!session) return
    const result = await window.api.step.stop(session.sessionId)
    if (result.success && result.data?.rollbackError) {
      notify.error(
        'Stop completed but ROLLBACK failed',
        `${result.data.rollbackError}. Verify your database state — uncommitted changes may not be reverted.`
      )
    }
    set((s) => {
      const next = new Map(s.sessions)
      next.delete(tabId)
      return { sessions: next }
    })
  },

  toggleBreakpoint: async (tabId, statementIndex) => {
    const session = get().sessions.get(tabId)
    if (!session) return
    const originalBreakpoints = session.breakpoints
    const breakpoints = new Set(session.breakpoints)
    if (breakpoints.has(statementIndex)) {
      breakpoints.delete(statementIndex)
    } else {
      breakpoints.add(statementIndex)
    }
    set((s) => updateSession(s, tabId, (sess) => ({ ...sess, breakpoints })))

    const result = await window.api.step.setBreakpoints(session.sessionId, [...breakpoints])
    if (!result.success) {
      set((s) => updateSession(s, tabId, (sess) => ({ ...sess, breakpoints: originalBreakpoints })))
      notify.error('Breakpoint update failed', result.error ?? 'Unknown error')
    }
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
