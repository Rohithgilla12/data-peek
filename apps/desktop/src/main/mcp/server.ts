import http from 'http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { app } from 'electron'
import { createLogger } from '../lib/logger'
import { registerMcpTools, type McpToolDeps } from './tools'

const log = createLogger('mcp-server')

export const MCP_DEFAULT_PORT = 4722

export class McpService {
  private httpServer: http.Server | null = null

  constructor(private deps: McpToolDeps) {}

  get running(): boolean {
    return this.httpServer !== null
  }

  async start(port: number, token: string): Promise<void> {
    if (this.httpServer) await this.stop()

    const server = http.createServer((req, res) => {
      void this.handleRequest(req, res, token)
    })
    server.keepAliveTimeout = 0

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', reject)
        resolve()
      })
    })

    this.httpServer = server
    log.debug(`MCP server listening on 127.0.0.1:${port}`)
  }

  async stop(): Promise<void> {
    const server = this.httpServer
    if (!server) return
    this.httpServer = null
    await new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    })
    log.debug('MCP server stopped')
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    token: string
  ): Promise<void> {
    try {
      res.setHeader('Connection', 'close')
      if (req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(401).end()
        return
      }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/mcp') {
        res.writeHead(404).end()
        return
      }

      const mcpServer = new McpServer({
        name: 'data-peek',
        version: app?.getVersion?.() ?? '0.0.0'
      })
      registerMcpTools(mcpServer, this.deps)
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      res.on('close', () => {
        void transport.close()
        void mcpServer.close()
      })
      await mcpServer.connect(transport)
      await transport.handleRequest(req, res)
    } catch (err) {
      log.error('MCP request failed:', err)
      if (!res.headersSent) res.writeHead(500).end()
    }
  }
}
