import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { AIProvider, ConnectionConfig, SchemaInfo } from '@shared/index'
import type { AskMode } from '@/lib/ask-input'
import {
  gateFor,
  toAnswer,
  toHistory,
  toStored,
  type AiState,
  type AskBlock,
  type AskResult,
  type RunGate,
  type RunState
} from '@/lib/ask-session'
import { resolveHarnessResumeId, type HarnessSessionRef } from '@/lib/harness-session-ref'
import { formatSQL, formatterLanguage } from '@/lib/sql-formatter'

export interface AskContext {
  connection: ConnectionConfig
  schemas: SchemaInfo[]
  provider: AIProvider | undefined
}

export interface AskInput {
  mode: AskMode
  text: string
  /** True when the user chose the mode (Tab) rather than the composer guessing it. */
  locked?: boolean
  /** Sent to the model but not shown, e.g. the failing SQL behind "Fix with AI". */
  context?: string
  /** SQL the assistant wrote (e.g. "More from this answer"), gated as AI SQL. */
  fromAi?: { flagged: boolean }
}

interface AskSession {
  blocks: AskBlock[]
  harness?: HarnessSessionRef
}

interface AskState {
  sessions: Record<string, AskSession>
  submit: (tabId: string, input: AskInput, ctx: AskContext) => Promise<void>
  /** `readOnly` runs the SQL in a rolled-back READ ONLY transaction. */
  run: (
    tabId: string,
    blockId: string,
    ctx: AskContext,
    opts?: { readOnly?: boolean }
  ) => Promise<void>
  cancel: (tabId: string, blockId: string) => void
  /** Stops the AI answering this block and kills the CLI behind it. */
  stop: (tabId: string, blockId: string) => void
  editSql: (tabId: string, blockId: string, sql: string) => void
  remove: (tabId: string, blockId: string) => void
  clear: (tabId: string) => void
  /** Questions handed to a tab before its view could send them (palette, schema menu). */
  queued: Record<string, AskInput>
  queue: (tabId: string, input: AskInput) => void
  /** Removes and returns a tab's queued question, so it is sent exactly once. */
  takeQueued: (tabId: string) => AskInput | undefined
  /** Drops sessions whose Ask tab no longer exists. */
  prune: (keepTabIds: string[]) => void
}

const EMPTY: AskBlock[] = []

export const selectBlocks = (tabId: string) => (s: AskState) => s.sessions[tabId]?.blocks ?? EMPTY

/** One question at a time per tab: a CLI session can't take two turns at once. */
export const selectThinking = (tabId: string) => (s: AskState) =>
  (s.sessions[tabId]?.blocks ?? EMPTY).some((b) => b.ai?.status === 'thinking')

function toResult(data: unknown): AskResult {
  const d = data as {
    rows?: Record<string, unknown>[]
    fields?: Array<{ name: string; dataType?: string }>
    rowCount?: number | null
    durationMs?: number
  }
  const rows = d.rows ?? []
  const columns =
    d.fields?.map((f) => ({ name: f.name, type: f.dataType ?? '' })) ??
    Object.keys(rows[0] ?? {}).map((name) => ({ name, type: '' }))
  return {
    columns,
    rows,
    rowCount: rows.length > 0 ? rows.length : (d.rowCount ?? 0),
    durationMs: Math.round(d.durationMs ?? 0)
  }
}

/**
 * Streaming patches the store many times a second; writing every one would
 * serialise all sessions each time. Write once things settle, and never let a
 * full or unavailable localStorage break the store.
 */
function debouncedStorage(): StateStorage {
  if (typeof localStorage === 'undefined') {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        try {
          localStorage.setItem(name, value)
        } catch (error) {
          console.warn('Ask history was not saved:', error)
        }
      }, 400)
    },
    removeItem: (name) => localStorage.removeItem(name)
  }
}

export const useAskStore = create<AskState>()(
  persist(
    (set, get) => {
      const patch = (tabId: string, blockId: string, update: Partial<AskBlock>): void => {
        set((s) => {
          const session = s.sessions[tabId]
          if (!session) return s
          return {
            sessions: {
              ...s.sessions,
              [tabId]: {
                ...session,
                blocks: session.blocks.map((b) => (b.id === blockId ? { ...b, ...update } : b))
              }
            }
          }
        })
      }

      const find = (tabId: string, blockId: string): AskBlock | undefined =>
        get().sessions[tabId]?.blocks.find((b) => b.id === blockId)

      const setAi = (tabId: string, blockId: string, ai: AiState): void =>
        patch(tabId, blockId, { ai })

      const setRun = (tabId: string, blockId: string, run: RunState): void =>
        patch(tabId, blockId, { run })

      const applyGate = async (
        tabId: string,
        blockId: string,
        ctx: AskContext,
        gate: RunGate
      ): Promise<void> => {
        if (gate.action === 'run') await get().run(tabId, blockId, ctx, { readOnly: gate.readOnly })
        else if (gate.action === 'hold') {
          setRun(tabId, blockId, { status: 'needs-approval', reason: gate.reason })
        }
      }

      return {
        sessions: {},
        queued: {},

        queue: (tabId, input) => set((s) => ({ queued: { ...s.queued, [tabId]: input } })),

        takeQueued: (tabId) => {
          const input = get().queued[tabId]
          if (!input) return undefined
          set((s) => {
            const next = { ...s.queued }
            delete next[tabId]
            return { queued: next }
          })
          return input
        },

        submit: async (tabId, { mode, text: input, locked, context, fromAi }, ctx) => {
          const text = input.trim()
          if (!text) return
          if (mode === 'ask' && selectThinking(tabId)(get())) return
          const prior = get().sessions[tabId]?.blocks ?? []
          const block: AskBlock = {
            id: crypto.randomUUID(),
            mode,
            locked,
            fromAi: !!fromAi,
            prompt: text,
            context,
            sql: mode === 'sql' ? text : null,
            ai:
              mode === 'ask'
                ? { status: 'thinking', requestId: crypto.randomUUID(), narration: '' }
                : null,
            run: { status: 'idle' },
            createdAt: Date.now()
          }
          set((s) => ({
            sessions: {
              ...s.sessions,
              [tabId]: { ...s.sessions[tabId], blocks: [...prior, block] }
            }
          }))

          if (mode === 'sql') {
            return applyGate(
              tabId,
              block.id,
              ctx,
              fromAi
                ? gateFor('ai', text, fromAi.flagged)
                : gateFor(locked ? 'typed-locked' : 'typed', text, false)
            )
          }

          const resumeId = resolveHarnessResumeId(get().sessions[tabId]?.harness, ctx.provider)
          try {
            const response = await window.api.ai.chatStream(
              toHistory(prior, context ?? text),
              ctx.schemas,
              ctx.connection.dbType || 'postgresql',
              ctx.connection.id,
              resumeId,
              (event) => {
                const current = find(tabId, block.id)?.ai
                if (current?.status !== 'thinking') return
                if (event.type === 'message')
                  setAi(tabId, block.id, { ...current, narration: event.text })
                else setAi(tabId, block.id, { ...current, activity: event.label })
              },
              block.ai?.status === 'thinking' ? block.ai.requestId : undefined
            )
            if (find(tabId, block.id)?.ai?.status !== 'thinking') return
            const sessionId = response.meta?.sessionId
            if (sessionId && ctx.provider) {
              const provider = ctx.provider
              set((s) => {
                const session = s.sessions[tabId]
                if (!session) return s
                return {
                  sessions: {
                    ...s.sessions,
                    [tabId]: { ...session, harness: { provider, sessionId } }
                  }
                }
              })
            }
            if (!response.success || !response.data) {
              setAi(tabId, block.id, { status: 'error', message: response.error ?? 'No answer' })
              return
            }
            const answer = toAnswer(response.data)
            const sql =
              answer.sql && !answer.sql.includes('\n')
                ? formatSQL(answer.sql, {
                    language: formatterLanguage(ctx.connection.dbType),
                    keywordCase: 'preserve'
                  })
                : answer.sql
            patch(tabId, block.id, {
              sql,
              ai: {
                status: 'done',
                narration: answer.narration,
                grounded: response.meta?.grounded ?? false,
                visual: answer.visual,
                suggestions: answer.suggestions,
                warning: answer.warning,
                more: answer.more,
                flagged: answer.requiresConfirmation
              }
            })
            await applyGate(tabId, block.id, ctx, gateFor('ai', sql, answer.requiresConfirmation))
          } catch (error) {
            setAi(tabId, block.id, {
              status: 'error',
              message: error instanceof Error ? error.message : String(error)
            })
          }
        },

        run: async (tabId, blockId, ctx, opts) => {
          const block = find(tabId, blockId)
          if (!block?.sql) return
          const executionId = crypto.randomUUID()
          setRun(tabId, blockId, { status: 'running', executionId })
          const stillMine = (): boolean => {
            const run = find(tabId, blockId)?.run
            return run?.status === 'running' && run.executionId === executionId
          }
          try {
            const response = opts?.readOnly
              ? await window.api.db.queryReadOnly(ctx.connection, block.sql)
              : await window.api.db.query(ctx.connection, block.sql, executionId)
            if (!stillMine()) return
            setRun(
              tabId,
              blockId,
              response.success
                ? { status: 'done', result: toResult(response.data) }
                : { status: 'error', message: response.error ?? 'Query failed' }
            )
          } catch (error) {
            if (!stillMine()) return
            setRun(tabId, blockId, {
              status: 'error',
              message: error instanceof Error ? error.message : String(error)
            })
          }
        },

        cancel: (tabId, blockId) => {
          const run = find(tabId, blockId)?.run
          if (run?.status !== 'running') return
          void window.api.db.cancelQuery(run.executionId).catch(() => {})
          setRun(tabId, blockId, { status: 'error', message: 'Cancelled' })
        },

        stop: (tabId, blockId) => {
          const ai = find(tabId, blockId)?.ai
          if (ai?.status !== 'thinking') return
          void window.api.ai.cancelChatStream(ai.requestId).catch(() => {})
          setAi(tabId, blockId, { status: 'error', message: 'Stopped' })
          // The killed CLI may still be flushing its session file; the next
          // question starts a fresh one rather than racing it.
          set((s) => {
            const session = s.sessions[tabId]
            if (!session?.harness) return s
            return { sessions: { ...s.sessions, [tabId]: { ...session, harness: undefined } } }
          })
        },

        editSql: (tabId, blockId, sql) => {
          const run = find(tabId, blockId)?.run
          if (run?.status === 'running')
            void window.api.db.cancelQuery(run.executionId).catch(() => {})
          patch(tabId, blockId, { sql, run: { status: 'idle' } })
        },

        remove: (tabId, blockId) => {
          // Cancel in-flight work first: a running query keeps hitting the
          // database, and a live CLI would race the next question for the
          // same harness session.
          get().cancel(tabId, blockId)
          get().stop(tabId, blockId)
          set((s) => {
            const session = s.sessions[tabId]
            if (!session) return s
            return {
              sessions: {
                ...s.sessions,
                [tabId]: { ...session, blocks: session.blocks.filter((b) => b.id !== blockId) }
              }
            }
          })
        },

        prune: (keepTabIds) =>
          set((s) => {
            const keep = new Set(keepTabIds)
            const entries = Object.entries(s.sessions)
            if (entries.every(([id]) => keep.has(id))) return s
            return { sessions: Object.fromEntries(entries.filter(([id]) => keep.has(id))) }
          }),

        clear: (tabId) =>
          set((s) => {
            for (const b of s.sessions[tabId]?.blocks ?? []) {
              if (b.run.status === 'running') {
                void window.api.db.cancelQuery(b.run.executionId).catch(() => {})
              }
              if (b.ai?.status === 'thinking') {
                void window.api.ai.cancelChatStream(b.ai.requestId).catch(() => {})
              }
            }
            const next = { ...s.sessions }
            delete next[tabId]
            const queued = { ...s.queued }
            delete queued[tabId]
            return { sessions: next, queued }
          })
      }
    },
    {
      name: 'data-peek-ask',
      version: 1,
      storage: createJSONStorage(debouncedStorage),
      partialize: (state) => ({
        sessions: Object.fromEntries(
          Object.entries(state.sessions).map(([tabId, session]) => [
            tabId,
            { ...session, blocks: toStored(session.blocks) }
          ])
        )
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.sessions = Object.fromEntries(
          Object.entries(state.sessions).map(([id, s]) => [
            id,
            { ...s, blocks: toStored(s.blocks) }
          ])
        )
      }
    }
  )
)
