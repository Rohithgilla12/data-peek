import { randomUUID } from 'crypto'
import { Client } from 'pg'
import type {
  ConnectionConfig,
  StatementResult,
  ParsedStatement,
  SessionState,
  StepSessionError,
  StartStepResponse,
  NextStepResponse,
  SkipStepResponse,
  ContinueStepResponse,
  RetryStepResponse,
  StopStepResponse
} from '@shared/index'
import { STEP_SESSION_IDLE_TIMEOUT_MS, STEP_SESSION_CLEANUP_INTERVAL_MS } from '@shared/index'
import { parseStatementsWithLines } from './lib/parse-statements'
import { createLogger } from './lib/logger'

const log = createLogger('step-session')

export interface MinimalDbClient {
  connect(): Promise<void>
  query(sql: string): Promise<{
    rows: unknown[]
    fields?: Array<{ name: string; dataTypeID?: number }>
    rowCount: number | null
  }>
  end(): Promise<void>
}

interface StepSession {
  id: string
  windowId: number
  tabId: string
  config: ConnectionConfig
  client: MinimalDbClient
  statements: ParsedStatement[]
  cursorIndex: number
  breakpoints: Set<number>
  inTransaction: boolean
  state: SessionState
  lastError: StepSessionError | null
  lastActivity: number
  startedAt: number
}

export interface StepSessionRegistryOptions {
  createClient?: (config: ConnectionConfig) => MinimalDbClient
}

export class StepSessionRegistry {
  private sessions = new Map<string, StepSession>()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null
  private createClient: (config: ConnectionConfig) => MinimalDbClient

  constructor(options: StepSessionRegistryOptions = {}) {
    this.createClient = options.createClient ?? defaultClientFactory
  }

  startCleanupTimer(): void {
    if (this.cleanupTimer) return
    this.cleanupTimer = setInterval(() => {
      this.pruneIdleSessions()
    }, STEP_SESSION_CLEANUP_INTERVAL_MS)
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  async start(input: {
    config: ConnectionConfig
    tabId: string
    windowId: number
    sql: string
    inTransaction: boolean
  }): Promise<StartStepResponse> {
    const statements = parseStatementsWithLines(input.sql, input.config.dbType ?? 'postgresql')
    if (statements.length === 0) {
      throw new Error('No statements found in SQL')
    }

    const client = this.createClient(input.config)
    await client.connect()

    if (input.inTransaction) {
      await client.query('BEGIN')
    }

    const sessionId = randomUUID()
    const now = Date.now()
    this.sessions.set(sessionId, {
      id: sessionId,
      windowId: input.windowId,
      tabId: input.tabId,
      config: input.config,
      client,
      statements,
      cursorIndex: 0,
      breakpoints: new Set(),
      inTransaction: input.inTransaction,
      state: 'paused',
      lastError: null,
      lastActivity: now,
      startedAt: now
    })

    log.debug(`Started step session ${sessionId} (tab=${input.tabId}, window=${input.windowId})`)
    return { sessionId, statements }
  }

  async next(sessionId: string): Promise<NextStepResponse> {
    const session = this.requireSession(sessionId)
    if (session.state !== 'paused') {
      throw new Error(`Cannot advance session in state: ${session.state}`)
    }
    return this.executeCurrent(session, { advance: true })
  }

  async skip(sessionId: string): Promise<SkipStepResponse> {
    const session = this.requireSession(sessionId)
    if (session.state !== 'paused') {
      throw new Error(`Cannot skip in state: ${session.state}`)
    }
    const skippedIndex = session.cursorIndex
    session.cursorIndex++
    session.lastActivity = Date.now()
    if (session.cursorIndex >= session.statements.length) {
      session.state = 'done'
    }
    return { statementIndex: skippedIndex, state: session.state, cursorIndex: session.cursorIndex }
  }

  async continue(sessionId: string): Promise<ContinueStepResponse> {
    const session = this.requireSession(sessionId)
    if (session.state !== 'paused') {
      throw new Error(`Cannot continue in state: ${session.state}`)
    }
    const executedIndices: number[] = []
    const results: StatementResult[] = []
    let stoppedAt = -1

    while (session.cursorIndex < session.statements.length) {
      if (executedIndices.length > 0 && session.breakpoints.has(session.cursorIndex)) {
        stoppedAt = session.cursorIndex
        break
      }

      try {
        const response = await this.executeCurrent(session, { advance: true })

        if ((session.state as SessionState) === 'errored') {
          break
        }

        executedIndices.push(response.statementIndex)
        results.push(response.result)
      } catch {
        break
      }
    }

    if (
      session.cursorIndex >= session.statements.length &&
      (session.state as SessionState) !== 'errored'
    ) {
      session.state = 'done'
    }

    return { executedIndices, results, stoppedAt, state: session.state, cursorIndex: session.cursorIndex }
  }

  async retry(sessionId: string): Promise<RetryStepResponse> {
    const session = this.requireSession(sessionId)
    if (session.state !== 'errored') {
      throw new Error(`Can only retry in errored state, got: ${session.state}`)
    }
    if (session.inTransaction) {
      throw new Error(
        'Cannot retry in transaction mode — transaction is poisoned. Stop and restart.'
      )
    }

    const response = await this.executeCurrent(session, { advance: true })
    return { result: response.result, state: response.state, cursorIndex: response.cursorIndex }
  }

  async setBreakpoints(sessionId: string, breakpoints: number[]): Promise<void> {
    const session = this.requireSession(sessionId)
    session.breakpoints = new Set(breakpoints)
    session.lastActivity = Date.now()
  }

  async stop(sessionId: string): Promise<StopStepResponse> {
    const session = this.sessions.get(sessionId)
    if (!session) return { rolledBack: false }

    let rolledBack = false
    if (session.inTransaction && (session.state === 'paused' || session.state === 'errored')) {
      try {
        await session.client.query('ROLLBACK')
        rolledBack = true
      } catch (err) {
        log.warn(`ROLLBACK failed for session ${sessionId}:`, err)
      }
    }

    await session.client.end().catch((err) => {
      log.warn(`Client.end() failed for session ${sessionId}:`, err)
    })

    this.sessions.delete(sessionId)
    log.debug(`Stopped session ${sessionId} (rolledBack=${rolledBack})`)
    return { rolledBack }
  }

  async cleanupWindow(windowId: number): Promise<void> {
    const toStop = Array.from(this.sessions.values()).filter((s) => s.windowId === windowId)
    for (const s of toStop) {
      await this.stop(s.id)
    }
  }

  async cleanupAll(): Promise<void> {
    const toStop = Array.from(this.sessions.keys())
    for (const id of toStop) {
      await this.stop(id)
    }
  }

  private async pruneIdleSessions(): Promise<void> {
    const now = Date.now()
    const idle = Array.from(this.sessions.values()).filter(
      (s) => now - s.lastActivity > STEP_SESSION_IDLE_TIMEOUT_MS
    )
    for (const s of idle) {
      log.debug(`Pruning idle session ${s.id}`)
      await this.stop(s.id)
    }
  }

  private requireSession(sessionId: string): StepSession {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Step session not found: ${sessionId}`)
    }
    return session
  }

  private async executeCurrent(
    session: StepSession,
    opts: { advance: boolean }
  ): Promise<NextStepResponse> {
    const statementIndex = session.cursorIndex
    const statement = session.statements[statementIndex]
    if (!statement) {
      throw new Error(`No statement at index ${statementIndex}`)
    }

    session.state = 'running'
    session.lastActivity = Date.now()
    const stmtStart = Date.now()

    try {
      const res = await session.client.query(statement.sql)
      const durationMs = Date.now() - stmtStart
      const fields = (res.fields ?? []).map((f) => ({
        name: f.name,
        dataType: 'unknown',
        dataTypeID: f.dataTypeID ?? 0
      }))

      const result: StatementResult = {
        statement: statement.sql,
        statementIndex,
        rows: (res.rows ?? []) as Record<string, unknown>[],
        fields,
        rowCount: res.rowCount ?? (res.rows?.length ?? 0),
        durationMs,
        isDataReturning: (res.rows ?? []).length > 0 || Array.isArray(res.fields)
      }

      if (opts.advance) {
        session.cursorIndex++
      }
      session.state = session.cursorIndex >= session.statements.length ? 'done' : 'paused'
      session.lastActivity = Date.now()
      session.lastError = null

      return { statementIndex, result, state: session.state, cursorIndex: session.cursorIndex }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      session.state = 'errored'
      session.lastError = { statementIndex, message }
      session.lastActivity = Date.now()

      const result: StatementResult = {
        statement: statement.sql,
        statementIndex,
        rows: [],
        fields: [],
        rowCount: 0,
        durationMs: Date.now() - stmtStart,
        isDataReturning: false
      }
      return { statementIndex, result, state: session.state, cursorIndex: session.cursorIndex }
    }
  }
}

function defaultClientFactory(config: ConnectionConfig): MinimalDbClient {
  const client = new Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined
  })
  return {
    connect: () => client.connect(),
    query: async (sql: string) => {
      const res = await client.query(sql)
      return {
        rows: res.rows,
        fields: res.fields as unknown as Array<{ name: string; dataTypeID?: number }>,
        rowCount: res.rowCount
      }
    },
    end: () => client.end()
  }
}
