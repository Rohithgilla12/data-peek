import { Client } from 'pg'
import { createReadStream } from 'fs'
import type {
  ConnectionConfig,
  PgImportOptions,
  PgImportProgress,
  PgImportResult
} from '@shared/index'
import { buildClientConfig } from './adapters/pg-client-config'
import { createTunnel, closeTunnel, TunnelSession } from './ssh-tunnel-service'
import { splitStatementsStream } from './lib/sql-parser'
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
  let statementIndex = 0
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
    if (cancelToken.cancelled) throw new Error('Import cancelled')

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

      sendProgress('executing', 0, 'Starting import...')

      const fileStream = createReadStream(filePath, { highWaterMark: 1024 * 1024 })
      const statementStream = splitStatementsStream(fileStream, 'postgresql')

      for await (const stmt of statementStream) {
        // Strip leading comment lines, then check if real SQL remains
        const stripped = stmt.replace(/^(\s*--[^\n]*\n)*/gm, '').trim()
        if (stripped.length === 0) continue

        if (cancelToken.cancelled) {
          if (options.useTransaction) {
            await client.query('ROLLBACK').catch(() => {})
          }
          throw new Error('Import cancelled')
        }

        const useSavepoints = options.useTransaction && options.onError === 'skip'

        if (useSavepoints) {
          await client.query(`SAVEPOINT sp_${statementIndex}`)
        }

        try {
          await client.query(stripped)
          statementsExecuted++
          if (useSavepoints) {
            await client.query(`RELEASE SAVEPOINT sp_${statementIndex}`)
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err)
          statementsFailed++
          errors.push({
            statementIndex,
            statement: stripped.slice(0, 500),
            error: errorMessage
          })

          if (options.onError === 'abort') {
            if (options.useTransaction) {
              await client.query('ROLLBACK').catch(() => {})
            }
            throw new Error(`Statement ${statementIndex + 1} failed: ${errorMessage}`)
          }

          if (useSavepoints) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_${statementIndex}`)
          }

          // skip-and-continue
          statementsSkipped++
          log.warn(`Skipping statement ${statementIndex + 1}: ${errorMessage}`)
        }

        statementIndex++
        sendProgress('executing', 0, stripped)
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

    sendProgress('complete', 0, '')
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
