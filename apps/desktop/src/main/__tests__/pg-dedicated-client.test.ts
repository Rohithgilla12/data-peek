import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import type { ConnectionConfig } from '@shared/index'

const { ClientCtor } = vi.hoisted(() => ({ ClientCtor: vi.fn() }))

vi.mock('pg', () => ({ Client: ClientCtor }))
vi.mock('../ssh-tunnel-service', () => ({
  createTunnel: vi.fn(),
  closeTunnel: vi.fn()
}))

import { createTunnel, closeTunnel, type TunnelSession } from '../ssh-tunnel-service'
import {
  createPgDedicatedClient,
  createPgNotificationClient
} from '../adapters/pg-dedicated-client'

/**
 * A stand-in for pg.Client that keeps the event surface real — the module's whole job
 * is wiring 'error'/'end'/'notification' into one contract, so the emitter has to
 * behave like the driver's does.
 */
class FakePgClient extends EventEmitter {
  static created: FakePgClient[] = []
  config: Record<string, unknown>
  connectImpl: () => Promise<void> = async () => {}
  endCalls = 0
  queryImpl: (sql: string, params?: unknown[]) => Promise<unknown> = async () => ({
    rows: [],
    fields: [],
    rowCount: 0
  })

  constructor(config: Record<string, unknown>) {
    super()
    this.config = config
    FakePgClient.created.push(this)
  }

  connect(): Promise<void> {
    return this.connectImpl()
  }

  query(sql: string, params?: unknown[]): Promise<unknown> {
    return this.queryImpl(sql, params)
  }

  async end(): Promise<void> {
    this.endCalls++
  }
}

function makeConfig(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    id: 'cfg-1',
    name: 'test',
    dbType: 'postgresql',
    host: 'db.example.com',
    port: 5432,
    database: 'app',
    user: 'u',
    password: 'p',
    ...overrides
  } as ConnectionConfig
}

const tunnel = {
  localHost: '127.0.0.1',
  localPort: 61234,
  ssh: undefined
} as unknown as TunnelSession

beforeEach(() => {
  FakePgClient.created = []
  ClientCtor.mockReset()
  // A plain function, not an arrow: the module calls this with `new`, and returning an
  // object from a constructor call is what substitutes the fake for the real client.
  ClientCtor.mockImplementation(function (config: Record<string, unknown>) {
    return new FakePgClient(config)
  })
  vi.mocked(createTunnel).mockReset().mockResolvedValue(tunnel)
  vi.mocked(closeTunnel).mockReset()
})

/** The single client the module built for this test. */
function onlyClient(): FakePgClient {
  expect(FakePgClient.created).toHaveLength(1)
  return FakePgClient.created[0]
}

describe('createPgDedicatedClient', () => {
  it('builds the connection from the shared client config', async () => {
    await createPgDedicatedClient(makeConfig({ schema: 'bbl', ssl: true }))
    const { config } = onlyClient()
    // The canonical builder is what adds keepalive and the search_path startup option;
    // a hand-rolled config in this file is exactly what issue #249 was about.
    expect(config).toMatchObject({
      host: 'db.example.com',
      port: 5432,
      database: 'app',
      keepAlive: true,
      options: '-c search_path="bbl"'
    })
    expect(config.ssl).toEqual({ rejectUnauthorized: false })
  })

  it('routes through an SSH tunnel and closes it with the client', async () => {
    const client = await createPgDedicatedClient(makeConfig({ ssh: true }))
    expect(createTunnel).toHaveBeenCalledOnce()
    expect(onlyClient().config).toMatchObject({ host: '127.0.0.1', port: 61234 })
    expect(closeTunnel).not.toHaveBeenCalled()

    await client.close()
    expect(onlyClient().endCalls).toBe(1)
    expect(closeTunnel).toHaveBeenCalledWith(tunnel)
  })

  it('closes the tunnel when the dial fails', async () => {
    ClientCtor.mockImplementation(function (config: Record<string, unknown>) {
      const c = new FakePgClient(config)
      c.connectImpl = async () => {
        throw new Error('connection refused')
      }
      return c
    })

    await expect(createPgDedicatedClient(makeConfig({ ssh: true }))).rejects.toThrow(
      'connection refused'
    )
    expect(closeTunnel).toHaveBeenCalledWith(tunnel)
  })

  it('resolves field types instead of leaving them unknown', async () => {
    const client = await createPgDedicatedClient(makeConfig())
    onlyClient().queryImpl = async () => ({
      rows: [{ id: 1 }],
      // 23 = int4, 25 = text
      fields: [
        { name: 'id', dataTypeID: 23 },
        { name: 'label', dataTypeID: 25 }
      ],
      rowCount: 1
    })

    const result = await client.query('SELECT id, label FROM t')
    expect(result.fields).toEqual([
      { name: 'id', dataType: 'integer', dataTypeID: 23 },
      { name: 'label', dataType: 'text', dataTypeID: 25 }
    ])
    expect(result.rowCount).toBe(1)
  })

  it('passes parameters through only when given', async () => {
    const client = await createPgDedicatedClient(makeConfig())
    const seen: Array<[string, unknown[] | undefined]> = []
    onlyClient().queryImpl = async (sql, params) => {
      seen.push([sql, params])
      return { rows: [], fields: [], rowCount: 0 }
    }

    await client.query('SELECT 1')
    await client.query('SELECT pg_notify($1, $2)', ['ch', 'body'])
    expect(seen).toEqual([
      ['SELECT 1', undefined],
      ['SELECT pg_notify($1, $2)', ['ch', 'body']]
    ])
  })

  it('closes idempotently', async () => {
    const client = await createPgDedicatedClient(makeConfig({ ssh: true }))
    await client.close()
    await client.close()
    expect(onlyClient().endCalls).toBe(1)
    expect(closeTunnel).toHaveBeenCalledOnce()
  })
})

describe('onDisconnect', () => {
  it('reports a socket error once, not again on the trailing end', async () => {
    const client = await createPgDedicatedClient(makeConfig())
    const seen: Array<Error | null> = []
    client.onDisconnect((err) => seen.push(err))

    // pg emits both for one death; a listener that reconnected twice over a single
    // failure would double its backoff for no reason.
    onlyClient().emit('error', new Error('read ECONNRESET'))
    onlyClient().emit('end')

    expect(seen).toHaveLength(1)
    expect(seen[0]?.message).toBe('read ECONNRESET')
  })

  it('reports a clean server-side close as a null error', async () => {
    const client = await createPgDedicatedClient(makeConfig())
    const seen: Array<Error | null> = []
    client.onDisconnect((err) => seen.push(err))

    onlyClient().emit('end')
    expect(seen).toEqual([null])
  })

  it('replays a death that happened before the handler was registered', async () => {
    const client = await createPgDedicatedClient(makeConfig())
    onlyClient().emit('error', new Error('server closed the connection'))

    const seen: Array<Error | null> = []
    client.onDisconnect((err) => seen.push(err))
    expect(seen).toHaveLength(1)
    expect(seen[0]?.message).toBe('server closed the connection')
  })

  it('stays silent for a close the owner asked for', async () => {
    const client = await createPgDedicatedClient(makeConfig())
    const seen: Array<Error | null> = []
    client.onDisconnect((err) => seen.push(err))

    await client.close()
    onlyClient().emit('end')
    expect(seen).toEqual([])
  })

  it('does not let a mid-handshake error escape as an unhandled event', async () => {
    ClientCtor.mockImplementation(function (config: Record<string, unknown>) {
      const c = new FakePgClient(config)
      c.connectImpl = async () => {
        c.emit('error', new Error('SSL negotiation failed'))
        throw new Error('SSL negotiation failed')
      }
      return c
    })

    // An EventEmitter with no 'error' listener throws on emit, so this rejecting with
    // the connect error (rather than the raw emit) is the assertion.
    await expect(createPgDedicatedClient(makeConfig())).rejects.toThrow('SSL negotiation failed')
  })
})

describe('createPgNotificationClient', () => {
  it('forwards notifications with an empty payload defaulted', async () => {
    const client = await createPgNotificationClient(makeConfig())
    const seen: Array<[string, string]> = []
    client.onNotification((channel, payload) => seen.push([channel, payload]))

    onlyClient().emit('notification', { channel: 'jobs', payload: '{"id":1}' })
    onlyClient().emit('notification', { channel: 'ping' })

    expect(seen).toEqual([
      ['jobs', '{"id":1}'],
      ['ping', '']
    ])
  })

  it('carries the same disconnect and close contract', async () => {
    const client = await createPgNotificationClient(makeConfig({ ssh: true }))
    const seen: Array<Error | null> = []
    client.onDisconnect((err) => seen.push(err))

    onlyClient().emit('error', new Error('boom'))
    expect(seen).toHaveLength(1)

    await client.close()
    expect(closeTunnel).toHaveBeenCalledWith(tunnel)
  })
})
