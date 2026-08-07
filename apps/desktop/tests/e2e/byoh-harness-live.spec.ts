import { test, expect } from './fixtures/electron-app'
import { startSeededPostgres, type SeededPostgres } from './fixtures/postgres'
import type { AIProvider, SchemaInfo } from '@data-peek/shared'

/**
 * Live BYOH harness checks — the manual pre-release checklist from #254 / #255,
 * automated. Deliberately excluded from the default suite: it spawns the real
 * `claude` / `codex` / `agy` CLIs and burns the operator's own subscription
 * quota, so CI (which has none of them, signed in or otherwise) must not run it.
 *
 *   pnpm exec playwright test byoh-harness-live --workers=1   # with BYOH_LIVE=1
 */
test.skip(!process.env.BYOH_LIVE, 'live harness run — set BYOH_LIVE=1 to opt in')

// Real CLI round-trips, agentic ones especially, dwarf the 60s default.
test.setTimeout(300_000)

let pg: SeededPostgres

test.beforeAll(async () => {
  pg = await startSeededPostgres()
})

test.afterAll(async () => {
  await pg?.stop()
})

/** Save the seeded connection, fetch its schema, and select a harness provider. */
async function prepare(
  window: import('@playwright/test').Page,
  provider: AIProvider
): Promise<SchemaInfo[]> {
  await window.evaluate((cfg) => window.api.connections.add(cfg), pg.config)
  await window.evaluate(
    (p) => window.api.ai.setConfig({ provider: p as AIProvider, model: 'default' }),
    provider
  )
  // db.schemas resolves to DatabaseSchemaResponse — the SchemaInfo[] is under `.schemas`.
  const schemas = await window.evaluate(
    (cfg) => window.api.db.schemas(cfg, true).then((r) => r.data?.schemas ?? []),
    pg.config
  )
  expect(schemas.length, 'seeded schema came back empty').toBeGreaterThan(0)
  return schemas as SchemaInfo[]
}

/**
 * Start the embedded MCP server on a port nobody else holds. Ports are unique per
 * test and off the 4722 default — the operator's own running data-peek usually has
 * that one, and `setEnabled` rejects rather than falling back when the port is busy.
 * Same convention as mcp-server.spec.ts, one range up so the two can run together.
 */
async function startMcp(window: import('@playwright/test').Page, port: number): Promise<void> {
  const portResult = await window.evaluate((p) => window.api.mcp.setPort(p), port)
  expect(portResult.success, `setPort(${port}) failed: ${portResult.error}`).toBe(true)
  const result = await window.evaluate(() => window.api.mcp.setEnabled(true))
  expect(result.success, `MCP server failed to start on ${port}: ${result.error}`).toBe(true)
  expect(result.data?.running, `MCP server reported not running on ${port}`).toBe(true)
}

async function stopMcp(window: import('@playwright/test').Page): Promise<void> {
  const result = await window.evaluate(() => window.api.mcp.setEnabled(false))
  expect(result.success, `MCP server failed to stop: ${result.error}`).toBe(true)
  expect(result.data?.running).toBe(false)
}

test('all three harness CLIs are detected with versions', async ({ window }) => {
  for (const provider of ['claude-cli', 'codex-cli', 'antigravity-cli'] as AIProvider[]) {
    const detection = await window.evaluate(
      (p) => window.api.ai.detectHarness(p as AIProvider).then((r) => r.data),
      provider
    )
    expect(detection?.available, `${provider} not detected: ${detection?.error}`).toBe(true)
    expect(detection?.version, `${provider} reported no version`).toBeTruthy()
    console.log(`  ${provider} → ${detection?.version} (${detection?.path})`)
  }
})

test('claude grounds against the live DB when the MCP server is on', async ({ window }) => {
  const schemas = await prepare(window, 'claude-cli')
  await startMcp(window, 47241)

  const res = await window.evaluate(
    ([s, cfg]) =>
      window.api.ai.chat(
        [{ role: 'user', content: 'How many users are in this database?' }],
        s as SchemaInfo[],
        'postgresql',
        (cfg as { id: string }).id
      ),
    [schemas, pg.config] as const
  )

  expect(res.error).toBeUndefined()
  expect(res.success).toBe(true)
  expect(res.meta?.agentic).toBe(true)
  expect(res.meta?.grounded).toBe(true)
  console.log(`  claude+MCP → grounded=${res.meta?.grounded} turns=${res.meta?.turns}`)
})

test('claude still answers with runnable SQL when the MCP server is off', async ({ window }) => {
  const schemas = await prepare(window, 'claude-cli')
  // Server defaults to off, but stop it explicitly so the assertion can't pass by luck.
  await stopMcp(window)

  const res = await window.evaluate(
    ([s, cfg]) =>
      window.api.ai.chat(
        [{ role: 'user', content: 'How many users are in this database?' }],
        s as SchemaInfo[],
        'postgresql',
        (cfg as { id: string }).id
      ),
    [schemas, pg.config] as const
  )

  expect(res.error).toBeUndefined()
  expect(res.success).toBe(true)
  // The whole point: chat degrades to schema-only instead of refusing to run.
  expect(res.meta?.agentic).toBe(false)
  expect(res.meta?.grounded).toBe(false)
  expect(res.data?.sql, 'expected runnable SQL, not a fabricated prose answer').toBeTruthy()
  console.log(`  claude−MCP → type=${res.data?.type} sql=${res.data?.sql}`)
})

for (const [index, provider] of (['codex-cli', 'antigravity-cli'] as AIProvider[]).entries()) {
  test(`${provider} answers with SQL and claims no grounding`, async ({ window }) => {
    const schemas = await prepare(window, provider)
    // MCP up on purpose: these harnesses must stay non-agentic even when it's available.
    await startMcp(window, 47242 + index)

    const res = await window.evaluate(
      ([s, cfg]) =>
        window.api.ai.chat(
          [{ role: 'user', content: 'How many users are in this database?' }],
          s as SchemaInfo[],
          'postgresql',
          (cfg as { id: string }).id
        ),
      [schemas, pg.config] as const
    )

    expect(res.error).toBeUndefined()
    expect(res.success).toBe(true)
    expect(res.meta?.agentic).toBe(false)
    expect(res.meta?.grounded).toBe(false)
    expect(res.data?.sql, 'expected runnable SQL, not a fabricated prose answer').toBeTruthy()
    expect(['query', 'metric', 'chart']).toContain(res.data?.type)
    console.log(`  ${provider} → type=${res.data?.type} sql=${res.data?.sql}`)
  })
}

test('codex dashboard generation is refused with a clear message', async ({ window }) => {
  const schemas = await prepare(window, 'codex-cli')
  // MCP up so the refusal is provably the capability gate, not a missing server.
  await startMcp(window, 47244)

  const res = await window.evaluate(
    ([s, cfg]) =>
      window.api.ai.generateDashboard(
        'Design a useful overview dashboard',
        s as SchemaInfo[],
        'postgresql',
        (cfg as { id: string }).id
      ),
    [schemas, pg.config] as const
  )

  expect(res.success).toBe(false)
  expect(res.error).toContain('not supported by this harness yet')
})

test('switching provider mid-conversation starts a fresh CLI session', async ({ window }) => {
  const schemas = await prepare(window, 'codex-cli')
  await startMcp(window, 47245)

  const first = await window.evaluate(
    ([s, cfg]) =>
      window.api.ai.chatStream(
        [{ role: 'user', content: 'List the tables you can see.' }],
        s as SchemaInfo[],
        'postgresql',
        (cfg as { id: string }).id,
        undefined,
        () => {}
      ),
    [schemas, pg.config] as const
  )
  expect(first.success, `codex turn failed: ${first.error}`).toBe(true)
  const codexSession = first.meta?.sessionId
  expect(codexSession, 'codex returned no session id to carry forward').toBeTruthy()

  // Switch harness. The renderer drops a foreign session ref (resolveHarnessResumeId,
  // unit-tested); the live assertion is that the next turn succeeds rather than
  // dying on `--resume <codex-thread-id>`.
  await window.evaluate(() =>
    window.api.ai.setConfig({ provider: 'claude-cli' as AIProvider, model: 'default' })
  )

  const second = await window.evaluate(
    ([s, cfg]) =>
      window.api.ai.chatStream(
        [{ role: 'user', content: 'Now count the rows in the users table.' }],
        s as SchemaInfo[],
        'postgresql',
        (cfg as { id: string }).id,
        undefined,
        () => {}
      ),
    [schemas, pg.config] as const
  )
  expect(second.success, `claude turn after switch failed: ${second.error}`).toBe(true)
  expect(second.meta?.sessionId).not.toBe(codexSession)
  console.log(`  codex session ${codexSession} → claude session ${second.meta?.sessionId}`)
})
