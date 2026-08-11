import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConnectionConfig } from '@shared/index'

vi.mock('../ssh-tunnel-service', () => ({
  createTunnel: vi.fn(),
  closeTunnel: vi.fn()
}))
vi.mock('../lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

import { createTunnel, closeTunnel, type TunnelSession } from '../ssh-tunnel-service'
import { PoolRegistry, type PoolRegistryOptions } from '../adapters/pool-registry'

/**
 * The registry is shared by every driver, so these cover the lifecycle guarantees the
 * adapters rely on rather than any one driver's pool type.
 */

interface FakePool {
  id: number
  destroyed: boolean
}

let nextPoolId = 0
let created: FakePool[] = []
let destroy: ReturnType<typeof vi.fn<(pool: FakePool) => Promise<void>>>

function newFakePool(): FakePool {
  const pool = { id: nextPoolId++, destroyed: false }
  created.push(pool)
  return pool
}

function makeRegistry(overrides: Partial<PoolRegistryOptions<FakePool>> = {}) {
  return new PoolRegistry<FakePool>({
    driver: 'fake',
    create: newFakePool,
    destroy,
    ...overrides
  })
}

let counter = 0
function makeConfig(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    id: `cfg-${++counter}`,
    name: 'test',
    host: 'localhost',
    port: 5432,
    database: 'db',
    user: 'u',
    password: 'p',
    dbType: 'postgresql',
    dstPort: 5432,
    ...overrides
  }
}

function makeTunnel(port = 54320): TunnelSession {
  return {
    ssh: null,
    server: null,
    sockets: new Set(),
    localHost: '127.0.0.1',
    localPort: port
  }
}

beforeEach(() => {
  nextPoolId = 0
  created = []
  destroy = vi.fn(async (pool: FakePool) => {
    pool.destroyed = true
  })
  vi.mocked(createTunnel).mockReset()
  vi.mocked(closeTunnel).mockReset()
})

describe('PoolRegistry', () => {
  it('shares one pool across concurrent first-use callers', async () => {
    const registry = makeRegistry()
    const cfg = makeConfig()

    const entries = await Promise.all(Array.from({ length: 5 }, () => registry.getOrCreate(cfg)))

    expect(created).toHaveLength(1)
    expect(new Set(entries.map((e) => e.pool.id)).size).toBe(1)
  })

  it('reuses one pool across sequential acquisitions', async () => {
    const registry = makeRegistry()
    const cfg = makeConfig()

    await registry.getOrCreate(cfg)
    await registry.getOrCreate(cfg)

    expect(created).toHaveLength(1)
  })

  it('builds a new pool when the connection shape changes, and retires the old one', async () => {
    // Ticking "Use SSL" on a saved connection must not reuse the plaintext pool.
    const registry = makeRegistry()
    const saved = makeConfig()
    await registry.getOrCreate(saved)

    await registry.getOrCreate({ ...saved, ssl: true })

    expect(created).toHaveLength(2)
    expect(created[0].destroyed).toBe(true)
    expect(created[1].destroyed).toBe(false)
  })

  it('keys driver-specific config through fingerprintExtras', async () => {
    const registry = makeRegistry({
      fingerprintExtras: (config: ConnectionConfig) => ({ schema: config.schema ?? '' })
    })
    const base = makeConfig()

    await registry.getOrCreate({ ...base, schema: 'bbl' })
    await registry.getOrCreate({ ...base, schema: 'fel' })

    expect(created).toHaveLength(2)
  })

  it('does not collide across drivers sharing one connection id', async () => {
    const a = makeRegistry()
    const b = new PoolRegistry<FakePool>({ driver: 'other', create: newFakePool, destroy })
    const cfg = makeConfig()

    await a.getOrCreate(cfg)
    await b.getOrCreate(cfg)

    expect(created).toHaveLength(2)
  })

  it('closes a connection built from a newer shape when handed the pre-edit config', async () => {
    // connections:update tears down using the *previous* stored config, while a Test
    // Connection during that edit may already have built a pool from the new shape.
    const registry = makeRegistry()
    const saved = makeConfig()
    const edited = { ...saved, ssl: true }
    await registry.getOrCreate(edited)

    await registry.close(saved)

    expect(created[0].destroyed).toBe(true)
    await registry.getOrCreate(edited)
    expect(created).toHaveLength(2)
  })

  it('disposes a pool whose creation finished after it was superseded', async () => {
    // SSH tunnel setup widens this window considerably.
    const registry = makeRegistry()
    const cfg = makeConfig({
      ssh: true,
      sshConfig: {
        host: 'bastion',
        port: 22,
        user: 'x',
        authMethod: 'Password',
        privateKeyPath: ''
      }
    })

    let finishSlowDial: (t: TunnelSession) => void = () => {}
    vi.mocked(createTunnel).mockReturnValueOnce(
      new Promise<TunnelSession>((resolve) => {
        finishSlowDial = resolve
      })
    )
    const slow = registry.getOrCreate(cfg)

    // A newer shape lands and installs while the first is still dialing.
    vi.mocked(createTunnel).mockResolvedValueOnce(makeTunnel(54321))
    await registry.getOrCreate({ ...cfg, ssl: true })

    finishSlowDial(makeTunnel())
    await expect(slow).rejects.toThrow(/closed before initialization/)

    // The slow dial builds its pool last, when its tunnel finally resolves. It must tear
    // itself down rather than linger as a second live pool under one identity, while the
    // newer shape that won the race stays up.
    expect(created).toHaveLength(2)
    expect(created[0].destroyed).toBe(false)
    expect(created[1].destroyed).toBe(true)
  })

  it('still closes the tunnel when close() hits a hanging destroy()', async () => {
    // closeTunnel runs after the destroy, so an unbounded destroy that never settles
    // would strand the SSH tunnel and its bound local port for the rest of the session.
    vi.useFakeTimers()
    try {
      const tunnel = makeTunnel()
      vi.mocked(createTunnel).mockResolvedValueOnce(tunnel)
      const registry = makeRegistry()
      const cfg = makeConfig({
        ssh: true,
        sshConfig: {
          host: 'bastion',
          port: 22,
          user: 'x',
          authMethod: 'Password',
          privateKeyPath: ''
        }
      })
      await registry.getOrCreate(cfg)
      destroy.mockReturnValueOnce(new Promise<void>(() => {}))

      const closed = registry.close(cfg)
      await vi.advanceTimersByTimeAsync(2_500)
      await expect(closed).resolves.toBeUndefined()

      expect(closeTunnel).toHaveBeenCalledWith(tunnel)
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves the registry reusable after closeAll (guard is transient, not latched)', async () => {
    // On macOS the process routinely outlives a cleanup pass.
    const registry = makeRegistry()
    await registry.getOrCreate(makeConfig())

    await registry.closeAll()

    await expect(registry.getOrCreate(makeConfig())).resolves.toBeDefined()
  })

  it('does not wedge when a destroy() hangs', async () => {
    vi.useFakeTimers()
    try {
      const registry = makeRegistry()
      await registry.getOrCreate(makeConfig())
      destroy.mockReturnValueOnce(new Promise<void>(() => {}))

      const closed = registry.closeAll()
      await vi.advanceTimersByTimeAsync(2_500)
      await expect(closed).resolves.toBeUndefined()

      await expect(registry.getOrCreate(makeConfig())).resolves.toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('coalesces concurrent closeAll calls without wedging the guard', async () => {
    const registry = makeRegistry()
    await registry.getOrCreate(makeConfig())

    await Promise.all([registry.closeAll(), registry.closeAll()])

    await expect(registry.getOrCreate(makeConfig())).resolves.toBeDefined()
  })

  it('closes the tunnel when pool creation throws', async () => {
    const tunnel = makeTunnel()
    vi.mocked(createTunnel).mockResolvedValueOnce(tunnel)
    const registry = makeRegistry({
      create: () => {
        throw new Error('handshake rejected')
      }
    })

    await expect(
      registry.getOrCreate(
        makeConfig({
          ssh: true,
          sshConfig: {
            host: 'bastion',
            port: 22,
            user: 'x',
            authMethod: 'Password',
            privateKeyPath: ''
          }
        })
      )
    ).rejects.toThrow('handshake rejected')

    expect(closeTunnel).toHaveBeenCalledWith(tunnel)
  })

  it('passes the tunnel endpoint to create() as host/port overrides', async () => {
    const create = vi.fn(newFakePool)
    vi.mocked(createTunnel).mockResolvedValueOnce(makeTunnel(54999))
    const registry = makeRegistry({ create })

    await registry.getOrCreate(
      makeConfig({
        ssh: true,
        sshConfig: {
          host: 'bastion',
          port: 22,
          user: 'x',
          authMethod: 'Password',
          privateKeyPath: ''
        }
      })
    )

    expect(create).toHaveBeenCalledWith(expect.anything(), { host: '127.0.0.1', port: 54999 })
  })

  it('passes no overrides when the connection does not use SSH', async () => {
    const create = vi.fn(newFakePool)
    const registry = makeRegistry({ create })

    await registry.getOrCreate(makeConfig())

    expect(create).toHaveBeenCalledWith(expect.anything(), undefined)
    expect(createTunnel).not.toHaveBeenCalled()
  })
})
