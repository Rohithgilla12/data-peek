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
        console.log('SSH connected, starting TCP proxy...')

        server = net.createServer((socket) => {
          ssh!.forwardOut('127.0.0.1', 0, '127.0.0.1', config.dstPort, (err, stream) => {
            if (err) {
              console.error('Forward error:', err)
              socket.destroy()
              closeTunnel({ ssh, server })
              return
            }

            stream.on('error', (err: Error) => {
              console.error('Stream error:', err)
              closeTunnel({ ssh, server })
              socket.destroy()
            })

            socket.on('error', (err) => {
              console.error('Socket error:', err)
              stream.end()
              closeTunnel({ ssh, server })
            })
            socket.pipe(stream).pipe(socket)
          })
        })

        server.on('error', (error) => {
          console.error('Server error', error)
          closeTunnel({ ssh, server })
          reject(error)
        })

        server.listen(0, '127.0.0.1', () => {
          const proxyPort = (server!.address() as net.AddressInfo).port
          config.port = proxyPort
          console.log(`Tunnel: localhost:${proxyPort} → ${sshConfig.host}:${config.dstPort}`)
          resolve({ ssh, server })
        })
      })

      ssh.once('error', (error) => {
        console.error('SSH error', error)
        closeTunnel({ ssh, server })
        reject(error)
      })

      ssh.on('close', () => {
        console.log('SSH closed')
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
      console.error('Something went wrong while creating a tunnel', err)
      closeTunnel({ ssh, server })
      reject(err)
    }
  })
}

export function closeTunnel(tunnelSession: TunnelSession | null) {
  if (!tunnelSession) return
  closeServer(tunnelSession.server)
  closeSSHSession(tunnelSession.ssh)
  console.log('SSH tunnel closed')
}

function closeSSHSession(ssh: SSHClient | null) {
  if (ssh) {
    ssh.end()
  }
}

function closeServer(server: net.Server | null) {
  if (server) {
    server.close()
  }
}
