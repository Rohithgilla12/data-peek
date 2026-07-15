import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { TimeMachineRunMeta, TimeMachineSnapshot } from '@data-peek/shared'
import { useTimeMachineStore } from '../time-machine-store'

const listRunsMock = vi.fn()
const getSnapshotMock = vi.fn()
const deleteRunMock = vi.fn().mockResolvedValue({ success: true })

vi.stubGlobal('window', {
  api: {
    timeMachine: {
      listRuns: listRunsMock,
      getSnapshot: getSnapshotMock,
      deleteRun: deleteRunMock
    }
  }
})

const TAB = 'tab-1'

function makeMeta(overrides: Partial<TimeMachineRunMeta> = {}): TimeMachineRunMeta {
  return {
    id: 'run-1',
    connectionId: 'conn-1',
    fingerprint: 'select * from users',
    sql: 'SELECT * FROM users',
    capturedAt: 1750000000000,
    durationMs: 12,
    rowCount: 2,
    storedRowCount: 2,
    truncated: false,
    contentHash: 'hash-1',
    keyStrategy: 'primary_key',
    keyColumns: ['id'],
    hasRows: true,
    ...overrides
  }
}

function makeSnapshot(overrides: Partial<TimeMachineSnapshot> = {}): TimeMachineSnapshot {
  return {
    ...makeMeta(),
    columns: [
      { name: 'id', dataType: 'int4' },
      { name: 'status', dataType: 'text' }
    ],
    rows: [
      [1, 'active'],
      [2, 'pending']
    ],
    ...overrides
  }
}

beforeEach(() => {
  useTimeMachineStore.setState({ states: {} })
  listRunsMock.mockReset()
  getSnapshotMock.mockReset()
  deleteRunMock.mockClear()
})

describe('strip lifecycle', () => {
  it('openStrip creates fresh state, closeStrip resets selection back to live', () => {
    const store = useTimeMachineStore.getState()
    store.openStrip(TAB)
    expect(store.getState(TAB)?.open).toBe(true)

    useTimeMachineStore.setState((s) => ({
      states: {
        ...s.states,
        [TAB]: { ...s.states[TAB], selectedRunId: 'run-1', snapshot: makeSnapshot() }
      }
    }))
    useTimeMachineStore.getState().closeStrip(TAB)
    const st = useTimeMachineStore.getState().getState(TAB)
    expect(st?.open).toBe(false)
    expect(st?.selectedRunId).toBeNull()
    expect(st?.snapshot).toBeNull()
  })

  it('stop removes all state for the tab', () => {
    useTimeMachineStore.getState().openStrip(TAB)
    useTimeMachineStore.getState().stop(TAB)
    expect(useTimeMachineStore.getState().getState(TAB)).toBeNull()
  })
})

describe('loadRuns', () => {
  it('populates fingerprint and runs on success', async () => {
    const runs = [makeMeta(), makeMeta({ id: 'run-2', capturedAt: 1749990000000 })]
    listRunsMock.mockResolvedValue({
      success: true,
      data: { fingerprint: 'fp-1', runs }
    })
    useTimeMachineStore.getState().openStrip(TAB)
    await useTimeMachineStore.getState().loadRuns(TAB, 'conn-1', 'SELECT * FROM users')
    const st = useTimeMachineStore.getState().getState(TAB)
    expect(st?.fingerprint).toBe('fp-1')
    expect(st?.runs).toHaveLength(2)
    expect(st?.isLoading).toBe(false)
  })

  it('surfaces the error without wiping runs already shown', async () => {
    listRunsMock.mockResolvedValue({ success: false, error: 'storage unavailable' })
    useTimeMachineStore.getState().openStrip(TAB)
    await useTimeMachineStore.getState().loadRuns(TAB, 'conn-1', 'SELECT 1')
    const st = useTimeMachineStore.getState().getState(TAB)
    expect(st?.error).toBe('storage unavailable')
    expect(st?.isLoading).toBe(false)
  })

  it('drops the selection when the selected run vanished from the new list', async () => {
    useTimeMachineStore.getState().openStrip(TAB)
    useTimeMachineStore.setState((s) => ({
      states: {
        ...s.states,
        [TAB]: {
          ...s.states[TAB],
          selectedRunId: 'gone',
          snapshot: makeSnapshot({ id: 'gone' })
        }
      }
    }))
    listRunsMock.mockResolvedValue({
      success: true,
      data: { fingerprint: 'fp-1', runs: [makeMeta()] }
    })
    await useTimeMachineStore.getState().loadRuns(TAB, 'conn-1', 'SELECT 1')
    const st = useTimeMachineStore.getState().getState(TAB)
    expect(st?.selectedRunId).toBeNull()
    expect(st?.snapshot).toBeNull()
  })

  it('ignores a stale response that resolves after a newer request', async () => {
    useTimeMachineStore.getState().openStrip(TAB)
    let resolveFirst: (v: unknown) => void = () => {}
    listRunsMock
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({
        success: true,
        data: { fingerprint: 'fp-new', runs: [makeMeta({ id: 'new-run' })] }
      })
    const first = useTimeMachineStore.getState().loadRuns(TAB, 'conn-1', 'SELECT 1')
    const second = useTimeMachineStore.getState().loadRuns(TAB, 'conn-1', 'SELECT 2')
    await second
    resolveFirst({
      success: true,
      data: { fingerprint: 'fp-stale', runs: [] }
    })
    await first
    const st = useTimeMachineStore.getState().getState(TAB)
    expect(st?.fingerprint).toBe('fp-new')
    expect(st?.runs[0]?.id).toBe('new-run')
  })
})

describe('selectRun', () => {
  it('loads the snapshot and enters view mode', async () => {
    useTimeMachineStore.getState().openStrip(TAB)
    useTimeMachineStore.setState((s) => ({
      states: { ...s.states, [TAB]: { ...s.states[TAB], runs: [makeMeta()] } }
    }))
    getSnapshotMock.mockResolvedValue({ success: true, data: makeSnapshot() })
    await useTimeMachineStore.getState().selectRun(TAB, 'run-1')
    const st = useTimeMachineStore.getState().getState(TAB)
    expect(st?.selectedRunId).toBe('run-1')
    expect(st?.snapshot?.rows).toHaveLength(2)
    expect(st?.diff).toBeNull()
  })

  it('refuses to view metadata-only runs', async () => {
    useTimeMachineStore.getState().openStrip(TAB)
    useTimeMachineStore.setState((s) => ({
      states: {
        ...s.states,
        [TAB]: { ...s.states[TAB], runs: [makeMeta({ hasRows: false })] }
      }
    }))
    await useTimeMachineStore.getState().selectRun(TAB, 'run-1')
    expect(getSnapshotMock).not.toHaveBeenCalled()
    expect(useTimeMachineStore.getState().getState(TAB)?.selectedRunId).toBeNull()
  })

  it('selectRun(null) returns to live', async () => {
    useTimeMachineStore.getState().openStrip(TAB)
    useTimeMachineStore.setState((s) => ({
      states: {
        ...s.states,
        [TAB]: {
          ...s.states[TAB],
          runs: [makeMeta()],
          selectedRunId: 'run-1',
          snapshot: makeSnapshot()
        }
      }
    }))
    await useTimeMachineStore.getState().selectRun(TAB, null)
    const st = useTimeMachineStore.getState().getState(TAB)
    expect(st?.selectedRunId).toBeNull()
    expect(st?.snapshot).toBeNull()
  })
})

describe('selectCompare', () => {
  function seedTwoRuns(): { older: TimeMachineRunMeta; newer: TimeMachineRunMeta } {
    const older = makeMeta({ id: 'older', capturedAt: 1749990000000, contentHash: 'h-a' })
    const newer = makeMeta({ id: 'newer', capturedAt: 1750000000000, contentHash: 'h-b' })
    useTimeMachineStore.getState().openStrip(TAB)
    useTimeMachineStore.setState((s) => ({
      states: {
        ...s.states,
        [TAB]: { ...s.states[TAB], runs: [newer, older], selectedRunId: newer.id }
      }
    }))
    return { older, newer }
  }

  it('computes a PK-keyed diff between two runs', async () => {
    const { older, newer } = seedTwoRuns()
    getSnapshotMock.mockImplementation((id: string) =>
      Promise.resolve({
        success: true,
        data:
          id === older.id
            ? makeSnapshot({
                id: older.id,
                rows: [
                  [1, 'active'],
                  [2, 'pending']
                ]
              })
            : makeSnapshot({
                id: newer.id,
                rows: [
                  [1, 'active'],
                  [2, 'shipped'],
                  [3, 'new']
                ]
              })
      })
    )
    await useTimeMachineStore.getState().selectCompare(TAB, older.id)
    const st = useTimeMachineStore.getState().getState(TAB)
    expect(st?.selectedRunId).toBe(newer.id)
    expect(st?.compareRunId).toBe(older.id)
    expect(st?.snapshot?.id).toBe(newer.id)
    expect(st?.diff).not.toBeNull()
    expect(st?.diff?.addedRowKeys.size).toBe(1)
    expect(st?.diff?.removedRowKeys.size).toBe(0)
    const changed = [...st!.diff!.cells.values()].filter((c) => c.kind === 'changed')
    expect(changed).toHaveLength(1)
    expect(changed[0].previousValue).toBe('pending')
  })

  it('orients the diff older → newer regardless of click order', async () => {
    const older = makeMeta({ id: 'older', capturedAt: 1749990000000 })
    const newer = makeMeta({ id: 'newer', capturedAt: 1750000000000 })
    useTimeMachineStore.getState().openStrip(TAB)
    useTimeMachineStore.setState((s) => ({
      states: {
        ...s.states,
        [TAB]: { ...s.states[TAB], runs: [newer, older], selectedRunId: older.id }
      }
    }))
    getSnapshotMock.mockImplementation((id: string) =>
      Promise.resolve({ success: true, data: makeSnapshot({ id }) })
    )
    await useTimeMachineStore.getState().selectCompare(TAB, newer.id)
    const st = useTimeMachineStore.getState().getState(TAB)
    expect(st?.selectedRunId).toBe('newer')
    expect(st?.compareRunId).toBe('older')
  })

  it('falls back to position keying when the runs disagree on key columns', async () => {
    const older = makeMeta({ id: 'older', capturedAt: 1, keyColumns: ['uuid'] })
    const newer = makeMeta({ id: 'newer', capturedAt: 2, keyColumns: ['id'] })
    useTimeMachineStore.getState().openStrip(TAB)
    useTimeMachineStore.setState((s) => ({
      states: {
        ...s.states,
        [TAB]: { ...s.states[TAB], runs: [newer, older], selectedRunId: newer.id }
      }
    }))
    getSnapshotMock.mockImplementation((id: string) =>
      Promise.resolve({ success: true, data: makeSnapshot({ id }) })
    )
    await useTimeMachineStore.getState().selectCompare(TAB, older.id)
    expect(useTimeMachineStore.getState().getState(TAB)?.diff?.keyingStrategy).toBe('row_position')
  })
})

describe('applyCapture', () => {
  it('prepends when the fingerprint matches the loaded timeline', () => {
    useTimeMachineStore.getState().openStrip(TAB)
    useTimeMachineStore.setState((s) => ({
      states: {
        ...s.states,
        [TAB]: { ...s.states[TAB], fingerprint: 'fp-1', runs: [makeMeta({ id: 'old' })] }
      }
    }))
    useTimeMachineStore.getState().applyCapture(TAB, makeMeta({ id: 'fresh', fingerprint: 'fp-1' }))
    const st = useTimeMachineStore.getState().getState(TAB)
    expect(st?.runs.map((r) => r.id)).toEqual(['fresh', 'old'])
  })

  it('reloads the timeline when the fingerprint changed', () => {
    listRunsMock.mockResolvedValue({
      success: true,
      data: { fingerprint: 'fp-2', runs: [makeMeta({ id: 'other' })] }
    })
    useTimeMachineStore.getState().openStrip(TAB)
    useTimeMachineStore.setState((s) => ({
      states: { ...s.states, [TAB]: { ...s.states[TAB], fingerprint: 'fp-1' } }
    }))
    useTimeMachineStore.getState().applyCapture(TAB, makeMeta({ id: 'fresh', fingerprint: 'fp-2' }))
    expect(listRunsMock).toHaveBeenCalledWith('conn-1', 'SELECT * FROM users')
  })

  it('is a no-op for tabs with no open strip state', () => {
    useTimeMachineStore.getState().applyCapture(TAB, makeMeta())
    expect(useTimeMachineStore.getState().getState(TAB)).toBeNull()
  })
})

describe('deleteRun', () => {
  it('removes the run optimistically and resets the view when it was on screen', async () => {
    useTimeMachineStore.getState().openStrip(TAB)
    useTimeMachineStore.setState((s) => ({
      states: {
        ...s.states,
        [TAB]: {
          ...s.states[TAB],
          runs: [makeMeta({ id: 'a' }), makeMeta({ id: 'b' })],
          selectedRunId: 'a',
          snapshot: makeSnapshot({ id: 'a' })
        }
      }
    }))
    await useTimeMachineStore.getState().deleteRun(TAB, 'a')
    const st = useTimeMachineStore.getState().getState(TAB)
    expect(st?.runs.map((r) => r.id)).toEqual(['b'])
    expect(st?.selectedRunId).toBeNull()
    expect(st?.snapshot).toBeNull()
    expect(deleteRunMock).toHaveBeenCalledWith('a')
  })
})
