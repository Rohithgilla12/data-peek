import { randomUUID } from 'crypto'
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
import { getAdapter, type DedicatedClient } from './db-adapter'
import { isDataReturningStatement } from './adapters/postgres-adapter'
import { parseStatementsWithLines } from './lib/parse-statements'
import { createLogger } from './lib/logger'

const log = createLogger('step-session')

interface StepSession {
  id: string
  windowId: number
  tabId: string
  config: ConnectionConfig
  client: DedicatedClient
  statements: ParsedStatement[]
  cursorIndex: number
  breakpoints: Set<number>
  inTransaction: boolean
  state: SessionState
  lastError: StepSessionError | null
  lastActivity: number
  startedAt: number
  /**
   * The backend went away underneath this session. Anything it had open — the
   * transaction included — is already gone server-side, so teardown must not try to
   * talk to it.
   */
  connectionLost: boolean
}

export interface StepSessionRegistryOptions {
  /** Injection seam for tests. Production opens a dedicated client via the adapter. */
  createClient?: (config: ConnectionConfig) => Promise<DedicatedClient>
}

export class StepSessionRegistry {
  private sessions = new Map<string, StepSession>()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null
  private createClient: (config: ConnectionConfig) => Promise<DedicatedClient>

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

    // The client arrives connected — see `createDedicatedClient` for the guarantee — so
    // a dial failure throws here with nothing to clean up.
    const client = await this.createClient(input.config)
    try {
      if (input.inTransaction) {
        await client.query('BEGIN')
      }
    } catch (err) {
      await client.close().catch((closeErr) => {
        log.error(
          `Cleanup after failed start: client.close() also failed; connection may be orphaned:`,
          closeErr
        )
      })
      throw err
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
      startedAt: now,
      connectionLost: false
    })

    // Without this the session sits in the map looking paused, and the next step blames
    // whichever statement the cursor happens to be on for a connection that had already
    // died.
    client.onDisconnect((err) => {
      const session = this.sessions.get(sessionId)
      if (!session) return
      log.error(`Step session ${sessionId} lost its connection:`, err)
      session.connectionLost = true
      session.state = 'errored'
      session.lastError = {
        statementIndex: session.cursorIndex,
        message: err
          ? `Connection lost: ${err.message}. Stop and restart the session.`
          : 'The database closed this connection. Stop and restart the session.'
      }
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
    let stoppedAt: number | null = null

    while (session.cursorIndex < session.statements.length) {
      if (executedIndices.length > 0 && session.breakpoints.has(session.cursorIndex)) {
        stoppedAt = session.cursorIndex
        break
      }

      try {
        const response = await this.executeCurrent(session, { advance: true })

        executedIndices.push(response.statementIndex)
        results.push(response.result)

        if ((session.state as SessionState) === 'errored') {
          break
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        log.error(`continue() loop aborted unexpectedly at index ${session.cursorIndex}:`, err)
        session.state = 'errored'
        session.lastError = {
          statementIndex: session.cursorIndex,
          message
        }
        break
      }
    }

    if (
      session.cursorIndex >= session.statements.length &&
      (session.state as SessionState) !== 'errored'
    ) {
      session.state = 'done'
    }

    return {
      executedIndices,
      results,
      stoppedAt,
      state: session.state,
      cursorIndex: session.cursorIndex,
      error: session.lastError ?? undefined
    }
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
    return {
      result: response.result,
      state: response.state,
      cursorIndex: response.cursorIndex,
      error: response.error
    }
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
    let rollbackError: string | undefined

    if (
      session.inTransaction &&
      !session.connectionLost &&
      (session.state === 'paused' || session.state === 'errored')
    ) {
      try {
        await session.client.query('ROLLBACK')
        rolledBack = true
      } catch (err) {
        rollbackError = err instanceof Error ? err.message : String(err)
        log.warn(`ROLLBACK failed for session ${sessionId}:`, err)
      }
    }

    await session.client.close().catch((err) => {
      log.error(
        `Client.close() failed for session ${sessionId} (${session.config.host}/${session.config.database}); connection may be orphaned:`,
        err
      )
    })

    this.sessions.delete(sessionId)
    log.debug(`Stopped session ${sessionId} (rolledBack=${rolledBack})`)
    return { rolledBack, rollbackError }
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

      const result: StatementResult = {
        statement: statement.sql,
        statementIndex,
        rows: res.rows,
        fields: res.fields,
        rowCount: res.rowCount ?? res.rows.length,
        durationMs,
        isDataReturning: isDataReturningStatement(statement.sql)
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
      log.warn(`Statement ${statementIndex} failed:`, err)
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
      return {
        statementIndex,
        result,
        state: session.state,
        cursorIndex: session.cursorIndex,
        error: session.lastError
      }
    }
  }
}

/**
 * Open the connection a step session runs on.
 *
 * It is dedicated because the session accumulates backend state — an open transaction,
 * temp tables, `SET`s — that has to survive between IPC calls, and because it stays
 * open for as long as the user leaves the panel up. (`acquirePgSessionClient` also
 * holds a client across calls, but its budget is small and meant for transactions the
 * user is actively driving.) The adapter owns how the connection is built, which is
 * what keeps step sessions honouring the SSL, SSH and `search_path` settings the rest
 * of the app does.
 */
async function defaultClientFactory(config: ConnectionConfig): Promise<DedicatedClient> {
  const adapter = getAdapter(config)
  if (!adapter.createDedicatedClient) {
    throw new Error(`Step-through execution is not supported for ${adapter.dbType} connections`)
  }
  return adapter.createDedicatedClient(config)
}
