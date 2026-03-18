import { io, type Socket } from 'socket.io-client'

interface RpcMessage {
  channel: string
  args?: unknown
}

interface ServerEvent {
  event: string
  data: unknown
}

export class SocketTransport {
  private socket: Socket
  private eventListeners = new Map<string, Set<Function>>()

  constructor(url?: string) {
    // When url is undefined, Socket.IO connects to the same origin that served the page
    this.socket = io(url ?? undefined, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    })

    this.socket.on('connect', () => {
      console.log('[socket] Connected to server')
    })

    this.socket.on('disconnect', (reason) => {
      console.log('[socket] Disconnected:', reason)
    })

    this.socket.on('event', ({ event, data }: ServerEvent) => {
      this.eventListeners.get(event)?.forEach((cb) => cb(data))
    })
  }

  invoke(channel: string, args?: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`RPC timeout: ${channel}`))
      }, 30000)

      this.socket.emit('rpc', { channel, args } satisfies RpcMessage, (response: any) => {
        clearTimeout(timeout)
        resolve(response)
      })
    })
  }

  on(event: string, callback: Function): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(callback)
    return () => {
      this.eventListeners.get(event)?.delete(callback)
    }
  }

  get connected(): boolean {
    return this.socket.connected
  }

  disconnect(): void {
    this.socket.disconnect()
  }
}
