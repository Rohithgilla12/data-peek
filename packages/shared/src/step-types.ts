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

export interface StartStepRequest {
  tabId: string
  sql: string
  inTransaction: boolean
}

export interface StartStepResponse {
  sessionId: string
  statements: ParsedStatement[]
}

export interface NextStepResponse {
  statementIndex: number
  result: StatementResult
  state: SessionState
}

export interface SkipStepResponse {
  statementIndex: number
  state: SessionState
}

export interface ContinueStepResponse {
  executedIndices: number[]
  results: StatementResult[]
  stoppedAt: number
  state: SessionState
}

export interface RetryStepResponse {
  result: StatementResult
  state: SessionState
}

export interface StopStepResponse {
  rolledBack: boolean
}

export const STEP_SESSION_IDLE_TIMEOUT_MS = 10 * 60 * 1000
export const STEP_SESSION_CLEANUP_INTERVAL_MS = 60 * 1000

export const DDL_KEYWORD_REGEX = /^\s*(CREATE|ALTER|DROP|TRUNCATE|VACUUM|REINDEX)\b/i
