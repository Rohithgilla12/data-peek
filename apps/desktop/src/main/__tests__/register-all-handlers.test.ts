import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ConnectionConfig, SavedQuery, Snippet } from '@shared/index'

type Handler = (event: unknown, ...args: unknown[]) => unknown

// Regression coverage for https://github.com/Rohithgilla12/data-peek/issues/174 —
// a native-module load failure during NotebookStorage initialisation must NOT
// prevent the rest of the IPC layer (in particular `db:connect`) from registering.

const hoisted = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  warn: vi.fn(),
  // Stub for each child register* function so we can assert orchestration order
  // and that the right ones run even when notebookStorage is null.
  registerConnectionHandlers: vi.fn(),
  registerQueryHandlers: vi.fn(() => {
    // Simulate the real query handler registering the db:connect channel.
    hoisted.handlers.set('db:connect', () => ({ success: true }))
  }),
  registerDDLHandlers: vi.fn(),
  registerLicenseHandlers: vi.fn(),
  registerSavedQueriesHandlers: vi.fn(),
  registerSnippetHandlers: vi.fn(),
  registerScheduledQueriesHandlers: vi.fn(),
  registerDashboardHandlers: vi.fn(),
  registerAIHandlers: vi.fn(),
  registerFileHandlers: vi.fn(),
  registerWindowHandlers: vi.fn(),
  registerColumnStatsHandlers: vi.fn(),
  registerImportHandlers: vi.fn(),
  registerDataGenHandlers: vi.fn(),
  registerPgNotifyHandlers: vi.fn(),
  registerHealthHandlers: vi.fn(),
  registerPgExportImportHandlers: vi.fn(),
  registerNotebookHandlers: vi.fn(),
  registerIntelHandlers: vi.fn(),
  registerStepHandlers: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      hoisted.handlers.set(channel, handler)
    })
  }
}))

vi.mock('../lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: hoisted.warn,
    error: vi.fn()
  })
}))

vi.mock('../ipc/connection-handlers', () => ({
  registerConnectionHandlers: hoisted.registerConnectionHandlers
}))
vi.mock('../ipc/query-handlers', () => ({
  registerQueryHandlers: hoisted.registerQueryHandlers
}))
vi.mock('../ipc/ddl-handlers', () => ({ registerDDLHandlers: hoisted.registerDDLHandlers }))
vi.mock('../ipc/license-handlers', () => ({
  registerLicenseHandlers: hoisted.registerLicenseHandlers
}))
vi.mock('../ipc/saved-queries-handlers', () => ({
  registerSavedQueriesHandlers: hoisted.registerSavedQueriesHandlers
}))
vi.mock('../ipc/snippet-handlers', () => ({
  registerSnippetHandlers: hoisted.registerSnippetHandlers
}))
vi.mock('../ipc/scheduled-queries-handlers', () => ({
  registerScheduledQueriesHandlers: hoisted.registerScheduledQueriesHandlers
}))
vi.mock('../ipc/dashboard-handlers', () => ({
  registerDashboardHandlers: hoisted.registerDashboardHandlers
}))
vi.mock('../ipc/ai-handlers', () => ({ registerAIHandlers: hoisted.registerAIHandlers }))
vi.mock('../ipc/file-handlers', () => ({ registerFileHandlers: hoisted.registerFileHandlers }))
vi.mock('../ipc/window-handler', () => ({
  registerWindowHandlers: hoisted.registerWindowHandlers
}))
vi.mock('../ipc/column-stats-handlers', () => ({
  registerColumnStatsHandlers: hoisted.registerColumnStatsHandlers
}))
vi.mock('../ipc/import-handlers', () => ({
  registerImportHandlers: hoisted.registerImportHandlers
}))
vi.mock('../ipc/data-gen-handlers', () => ({
  registerDataGenHandlers: hoisted.registerDataGenHandlers
}))
vi.mock('../ipc/pg-notify-handlers', () => ({
  registerPgNotifyHandlers: hoisted.registerPgNotifyHandlers
}))
vi.mock('../ipc/health-handlers', () => ({
  registerHealthHandlers: hoisted.registerHealthHandlers
}))
vi.mock('../ipc/pg-export-import-handlers', () => ({
  registerPgExportImportHandlers: hoisted.registerPgExportImportHandlers
}))
vi.mock('../ipc/notebook-handlers', () => ({
  registerNotebookHandlers: hoisted.registerNotebookHandlers
}))
vi.mock('../ipc/intel-handlers', () => ({
  registerIntelHandlers: hoisted.registerIntelHandlers
}))
vi.mock('../ipc/step-handlers', () => ({ registerStepHandlers: hoisted.registerStepHandlers }))

import { registerAllHandlers } from '../ipc'
import type { DpStorage } from '../storage'
import type { NotebookStorage } from '../notebook-storage'
import type { StepSessionRegistry } from '../step-session'

function makeStubStore<T extends Record<string, unknown>>(): DpStorage<T> {
  return {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    has: vi.fn(),
    reset: vi.fn()
  } as unknown as DpStorage<T>
}

function makeStores() {
  return {
    connections: makeStubStore<{ connections: ConnectionConfig[] }>(),
    savedQueries: makeStubStore<{ savedQueries: SavedQuery[] }>(),
    snippets: makeStubStore<{ snippets: Snippet[] }>()
  }
}

const stubStepSessionRegistry = {} as StepSessionRegistry

beforeEach(() => {
  hoisted.handlers.clear()
  hoisted.warn.mockReset()
  hoisted.registerConnectionHandlers.mockReset()
  hoisted.registerQueryHandlers.mockReset().mockImplementation(() => {
    hoisted.handlers.set('db:connect', () => ({ success: true }))
  })
  hoisted.registerDDLHandlers.mockReset()
  hoisted.registerLicenseHandlers.mockReset()
  hoisted.registerSavedQueriesHandlers.mockReset()
  hoisted.registerSnippetHandlers.mockReset()
  hoisted.registerScheduledQueriesHandlers.mockReset()
  hoisted.registerDashboardHandlers.mockReset()
  hoisted.registerAIHandlers.mockReset()
  hoisted.registerFileHandlers.mockReset()
  hoisted.registerWindowHandlers.mockReset()
  hoisted.registerColumnStatsHandlers.mockReset()
  hoisted.registerImportHandlers.mockReset()
  hoisted.registerDataGenHandlers.mockReset()
  hoisted.registerPgNotifyHandlers.mockReset()
  hoisted.registerHealthHandlers.mockReset()
  hoisted.registerPgExportImportHandlers.mockReset()
  hoisted.registerNotebookHandlers.mockReset()
  hoisted.registerIntelHandlers.mockReset()
  hoisted.registerStepHandlers.mockReset()
})

describe('registerAllHandlers', () => {
  it('registers db:connect and other core handlers when notebookStorage is provided', () => {
    const stores = makeStores()
    const fakeNotebookStorage = {} as NotebookStorage

    registerAllHandlers(stores, fakeNotebookStorage, stubStepSessionRegistry)

    expect(hoisted.registerQueryHandlers).toHaveBeenCalledTimes(1)
    expect(hoisted.registerConnectionHandlers).toHaveBeenCalledWith(stores.connections)
    expect(hoisted.registerNotebookHandlers).toHaveBeenCalledWith(fakeNotebookStorage)
    expect(hoisted.handlers.has('db:connect')).toBe(true)
  })

  it('still registers db:connect (and skips notebook handlers) when notebookStorage is null', () => {
    // Regression for issue #174: better-sqlite3 native-module failure left
    // notebookStorage null, which previously threw and short-circuited the
    // whole handler registration sequence.
    const stores = makeStores()

    expect(() =>
      registerAllHandlers(stores, null, stubStepSessionRegistry)
    ).not.toThrow()

    expect(hoisted.registerQueryHandlers).toHaveBeenCalledTimes(1)
    expect(hoisted.registerConnectionHandlers).toHaveBeenCalledTimes(1)
    expect(hoisted.registerDDLHandlers).toHaveBeenCalledTimes(1)
    expect(hoisted.registerLicenseHandlers).toHaveBeenCalledTimes(1)
    expect(hoisted.handlers.has('db:connect')).toBe(true)

    // Notebook handlers are the one thing we deliberately skip.
    expect(hoisted.registerNotebookHandlers).not.toHaveBeenCalled()
    expect(hoisted.warn).toHaveBeenCalledWith(
      expect.stringContaining('NotebookStorage unavailable')
    )
  })

  it('registers every non-notebook handler regardless of notebookStorage availability', () => {
    const stores = makeStores()

    registerAllHandlers(stores, null, stubStepSessionRegistry)

    expect(hoisted.registerConnectionHandlers).toHaveBeenCalled()
    expect(hoisted.registerQueryHandlers).toHaveBeenCalled()
    expect(hoisted.registerDDLHandlers).toHaveBeenCalled()
    expect(hoisted.registerLicenseHandlers).toHaveBeenCalled()
    expect(hoisted.registerSavedQueriesHandlers).toHaveBeenCalled()
    expect(hoisted.registerSnippetHandlers).toHaveBeenCalled()
    expect(hoisted.registerScheduledQueriesHandlers).toHaveBeenCalled()
    expect(hoisted.registerDashboardHandlers).toHaveBeenCalled()
    expect(hoisted.registerAIHandlers).toHaveBeenCalled()
    expect(hoisted.registerFileHandlers).toHaveBeenCalled()
    expect(hoisted.registerWindowHandlers).toHaveBeenCalled()
    expect(hoisted.registerColumnStatsHandlers).toHaveBeenCalled()
    expect(hoisted.registerImportHandlers).toHaveBeenCalled()
    expect(hoisted.registerDataGenHandlers).toHaveBeenCalled()
    expect(hoisted.registerPgNotifyHandlers).toHaveBeenCalled()
    expect(hoisted.registerHealthHandlers).toHaveBeenCalled()
    expect(hoisted.registerPgExportImportHandlers).toHaveBeenCalled()
    expect(hoisted.registerIntelHandlers).toHaveBeenCalled()
    expect(hoisted.registerStepHandlers).toHaveBeenCalled()
  })
})
