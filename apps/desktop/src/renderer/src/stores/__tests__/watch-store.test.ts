import { describe, it, expect, beforeEach } from 'vitest'
import { useWatchStore } from '../watch-store'
import { CADENCE_FLOOR_MS } from '@/lib/watch-types'
import type { WatchSnapshot, WatchDiff } from '@/lib/watch-types'

const TAB = 'tab-1'

function makeSnap(overrides: Partial<WatchSnapshot> = {}): WatchSnapshot {
  return {
    tick: 1,
    capturedAt: Date.now(),
    rowCount: 0,
    durationMs: 12,
    error: null,
    rows: [],
    fields: [],
    ...overrides
  }
}

function makeDiff(overrides: Partial<WatchDiff> = {}): WatchDiff {
  return {
    cells: new Map(),
    addedRowKeys: new Set(),
    removedRowKeys: new Set(),
    keyingStrategy: 'row_position',
    keyColumns: [],
    computedAt: Date.now(),
    ...overrides
  }
}

describe('useWatchStore', () => {
  beforeEach(() => {
    useWatchStore.setState({ states: {} })
  })

  it('start creates an enabled state with merged config', () => {
    useWatchStore.getState().start(TAB, { cadenceMs: 1500 })
    const st = useWatchStore.getState().getState(TAB)
    expect(st?.enabled).toBe(true)
    expect(st?.paused).toBe(false)
    expect(st?.config.cadenceMs).toBe(1500)
  })

  it('clamps cadence below the floor', () => {
    useWatchStore.getState().start(TAB, { cadenceMs: 10 })
    const st = useWatchStore.getState().getState(TAB)
    expect(st?.config.cadenceMs).toBe(CADENCE_FLOOR_MS)
  })

  it('stop removes the state entirely', () => {
    useWatchStore.getState().start(TAB)
    useWatchStore.getState().stop(TAB)
    expect(useWatchStore.getState().getState(TAB)).toBeNull()
  })

  it('pause / resume toggle the paused flag without losing config', () => {
    useWatchStore.getState().start(TAB, { cadenceMs: 5000 })
    useWatchStore.getState().pause(TAB)
    expect(useWatchStore.getState().getState(TAB)?.paused).toBe(true)
    useWatchStore.getState().resume(TAB)
    expect(useWatchStore.getState().getState(TAB)?.paused).toBe(false)
    expect(useWatchStore.getState().getState(TAB)?.config.cadenceMs).toBe(5000)
  })

  it('applyTick adds snapshot newest-first, capped at historyLimit', () => {
    useWatchStore.getState().start(TAB, { historyLimit: 3 })
    for (let i = 1; i <= 5; i++) {
      useWatchStore.getState().applyTick(TAB, makeSnap({ tick: i }), makeDiff())
    }
    const st = useWatchStore.getState().getState(TAB)
    expect(st?.snapshots.length).toBe(3)
    expect(st?.snapshots.map((s) => s.tick)).toEqual([5, 4, 3])
  })

  it('applyTick increments totals.ticksRun and tracks failures', () => {
    useWatchStore.getState().start(TAB)
    useWatchStore.getState().applyTick(TAB, makeSnap(), makeDiff())
    useWatchStore.getState().applyTick(TAB, makeSnap({ error: 'boom' }), makeDiff())
    const st = useWatchStore.getState().getState(TAB)
    expect(st?.totals.ticksRun).toBe(2)
    expect(st?.totals.ticksFailed).toBe(1)
  })

  it('applyTick counts only fresh diff cells (changedAt === computedAt)', () => {
    useWatchStore.getState().start(TAB)
    const now = 1_000_000
    const diff: WatchDiff = makeDiff({
      cells: new Map([
        ['1:n', { kind: 'changed', changedAt: now, previousValue: 1 }],
        ['1:m', { kind: 'changed', changedAt: now - 1000, previousValue: 2 }]
      ]),
      computedAt: now
    })
    useWatchStore.getState().applyTick(TAB, makeSnap(), diff)
    const st = useWatchStore.getState().getState(TAB)
    // Only the freshly-changed cell should be counted, not the carried one.
    expect(st?.totals.cellsChangedCumulative).toBe(1)
  })

  it('invalidate marks the state then clears it after the tombstone window', async () => {
    useWatchStore.getState().start(TAB)
    useWatchStore.getState().invalidate(TAB, 'sql_edited')
    const mid = useWatchStore.getState().getState(TAB)
    expect(mid?.enabled).toBe(false)
    expect(mid?.invalidatedReason).toBe('sql_edited')

    // Wait for the tombstone cleanup.
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(useWatchStore.getState().getState(TAB)).toBeNull()
  })

  it('updateConfig clamps and merges', () => {
    useWatchStore.getState().start(TAB, { cadenceMs: 5000 })
    useWatchStore.getState().updateConfig(TAB, { cadenceMs: 100, fadeMs: -500 })
    const st = useWatchStore.getState().getState(TAB)
    expect(st?.config.cadenceMs).toBe(CADENCE_FLOOR_MS)
    expect(st?.config.fadeMs).toBe(0)
  })

  it('updateConfig falls back to base for NaN cadence', () => {
    useWatchStore.getState().start(TAB, { cadenceMs: 5000 })
    useWatchStore.getState().updateConfig(TAB, { cadenceMs: NaN })
    expect(useWatchStore.getState().getState(TAB)?.config.cadenceMs).toBe(5000)
  })

  it('updateConfig falls back to base for +Infinity cadence', () => {
    useWatchStore.getState().start(TAB, { cadenceMs: 5000 })
    useWatchStore.getState().updateConfig(TAB, { cadenceMs: Number.POSITIVE_INFINITY })
    expect(useWatchStore.getState().getState(TAB)?.config.cadenceMs).toBe(5000)
  })

  it('updateConfig falls back to base for NaN historyLimit + fadeMs', () => {
    useWatchStore.getState().start(TAB)
    const before = useWatchStore.getState().getState(TAB)?.config
    useWatchStore.getState().updateConfig(TAB, { historyLimit: NaN, fadeMs: NaN })
    const after = useWatchStore.getState().getState(TAB)?.config
    expect(after?.historyLimit).toBe(before?.historyLimit)
    expect(after?.fadeMs).toBe(before?.fadeMs)
  })

  it('start with NaN cadence falls back to default', () => {
    useWatchStore.getState().start(TAB, { cadenceMs: NaN })
    expect(useWatchStore.getState().getState(TAB)?.config.cadenceMs).toBe(5000)
  })

  it('applyTick appends a metric point per tick, oldest-first', () => {
    useWatchStore.getState().start(TAB, { historyLimit: 2 })
    for (let i = 1; i <= 4; i++) {
      useWatchStore.getState().applyTick(TAB, makeSnap({ tick: i, rowCount: i * 10 }), makeDiff())
    }
    const st = useWatchStore.getState().getState(TAB)
    // Snapshots capped at 2 but metrics keep the full trend.
    expect(st?.snapshots.length).toBe(2)
    expect(st?.metrics.map((m) => m.tick)).toEqual([1, 2, 3, 4])
    expect(st?.metrics.map((m) => m.rowCount)).toEqual([10, 20, 30, 40])
  })

  it('applyTick marks errored metric points', () => {
    useWatchStore.getState().start(TAB)
    useWatchStore.getState().applyTick(TAB, makeSnap({ error: 'boom' }), makeDiff())
    expect(useWatchStore.getState().getState(TAB)?.metrics[0]?.errored).toBe(true)
  })

  it('addAlert / removeAlert manage the alert list', () => {
    useWatchStore.getState().start(TAB)
    useWatchStore.getState().addAlert(TAB, { kind: 'row_count', op: 'gt', value: 100 })
    useWatchStore.getState().addAlert(TAB, { kind: 'query_errors' })
    let st = useWatchStore.getState().getState(TAB)
    expect(st?.alerts.length).toBe(2)
    expect(st?.alerts[0].armed).toBe(true)

    useWatchStore.getState().removeAlert(TAB, st!.alerts[0].id)
    st = useWatchStore.getState().getState(TAB)
    expect(st?.alerts.length).toBe(1)
    expect(st?.alerts[0].condition.kind).toBe('query_errors')
  })

  it('setAlerts replaces alert state wholesale', () => {
    useWatchStore.getState().start(TAB)
    useWatchStore.getState().addAlert(TAB, { kind: 'any_change' })
    const alert = useWatchStore.getState().getState(TAB)!.alerts[0]
    useWatchStore.getState().setAlerts(TAB, [{ ...alert, firedCount: 3 }])
    expect(useWatchStore.getState().getState(TAB)?.alerts[0].firedCount).toBe(3)
  })

  it('alert actions are no-ops for unknown tabs', () => {
    useWatchStore.getState().addAlert('ghost', { kind: 'any_change' })
    useWatchStore.getState().removeAlert('ghost', 'nope')
    useWatchStore.getState().setAlerts('ghost', [])
    expect(useWatchStore.getState().getState('ghost')).toBeNull()
  })

  it('isWatching reflects enabled flag', () => {
    expect(useWatchStore.getState().isWatching(TAB)).toBe(false)
    useWatchStore.getState().start(TAB)
    expect(useWatchStore.getState().isWatching(TAB)).toBe(true)
    useWatchStore.getState().pause(TAB)
    // Paused still counts as watching for the indicator; only stop/invalidate clears.
    expect(useWatchStore.getState().isWatching(TAB)).toBe(true)
    useWatchStore.getState().stop(TAB)
    expect(useWatchStore.getState().isWatching(TAB)).toBe(false)
  })
})
