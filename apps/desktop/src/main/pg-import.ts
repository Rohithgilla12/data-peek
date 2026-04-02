import { Client } from 'pg'
import { promises as fs } from 'fs'
import type {
  ConnectionConfig,
  PgImportOptions,
  PgImportProgress,
  PgImportResult
} from '@shared/index'
import { buildClientConfig } from './adapters/postgres-adapter'
import { createTunnel, closeTunnel, TunnelSession } from './ssh-tunnel-service'
import { splitStatements } from './lib/sql-parser'
import { createLogger } from './lib/logger'

const log = createLogger('pg-import')

interface CancelToken {
  cancelled: boolean
}

// Throttle progress updates to avoid flooding the IPC channel
const PROGRESS_INTERVAL_MS = 100

export async function pgImport(
  config: ConnectionConfig,
  filePath: string,
  options: PgImportOptions,
  onProgress: (progress: PgImportProgress) => void,
  cancelToken: CancelToken
): Promise<PgImportResult> {
  const startTime = Date.now()
  let statementsExecuted = 0
  let statementsSkipped = 0
  let statementsFailed = 0
  const errors: Array<{ statementIndex: number; statement: string; error: string }> = []
  let tunnelSession: TunnelSession | null = null

  let lastProgressTime = 0
  const sendProgress = (
    phase: PgImportProgress['phase'],
    totalStatements: number,
    currentStatement: string
  ): void => {
    const now = Date.now()
    if (phase === 'executing' && now - lastProgressTime < PROGRESS_INTERVAL_MS) return
    lastProgressTime = now

    onProgress({
      phase,
      statementsExecuted,
      totalStatements,
      currentStatement: currentStatement.slice(0, 200),
      errorsEncountered: statementsFailed
    })
  }

  try {
    // Read the SQL file
    sendProgress('reading', 0, 'Reading file...')
    const sql = await fs.readFile(filePath, 'utf8')

    if (cancelToken.cancelled) throw new Error('Import cancelled')

    // Split into statements
    const statements = splitStatements(sql, 'postgresql').filter((s) => {
      // Strip leading comment lines, then check if real SQL remains
      const stripped = s.replace(/^(\s*--[^\n]*\n)*/gm, '').trim()
      return stripped.length > 0
    })

    log.info(`Parsed ${statements.length} statements from ${filePath}`)

    if (statements.length === 0) {
      return {
        success: true,
        statementsExecuted: 0,
        statementsSkipped: 0,
        statementsFailed: 0,
        errors: [],
        durationMs: Date.now() - startTime
      }
    }

    // Connect
    if (config.ssh) {
      tunnelSession = await createTunnel(config)
    }
    const tunnelOverrides = tunnelSession
      ? { host: tunnelSession.localHost, port: tunnelSession.localPort }
      : undefined
    const client = new Client(buildClientConfig(config, tunnelOverrides))

    try {
      await client.connect()

      if (options.useTransaction) {
        await client.query('BEGIN')
      }

      sendProgress('executing', statements.length, '')

      for (let i = 0; i < statements.length; i++) {
        if (cancelToken.cancelled) {
          if (options.useTransaction) {
            await client.query('ROLLBACK').catch(() => {})
          }
          throw new Error('Import cancelled')
        }

        const stmt = statements[i]
        const useSavepoints = options.useTransaction && options.onError === 'skip'

        if (useSavepoints) {
          await client.query(`SAVEPOINT sp_${i}`)
        }

        try {
          await client.query(stmt)
          statementsExecuted++
          if (useSavepoints) {
            await client.query(`RELEASE SAVEPOINT sp_${i}`)
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err)
          statementsFailed++
          errors.push({
            statementIndex: i,
            statement: stmt.slice(0, 500),
            error: errorMessage
          })

          if (options.onError === 'abort') {
            if (options.useTransaction) {
              await client.query('ROLLBACK').catch(() => {})
            }
            throw new Error(`Statement ${i + 1} failed: ${errorMessage}`)
          }

          if (useSavepoints) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_${i}`)
          }

          // skip-and-continue
          statementsSkipped++
          log.warn(`Skipping statement ${i + 1}: ${errorMessage}`)
        }

        sendProgress('executing', statements.length, stmt)
      }

      if (options.useTransaction) {
        await client.query('COMMIT')
      }
    } finally {
      await client.end().catch(() => {})
    }

    const result: PgImportResult = {
      success: true,
      statementsExecuted,
      statementsSkipped,
      statementsFailed,
      errors,
      durationMs: Date.now() - startTime
    }

    sendProgress('complete', statements.length, '')
    log.info(
      `Import complete: ${statementsExecuted} executed, ${statementsSkipped} skipped, ${statementsFailed} failed in ${result.durationMs}ms`
    )

    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.error('Import failed:', error)

    onProgress({
      phase: 'error',
      statementsExecuted,
      totalStatements: 0,
      currentStatement: '',
      errorsEncountered: statementsFailed,
      error: message
    })

    return {
      success: false,
      statementsExecuted,
      statementsSkipped,
      statementsFailed,
      errors,
      durationMs: Date.now() - startTime
    }
  } finally {
    closeTunnel(tunnelSession)
  }
}
