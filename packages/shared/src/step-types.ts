import type { StatementResult } from './index'

export type SessionState = 'idle' | 'running' | 'paused' | 'errored' | 'done'

export interface ParsedStatement {
  index: number
  sql: string
  startLine: number
  endLine: number
  isDDL: boolean
}

export interface StepSessionError {
  statementIndex: number
  message: string
}

export interface SessionSnapshot {
  state: SessionState
  cursorIndex: number
}

export interface StartStepRequest {
  tabId: string
  sql: string
  inTransaction: boolean
}

export interface StartStepResponse {
  sessionId: string
  statements: ParsedStatement[]
}

export interface NextStepResponse extends SessionSnapshot {
  statementIndex: number
  result: StatementResult
  error?: StepSessionError
}

export interface SkipStepResponse {
  statementIndex: number
  state: SessionState
  cursorIndex: number
}

export interface ContinueStepResponse extends SessionSnapshot {
  executedIndices: number[]
  results: StatementResult[]
  stoppedAt: number | null
  error?: StepSessionError
}

export interface RetryStepResponse extends SessionSnapshot {
  result: StatementResult
  error?: StepSessionError
}

export interface StopStepResponse {
  rolledBack: boolean
  rollbackError?: string
}

export const STEP_SESSION_IDLE_TIMEOUT_MS = 10 * 60 * 1000
export const STEP_SESSION_CLEANUP_INTERVAL_MS = 60 * 1000

export const DDL_KEYWORD_REGEX = /^\s*(CREATE|ALTER|DROP|TRUNCATE|VACUUM|REINDEX)\b/i
