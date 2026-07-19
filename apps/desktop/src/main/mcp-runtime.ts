/**
 * Light indirection so other main-process modules (e.g. harness-service) can ask
 * "is the MCP server live, and on what port/token?" without importing the MCP
 * server, Electron, or the SDK — which keeps their unit tests dependency-free.
 *
 * mcp-handlers registers the provider once it owns the settings store + service;
 * callers get null whenever the server isn't running.
 */

export interface McpRuntimeInfo {
  port: number
  token: string
  url: string
}

let provider: (() => McpRuntimeInfo | null) | null = null

export function setMcpRuntimeProvider(fn: () => McpRuntimeInfo | null): void {
  provider = fn
}

export function getMcpRuntimeInfo(): McpRuntimeInfo | null {
  return provider ? provider() : null
}
