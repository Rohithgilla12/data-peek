import { config } from 'dotenv'
import { resolve } from 'path'
import { existsSync } from 'fs'

// Load environment variables
config({ path: resolve(import.meta.dirname, '../.env') })

import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { Server as SocketIOServer } from 'socket.io'
import { ServerStorage } from './server-storage.js'
import { RpcRouter } from './rpc-router.js'
import { createLogger } from './lib/logger.js'
import { registerConnectionHandlers } from './handlers/connections.js'
import { registerQueryHandlers } from './handlers/queries.js'
import { registerDDLHandlers } from './handlers/ddl.js'
import { registerSavedQueriesHandlers } from './handlers/saved-queries.js'
import { registerSnippetHandlers } from './handlers/snippets.js'
import { registerScheduledQueriesHandlers } from './handlers/scheduled-queries.js'
import { registerDashboardHandlers } from './handlers/dashboards.js'
import { registerAIHandlers } from './handlers/ai.js'
import { registerLicenseHandlers } from './handlers/license.js'
import { initSchemaCache } from './services/schema-cache.js'
import type { ConnectionConfig, SavedQuery, Snippet } from '@shared/index'

const log = createLogger('server')
const PORT = parseInt(process.env.PORT || '3100', 10)
const DATA_DIR = resolve(process.env.DATA_DIR || './data')

async function main() {
  // Initialize Fastify
  const fastify = Fastify({ logger: false })
  await fastify.register(cors, { origin: true })

  // Health check
  fastify.get('/health', async () => ({ status: 'ok', timestamp: Date.now() }))

  // Serve webapp static files if available (production)
  const WEBAPP_DIR = resolve(process.env.WEBAPP_DIR || resolve(import.meta.dirname, '../../webapp/dist'))
  if (existsSync(WEBAPP_DIR)) {
    await fastify.register(fastifyStatic, {
      root: WEBAPP_DIR,
      prefix: '/',
      wildcard: false
    })
    // SPA fallback — serve index.html for all non-API routes
    fastify.setNotFoundHandler(async (_request, reply) => {
      return reply.sendFile('index.html')
    })
    log.info(`Serving webapp from ${WEBAPP_DIR}`)
  }

  // Create HTTP server and attach Socket.IO
  await fastify.listen({ port: PORT, host: '0.0.0.0' })
  const io = new SocketIOServer(fastify.server, {
    cors: { origin: '*' },
    transports: ['websocket']
  })

  // Initialize stores
  const connectionsStore = ServerStorage.create<{ connections: ConnectionConfig[] }>({
    name: 'data-peek-connections',
    defaults: { connections: [] },
    dataDir: DATA_DIR
  })

  const savedQueriesStore = ServerStorage.create<{ savedQueries: SavedQuery[] }>({
    name: 'data-peek-saved-queries',
    defaults: { savedQueries: [] },
    dataDir: DATA_DIR
  })

  const snippetsStore = ServerStorage.create<{ snippets: Snippet[] }>({
    name: 'data-peek-snippets',
    defaults: { snippets: [] },
    dataDir: DATA_DIR
  })

  // Initialize schema cache
  initSchemaCache(DATA_DIR)

  // Create RPC router
  const router = new RpcRouter(io)

  // Register all handlers
  const register = router.handle.bind(router)
  const broadcast = router.broadcast.bind(router)

  registerConnectionHandlers(connectionsStore, register, broadcast)
  registerQueryHandlers(register)
  registerDDLHandlers(register)
  registerSavedQueriesHandlers(savedQueriesStore, register)
  registerSnippetHandlers(snippetsStore, register)
  registerScheduledQueriesHandlers(register)
  registerDashboardHandlers(register, broadcast)
  registerAIHandlers(register)
  registerLicenseHandlers(register)

  // Handle Socket.IO connections
  io.on('connection', (socket) => {
    log.info(`Client connected: ${socket.id}`)
    router.attachSocket(socket)

    socket.on('disconnect', (reason) => {
      log.info(`Client disconnected: ${socket.id} (${reason})`)
    })
  })

  log.info(`Server running on http://0.0.0.0:${PORT}`)
  log.info(`Registered ${router.handlerCount} RPC handlers`)
  log.info(`Data directory: ${DATA_DIR}`)

  // Graceful shutdown
  const shutdown = async () => {
    log.info('Shutting down...')
    io.close()
    await fastify.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason)
})

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
