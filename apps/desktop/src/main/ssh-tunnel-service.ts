import { Client as SSHClient } from 'ssh2'
import net from 'net'
import { ConnectionConfig } from '@shared/index'
import fs from 'fs'

export interface TunnelSession {
  ssh: SSHClient | null
  server: net.Server | null
}

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
          closeTunnel({ ssh, server })
          reject(error)
        })

        server.listen(0, '127.0.0.1', () => {
          const proxyPort = (server!.address() as net.AddressInfo).port
          config.host = '127.0.0.1'
          config.port = proxyPort
          console.log(`SSH tunnel ready: localhost:${proxyPort} → ${dstHost}:${dstPort}`)
          resolve({ ssh, server })
        })
      })

      ssh.once('error', (error) => {
        console.error('SSH connection error:', error)
        closeTunnel({ ssh, server })
        reject(error)
      })

      ssh.on('close', () => {
        closeTunnel({ ssh, server })
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
      closeTunnel({ ssh, server })
      reject(err)
    }
  })
}

export function closeTunnel(tunnelSession: TunnelSession | null) {
  if (!tunnelSession) return
  closeServer(tunnelSession.server)
  closeSSHSession(tunnelSession.ssh)
}

function closeSSHSession(ssh: SSHClient | null) {
  if (ssh) {
    ssh.end()
  }
}

function closeServer(server: net.Server | null) {
  if (server) {
    server.close((err) => {
      if (err) {
        console.error('Error closing SSH tunnel server:', err)
      }
    })
  }
}
