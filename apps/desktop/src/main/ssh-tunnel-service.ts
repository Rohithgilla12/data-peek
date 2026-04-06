import { Client as SSHClient } from 'ssh2'
import net from 'net'
import { ConnectionConfig } from '@shared/index'
import fs from 'fs'

export interface TunnelSession {
  /** The connection ID this tunnel belongs to */
  connectionId: string
  ssh: SSHClient | null
  server: net.Server | null
  /** The local proxy host to connect through (always 127.0.0.1) */
  localHost: string
  /** The local proxy port to connect through */
  localPort: number
}

// ── Tunnel pool ──────────────────────────────────────────────────────────────
// Tunnels are cached by connection ID so consecutive operations reuse the same
// SSH connection instead of creating a new one for every query.

interface PoolEntry {
  session: TunnelSession
  refCount: number
  idleTimer?: ReturnType<typeof setTimeout>
}

const pool = new Map<string, PoolEntry>()

/** How long an idle tunnel stays open before being closed (ms) */
const IDLE_TIMEOUT_MS = 30_000

/**
 * Acquire an SSH tunnel for the given connection.
 * If a healthy tunnel already exists for this connection ID it is reused.
 * Otherwise a fresh tunnel is created.
 */
export async function createTunnel(config: ConnectionConfig): Promise<TunnelSession> {
  const sshConfig = config.sshConfig
  if (!sshConfig) {
    throw new Error('SSH config is missing for SSH-enabled connection')
  }

  const key = config.id

  // Check for an existing healthy tunnel
  const existing = pool.get(key)
  if (existing) {
    const { session } = existing
    if (session.ssh && session.server?.listening) {
      existing.refCount++
      if (existing.idleTimer) {
        clearTimeout(existing.idleTimer)
        existing.idleTimer = undefined
      }
      return session
    }
    // Stale tunnel — clean up and create fresh
    forceCloseResources(session.ssh, session.server)
    pool.delete(key)
  }

  const session = await openTunnel(config)

  // Track in pool
  pool.set(key, { session, refCount: 1 })

  // If SSH connection drops unexpectedly, remove from pool
  if (session.ssh) {
    session.ssh.on('close', () => {
      const entry = pool.get(key)
      if (entry && entry.session === session) {
        if (entry.idleTimer) clearTimeout(entry.idleTimer)
        // SSH already closed, just close the server
        forceCloseResources(null, entry.session.server)
        pool.delete(key)
      }
    })
  }

  return session
}

/**
 * Release an SSH tunnel after use.
 * The tunnel is kept alive for a short period so the next operation can reuse
 * it. If nothing uses it within the idle timeout it is closed automatically.
 */
export function closeTunnel(tunnelSession: TunnelSession | null) {
  if (!tunnelSession) return

  const entry = pool.get(tunnelSession.connectionId)
  if (entry && entry.session === tunnelSession) {
    entry.refCount = Math.max(0, entry.refCount - 1)
    if (entry.refCount <= 0 && !entry.idleTimer) {
      entry.idleTimer = setTimeout(() => {
        forceCloseResources(entry.session.ssh, entry.session.server)
        pool.delete(tunnelSession.connectionId)
      }, IDLE_TIMEOUT_MS)
    }
    return
  }

  // Not in pool (shouldn't happen in normal flow) — close immediately
  forceCloseResources(tunnelSession.ssh, tunnelSession.server)
}

/**
 * Immediately close and remove a tunnel for a given connection ID.
 * Call this when the user explicitly disconnects from a database.
 */
export function disconnectTunnel(connectionId: string) {
  const entry = pool.get(connectionId)
  if (!entry) return
  if (entry.idleTimer) clearTimeout(entry.idleTimer)
  forceCloseResources(entry.session.ssh, entry.session.server)
  pool.delete(connectionId)
}

/**
 * Close all active tunnels. Call on app quit.
 */
export function closeAllTunnels() {
  for (const [key, entry] of pool) {
    if (entry.idleTimer) clearTimeout(entry.idleTimer)
    forceCloseResources(entry.session.ssh, entry.session.server)
    pool.delete(key)
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function forceCloseResources(ssh: SSHClient | null, server: net.Server | null) {
  if (server) {
    server.close((err) => {
      if (err) console.error('Error closing SSH tunnel server:', err)
    })
  }
  if (ssh) {
    ssh.end()
  }
}

async function openTunnel(config: ConnectionConfig): Promise<TunnelSession> {
  const sshConfig = config.sshConfig!
  const dstHost = config.host
  const dstPort = config.dstPort || config.port

  let privateKey: string | undefined
  if (sshConfig.authMethod === 'Public Key') {
    try {
      privateKey = await fs.promises.readFile(sshConfig.privateKeyPath, 'utf-8')
    } catch (err) {
      throw new Error(`Failed to read private key: ${(err as Error).message}`)
    }
  }

  let server: net.Server | null = null
  let ssh: SSHClient | null = null
  return new Promise<TunnelSession>((resolve, reject) => {
    try {
      ssh = new SSHClient()
      ssh.once('ready', () => {
        server = net.createServer((socket) => {
          ssh!.forwardOut('127.0.0.1', 0, dstHost, dstPort, (err, stream) => {
            if (err) {
              console.error('SSH tunnel forward error:', err)
              socket.destroy()
              return
            }

            stream.on('error', (err: Error) => {
              console.error('SSH tunnel stream error:', err)
              stream.end()
              socket.destroy()
            })

            socket.on('error', (err) => {
              console.error('SSH tunnel socket error:', err)
              stream.destroy()
              socket.destroy()
            })
            socket.pipe(stream).pipe(socket)
          })
        })

        server.on('error', (error) => {
          console.error('SSH tunnel server error:', error)
          forceCloseResources(ssh, server)
          reject(error)
        })

        server.listen(0, '127.0.0.1', () => {
          const proxyPort = (server!.address() as net.AddressInfo).port
          console.log(`SSH tunnel ready: localhost:${proxyPort} → ${dstHost}:${dstPort}`)
          resolve({
            connectionId: config.id,
            ssh,
            server,
            localHost: '127.0.0.1',
            localPort: proxyPort
          })
        })
      })

      ssh.once('error', (error) => {
        console.error('SSH connection error:', error)
        forceCloseResources(ssh, server)
        reject(error)
      })

      const connectOptions: Record<string, unknown> = {
        host: sshConfig.host,
        port: sshConfig.port,
        username: sshConfig.user,
        readyTimeout: 60000
      }

      if (sshConfig.authMethod === 'Password') {
        connectOptions.password = sshConfig.password
      } else if (sshConfig.authMethod === 'Public Key') {
        connectOptions.privateKey = privateKey
        if (sshConfig.passphrase) {
          connectOptions.passphrase = sshConfig.passphrase
        }
      } else if (sshConfig.authMethod === 'SSH Agent') {
        // Use the system SSH agent (ssh-agent on Unix, Pageant on Windows)
        connectOptions.agent = process.env.SSH_AUTH_SOCK
      }

      ssh.connect(connectOptions as Parameters<SSHClient['connect']>[0])
    } catch (err) {
      console.error('Failed to create SSH tunnel:', err)
      forceCloseResources(ssh, server)
      reject(err)
    }
  })
}
