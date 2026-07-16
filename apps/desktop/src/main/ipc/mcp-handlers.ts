import { ipcMain } from 'electron'
import { randomBytes } from 'crypto'
import type { ConnectionConfig, McpServerStatus } from '@shared/index'
import type { PersistentStore } from '../storage'
import { windowManager } from '../window-manager'
import { wrapHandler } from './types'
import { McpService, MCP_DEFAULT_PORT } from '../mcp/server'
import { ApprovalManager } from '../mcp/approval'

export interface McpSettings {
  enabled: boolean
  port: number
  token: string
}

export const MCP_SETTINGS_DEFAULTS: McpSettings = {
  enabled: false,
  port: MCP_DEFAULT_PORT,
  token: ''
}

type McpStore = PersistentStore<{ mcpSettings: McpSettings }>

// The approval manager lives on the service instance so tools and IPC share it
export interface McpServiceWithApproval extends McpService {
  approval: ApprovalManager
}

export function createMcpService(getConnections: () => ConnectionConfig[]): McpServiceWithApproval {
  const approval = new ApprovalManager(
    (req) => windowManager.broadcastToAll('mcp:approval:request', req),
    undefined,
    (id) => windowManager.broadcastToAll('mcp:approval:resolved', { id })
  )
  const service = new McpService({ getConnections, approval }) as McpServiceWithApproval
  service.approval = approval
  return service
}

function ensureToken(store: McpStore): McpSettings {
  const settings = store.get('mcpSettings', MCP_SETTINGS_DEFAULTS)
  if (!settings.token) {
    const updated = { ...settings, token: randomBytes(32).toString('hex') }
    store.set('mcpSettings', updated)
    return updated
  }
  return settings
}

function toStatus(settings: McpSettings, service: McpService): McpServerStatus {
  return {
    enabled: settings.enabled,
    running: service.running,
    port: settings.port,
    token: settings.token,
    url: `http://127.0.0.1:${settings.port}/mcp`
  }
}

async function applyEnabled(
  store: McpStore,
  service: McpService,
  enabled: boolean
): Promise<McpServerStatus> {
  const settings = ensureToken(store)
  if (enabled) {
    await service.start(settings.port, settings.token) // throws on port busy; enabled stays false
    store.set('mcpSettings', { ...settings, enabled: true })
    return toStatus({ ...settings, enabled: true }, service)
  }
  await service.stop()
  store.set('mcpSettings', { ...settings, enabled: false })
  return toStatus({ ...settings, enabled: false }, service)
}

export async function startMcpIfEnabled(store: McpStore, service: McpService): Promise<void> {
  const settings = store.get('mcpSettings', MCP_SETTINGS_DEFAULTS)
  if (!settings.enabled) return
  const withToken = ensureToken(store)
  try {
    await service.start(withToken.port, withToken.token)
  } catch {
    // Port taken at launch: stay stopped; the settings UI shows running=false
  }
}

export function registerMcpHandlers(store: McpStore, service: McpServiceWithApproval): void {
  ipcMain.handle(
    'mcp:status',
    wrapHandler(async () => toStatus(ensureToken(store), service))
  )

  ipcMain.handle(
    'mcp:setEnabled',
    wrapHandler(async (_e, { enabled }: { enabled: boolean }) =>
      applyEnabled(store, service, enabled)
    )
  )

  ipcMain.handle(
    'mcp:setPort',
    wrapHandler(async (_e, { port }: { port: number }) => {
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new Error('Port must be between 1024 and 65535')
      }
      const settings = ensureToken(store)
      const updated = { ...settings, port }
      if (service.running) {
        await service.stop()
        try {
          await service.start(updated.port, updated.token)
        } catch (err) {
          try {
            await service.start(settings.port, settings.token)
          } catch {
            // Best-effort restart with old settings failed; leave stopped
          }
          throw err
        }
      }
      store.set('mcpSettings', updated)
      return toStatus(updated, service)
    })
  )

  ipcMain.handle(
    'mcp:regenerateToken',
    wrapHandler(async () => {
      const settings = store.get('mcpSettings', MCP_SETTINGS_DEFAULTS)
      const updated = { ...settings, token: randomBytes(32).toString('hex') }
      if (service.running) {
        await service.stop()
        try {
          await service.start(updated.port, updated.token)
        } catch (err) {
          try {
            await service.start(settings.port, settings.token)
          } catch {
            // Best-effort restart with old settings failed; leave stopped
          }
          throw err
        }
      }
      store.set('mcpSettings', updated)
      return toStatus(updated, service)
    })
  )

  ipcMain.handle(
    'mcp:approval:respond',
    wrapHandler(async (_e, { id, approved }: { id: string; approved: boolean }) => {
      service.approval.respond(id, approved)
    })
  )
}
