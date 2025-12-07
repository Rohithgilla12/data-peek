import { Client as SSHClient } from 'ssh2'
import net from 'net'
import { ConnectionConfig } from '@shared/index'
import fs from 'fs'

let ssh: SSHClient | null = null
let server: net.Server | null = null

export async function createTunnel(config: ConnectionConfig) {
  return new Promise<void>((resolve, reject) => {
    ssh = new SSHClient()
    const sshConfig = config.sshConfig
    if (!sshConfig) {
      return
    }
    ssh.on('ready', () => {
      console.log('SSH connected, starting TCP proxy...')

      server = net.createServer((socket) => {
        ssh!.forwardOut('127.0.0.1', 0, '127.0.0.1', config.dstPort, (err, stream) => {
          if (err) {
            socket.destroy()
            return
          }

          socket.pipe(stream).pipe(socket)
        })
      })
      server.listen(0, '127.0.0.1', () => {
        const proxyPort = (server!.address() as net.AddressInfo).port
        config.port = proxyPort
        console.log(`Tunnel: localhost:${proxyPort} → ${sshConfig.host}: ${config.dstPort}`)
        resolve()
      })

      server.on('error', reject)
    })

    ssh.on('error', reject)

    ssh.connect({
      host: sshConfig.host,
      port: sshConfig.port,
      username: sshConfig.user,
      password: sshConfig.authMethod === 'Password' ? sshConfig.password : undefined,
      privateKey:
        sshConfig.authMethod === 'Public Key'
          ? fs.readFileSync(sshConfig.privateKeyPath, 'utf-8')
          : undefined,
      passphrase: sshConfig.authMethod === 'Public Key' ? sshConfig.passphrase : undefined
    })
  })
}

export function closeTunnel() {
  if (server) {
    server.close()
    server = null
  }
  if (ssh) {
    ssh.end()
    ssh = null
  }
  console.log('SSH tunnel closed')
}
