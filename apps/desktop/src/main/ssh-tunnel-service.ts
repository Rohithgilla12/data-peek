import { Client as SSHClient } from 'ssh2'
import net from 'net'
import { ConnectionConfig } from '@shared/index'
import fs from 'fs'

export interface TunnelSession {
  ssh: SSHClient | null
  server: net.Server | null
  /**
   * Sockets currently forwarded through this tunnel.
   *
   * `net.Server#close()` only stops the listener accepting new connections; established
   * sockets keep running and keep the local port bound. (`closeAllConnections()` would do
   * this for us, but it exists on `http.Server`, not `net.Server`.) Tracking them makes
   * teardown deterministic, so a rebuilt tunnel never races a half-dead predecessor
   * still holding its port.
   */
  sockets: Set<net.Socket>
  /** The local proxy host to connect through (always 127.0.0.1) */
  localHost: string
  /** The local proxy port to connect through */
  localPort: number
}

/** The parts of a tunnel needed to tear it down; accepts partially-built sessions. */
type ClosableTunnel = Pick<TunnelSession, 'ssh' | 'server'> &
  Partial<Pick<TunnelSession, 'sockets'>>

export async function createTunnel(config: ConnectionConfig): Promise<TunnelSession> {
  const sshConfig = config.sshConfig
  if (!sshConfig) {
    throw new Error('SSH config is missing for SSH-enabled connection')
  }

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
  const sockets = new Set<net.Socket>()
  return new Promise<TunnelSession>((resolve, reject) => {
    try {
      ssh = new SSHClient()
      ssh.once('ready', () => {
        server = net.createServer((socket) => {
          sockets.add(socket)
          socket.once('close', () => sockets.delete(socket))
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
          closeTunnel({ ssh, server, sockets })
          reject(error)
        })

        server.listen(0, '127.0.0.1', () => {
          const proxyPort = (server!.address() as net.AddressInfo).port
          console.log(`SSH tunnel ready: localhost:${proxyPort} → ${dstHost}:${dstPort}`)
          resolve({ ssh, server, sockets, localHost: '127.0.0.1', localPort: proxyPort })
        })
      })

      ssh.once('error', (error) => {
        console.error('SSH connection error:', error)
        closeTunnel({ ssh, server, sockets })
        reject(error)
      })

      ssh.on('close', () => {
        closeTunnel({ ssh, server, sockets })
      })

      ssh.connect({
        host: sshConfig.host,
        port: sshConfig.port,
        username: sshConfig.user,
        password: sshConfig.authMethod === 'Password' ? sshConfig.password : undefined,
        privateKey,
        passphrase: sshConfig.authMethod === 'Public Key' ? sshConfig.passphrase : undefined,
        readyTimeout: 60000
      })
    } catch (err) {
      console.error('Failed to create SSH tunnel:', err)
      closeTunnel({ ssh, server, sockets })
      reject(err)
    }
  })
}

export function closeTunnel(tunnelSession: ClosableTunnel | null) {
  if (!tunnelSession) return
  closeServer(tunnelSession.server, tunnelSession.sockets)
  closeSSHSession(tunnelSession.ssh)
}

function closeSSHSession(ssh: SSHClient | null) {
  if (ssh) {
    ssh.end()
  }
}

function closeServer(server: net.Server | null, sockets?: Set<net.Socket>) {
  if (!server) return
  server.close((err) => {
    if (err) {
      console.error('Error closing SSH tunnel server:', err)
    }
  })
  // close() only stops the listener accepting new sockets; already-established ones keep
  // running and keep the port bound. Ending the SSH client usually collapses them through
  // the pipe, but only as a side effect and only once the remote half notices.
  if (sockets) {
    for (const socket of sockets) {
      socket.destroy()
    }
    sockets.clear()
  }
}
