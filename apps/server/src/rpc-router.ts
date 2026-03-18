import type { Server as SocketIOServer, Socket } from 'socket.io'

type RpcHandler = (args: any) => Promise<{ success: boolean; data?: any; error?: string }>

interface RpcMessage {
  channel: string
  args?: unknown
}

export class RpcRouter {
  private handlers = new Map<string, RpcHandler>()
  private io: SocketIOServer

  constructor(io: SocketIOServer) {
    this.io = io
  }

  /**
   * Register an RPC handler for a channel.
   * Mirrors ipcMain.handle(channel, handler) pattern.
   */
  handle(channel: string, handler: RpcHandler): void {
    if (this.handlers.has(channel)) {
      console.warn(`[rpc] Handler already registered for channel: ${channel}`)
    }
    this.handlers.set(channel, handler)
  }

  /**
   * Broadcast an event to all connected clients.
   * Mirrors windowManager.broadcastToAll() pattern.
   */
  broadcast(event: string, data?: unknown): void {
    this.io.emit('event', { event, data })
  }

  /**
   * Attach RPC listener to a socket connection.
   * Called once per client connection.
   */
  attachSocket(socket: Socket): void {
    socket.on('rpc', async (message: RpcMessage, ack: (response: any) => void) => {
      const { channel, args } = message

      const handler = this.handlers.get(channel)
      if (!handler) {
        const response = { success: false, error: `Unknown channel: ${channel}` }
        if (typeof ack === 'function') ack(response)
        return
      }

      try {
        const result = await handler(args)
        if (typeof ack === 'function') ack(result)
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        console.error(`[rpc] Error in handler "${channel}":`, errorMessage)
        if (typeof ack === 'function') {
          ack({ success: false, error: errorMessage })
        }
      }
    })
  }

  /**
   * Get count of registered handlers (for logging/debug).
   */
  get handlerCount(): number {
    return this.handlers.size
  }

  /**
   * List all registered channel names.
   */
  get channels(): string[] {
    return Array.from(this.handlers.keys())
  }
}
