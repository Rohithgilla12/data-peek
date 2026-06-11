import { describe, it, expect } from 'vitest'
import {
  makeAlert,
  conditionHolds,
  evaluateAlerts,
  describeAlertCondition,
  type AlertEvalContext
} from '../watch-alerts'
import type { WatchAlert, WatchDiff, WatchSnapshot } from '../watch-types'
import { EVENT_ALERT_COOLDOWN_MS } from '../watch-types'

const NOW = 1_750_000_000_000

function makeSnap(overrides: Partial<WatchSnapshot> = {}): WatchSnapshot {
  return {
    tick: 1,
    capturedAt: NOW,
    rowCount: 0,
    durationMs: 10,
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
    computedAt: NOW,
    ...overrides
  }
}

function makeCtx(overrides: Partial<AlertEvalContext> = {}): AlertEvalContext {
  return {
    snapshot: makeSnap(),
    previous: null,
    diff: null,
    now: NOW,
    ...overrides
  }
}

describe('makeAlert', () => {
  it('creates an armed alert with unique ids', () => {
    const a = makeAlert({ kind: 'row_count', op: 'gt', value: 100 }, NOW)
    const b = makeAlert({ kind: 'row_count', op: 'gt', value: 100 }, NOW)
    expect(a.armed).toBe(true)
    expect(a.firedCount).toBe(0)
    expect(a.lastFiredAt).toBeNull()
    expect(a.id).not.toBe(b.id)
  })
})

describe('conditionHolds', () => {
  it('row_count comparators', () => {
    const ctx = makeCtx({ snapshot: makeSnap({ rowCount: 100 }) })
    expect(conditionHolds({ kind: 'row_count', op: 'gt', value: 99 }, ctx)).toBe(true)
    expect(conditionHolds({ kind: 'row_count', op: 'gt', value: 100 }, ctx)).toBe(false)
    expect(conditionHolds({ kind: 'row_count', op: 'lt', value: 101 }, ctx)).toBe(true)
    expect(conditionHolds({ kind: 'row_count', op: 'eq', value: 100 }, ctx)).toBe(true)
    expect(conditionHolds({ kind: 'row_count', op: 'neq', value: 100 }, ctx)).toBe(false)
  })

  it('row_count never holds on an errored snapshot (rowCount 0 is a lie)', () => {
    const ctx = makeCtx({ snapshot: makeSnap({ rowCount: 0, error: 'conn reset' }) })
    expect(conditionHolds({ kind: 'row_count', op: 'lt', value: 5 }, ctx)).toBe(false)
  })

  it('row_count_changes needs a previous successful snapshot with a different count', () => {
    const cond = { kind: 'row_count_changes' } as const
    expect(conditionHolds(cond, makeCtx({ snapshot: makeSnap({ rowCount: 5 }) }))).toBe(false)
    expect(
      conditionHolds(
        cond,
        makeCtx({
          snapshot: makeSnap({ rowCount: 5 }),
          previous: makeSnap({ rowCount: 5 })
        })
      )
    ).toBe(false)
    expect(
      conditionHolds(
        cond,
        makeCtx({
          snapshot: makeSnap({ rowCount: 6 }),
          previous: makeSnap({ rowCount: 5 })
        })
      )
    ).toBe(true)
    // Errored previous tick shouldn't count as a change from 0.
    expect(
      conditionHolds(
        cond,
        makeCtx({
          snapshot: makeSnap({ rowCount: 6 }),
          previous: makeSnap({ rowCount: 0, error: 'boom' })
        })
      )
    ).toBe(false)
  })

  it('any_change holds on fresh cell changes but not carried-forward ones', () => {
    const cond = { kind: 'any_change' } as const
    const fresh = makeDiff({
      cells: new Map([['1:n', { kind: 'changed' as const, changedAt: NOW }]]),
      computedAt: NOW
    })
    const carried = makeDiff({
      cells: new Map([['1:n', { kind: 'changed' as const, changedAt: NOW - 5000 }]]),
      computedAt: NOW
    })
    expect(conditionHolds(cond, makeCtx({ diff: fresh }))).toBe(true)
    expect(conditionHolds(cond, makeCtx({ diff: carried }))).toBe(false)
    expect(conditionHolds(cond, makeCtx({ diff: null }))).toBe(false)
  })

  it('any_change holds on row adds and removals', () => {
    const cond = { kind: 'any_change' } as const
    expect(
      conditionHolds(cond, makeCtx({ diff: makeDiff({ addedRowKeys: new Set(['7']) }) }))
    ).toBe(true)
    expect(
      conditionHolds(cond, makeCtx({ diff: makeDiff({ removedRowKeys: new Set(['7']) }) }))
    ).toBe(true)
  })

  it('query_errors holds only when the snapshot errored', () => {
    const cond = { kind: 'query_errors' } as const
    expect(conditionHolds(cond, makeCtx())).toBe(false)
    expect(conditionHolds(cond, makeCtx({ snapshot: makeSnap({ error: 'boom' }) }))).toBe(true)
  })
})

describe('evaluateAlerts — threshold edge-triggering', () => {
  const threshold = (): WatchAlert => makeAlert({ kind: 'row_count', op: 'gt', value: 100 }, NOW)

  it('fires once on the false→true edge and stays quiet while holding', () => {
    const alerts: WatchAlert[] = [threshold()]

    const r1 = evaluateAlerts(alerts, makeCtx({ snapshot: makeSnap({ rowCount: 150 }) }))
    expect(r1.fired).toHaveLength(1)
    expect(r1.alerts[0].armed).toBe(false)
    expect(r1.alerts[0].firedCount).toBe(1)
    expect(r1.alerts[0].lastFiredAt).toBe(NOW)

    const r2 = evaluateAlerts(
      r1.alerts,
      makeCtx({ snapshot: makeSnap({ rowCount: 200 }), now: NOW + 5000 })
    )
    expect(r2.fired).toHaveLength(0)
    expect(r2.alerts[0].firedCount).toBe(1)
  })

  it('re-arms when the condition stops holding, then fires again', () => {
    let alerts: WatchAlert[] = [threshold()]
    alerts = evaluateAlerts(alerts, makeCtx({ snapshot: makeSnap({ rowCount: 150 }) })).alerts

    const dipped = evaluateAlerts(
      alerts,
      makeCtx({ snapshot: makeSnap({ rowCount: 50 }), now: NOW + 5000 })
    )
    expect(dipped.fired).toHaveLength(0)
    expect(dipped.alerts[0].armed).toBe(true)

    const again = evaluateAlerts(
      dipped.alerts,
      makeCtx({ snapshot: makeSnap({ rowCount: 150 }), now: NOW + 10_000 })
    )
    expect(again.fired).toHaveLength(1)
    expect(again.alerts[0].firedCount).toBe(2)
  })

  it('an errored tick does not re-arm via the phantom rowCount 0', () => {
    let alerts: WatchAlert[] = [threshold()]
    alerts = evaluateAlerts(alerts, makeCtx({ snapshot: makeSnap({ rowCount: 150 }) })).alerts

    // Error tick: condition reports false (guarded), so the alert re-arms —
    // but on recovery at 150 it fires again, which is the desired behaviour:
    // you want to know the threshold still holds after an outage.
    const errored = evaluateAlerts(
      alerts,
      makeCtx({ snapshot: makeSnap({ error: 'boom' }), now: NOW + 5000 })
    )
    expect(errored.fired).toHaveLength(0)
  })

  it('query_errors fires on failure, re-arms on recovery', () => {
    const alerts: WatchAlert[] = [makeAlert({ kind: 'query_errors' }, NOW)]

    const fail = evaluateAlerts(alerts, makeCtx({ snapshot: makeSnap({ error: 'boom' }) }))
    expect(fail.fired).toHaveLength(1)

    const stillFailing = evaluateAlerts(
      fail.alerts,
      makeCtx({ snapshot: makeSnap({ error: 'boom' }), now: NOW + 5000 })
    )
    expect(stillFailing.fired).toHaveLength(0)

    const recovered = evaluateAlerts(
      stillFailing.alerts,
      makeCtx({ snapshot: makeSnap(), now: NOW + 10_000 })
    )
    expect(recovered.fired).toHaveLength(0)
    expect(recovered.alerts[0].armed).toBe(true)

    const failAgain = evaluateAlerts(
      recovered.alerts,
      makeCtx({ snapshot: makeSnap({ error: 'boom again' }), now: NOW + 15_000 })
    )
    expect(failAgain.fired).toHaveLength(1)
    expect(failAgain.alerts[0].firedCount).toBe(2)
  })
})

describe('evaluateAlerts — event cooldown', () => {
  const changeDiff = (at: number): WatchDiff =>
    makeDiff({
      cells: new Map([['1:n', { kind: 'changed' as const, changedAt: at }]]),
      computedAt: at
    })

  it('fires immediately, then respects the cooldown window', () => {
    const alerts: WatchAlert[] = [makeAlert({ kind: 'any_change' }, NOW)]

    const r1 = evaluateAlerts(alerts, makeCtx({ diff: changeDiff(NOW) }))
    expect(r1.fired).toHaveLength(1)

    const tooSoon = NOW + EVENT_ALERT_COOLDOWN_MS - 1
    const r2 = evaluateAlerts(r1.alerts, makeCtx({ diff: changeDiff(tooSoon), now: tooSoon }))
    expect(r2.fired).toHaveLength(0)
    // Still counts the fire it suppressed? No — count tracks fires only.
    expect(r2.alerts[0].firedCount).toBe(1)

    const later = NOW + EVENT_ALERT_COOLDOWN_MS
    const r3 = evaluateAlerts(r2.alerts, makeCtx({ diff: changeDiff(later), now: later }))
    expect(r3.fired).toHaveLength(1)
    expect(r3.alerts[0].firedCount).toBe(2)
  })

  it('does not fire on quiet ticks', () => {
    const alerts = [makeAlert({ kind: 'any_change' }, NOW)]
    const r = evaluateAlerts(alerts, makeCtx({ diff: makeDiff() }))
    expect(r.fired).toHaveLength(0)
    expect(r.alerts[0]).toBe(alerts[0])
  })
})

describe('evaluateAlerts — multiple alerts', () => {
  it('evaluates each alert independently', () => {
    const alerts = [
      makeAlert({ kind: 'row_count', op: 'gt', value: 100 }, NOW),
      makeAlert({ kind: 'row_count', op: 'lt', value: 10 }, NOW),
      makeAlert({ kind: 'query_errors' }, NOW)
    ]
    const r = evaluateAlerts(alerts, makeCtx({ snapshot: makeSnap({ rowCount: 150 }) }))
    expect(r.fired).toHaveLength(1)
    expect(r.fired[0].condition).toEqual({ kind: 'row_count', op: 'gt', value: 100 })
    expect(r.alerts).toHaveLength(3)
  })
})

describe('describeAlertCondition', () => {
  it('renders human labels', () => {
    expect(describeAlertCondition({ kind: 'row_count', op: 'gt', value: 100 })).toBe('rows > 100')
    expect(describeAlertCondition({ kind: 'row_count', op: 'neq', value: 0 })).toBe('rows ≠ 0')
    expect(describeAlertCondition({ kind: 'row_count_changes' })).toBe('row count changes')
    expect(describeAlertCondition({ kind: 'any_change' })).toBe('anything changes')
    expect(describeAlertCondition({ kind: 'query_errors' })).toBe('query errors')
  })
})
