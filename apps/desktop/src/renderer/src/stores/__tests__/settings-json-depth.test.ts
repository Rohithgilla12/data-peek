import { beforeAll, describe, expect, it } from 'vitest'

const saved = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => saved.get(k) ?? null,
  setItem: (k: string, v: string) => void saved.set(k, v),
  removeItem: (k: string) => void saved.delete(k),
  clear: () => saved.clear(),
  key: () => null,
  length: 0
} as Storage

let useSettingsStore: typeof import('../settings-store').useSettingsStore

beforeAll(async () => {
  ;({ useSettingsStore } = await import('../settings-store'))
})

describe('jsonExpandDepth', () => {
  it('clamps values set through the setter to 1-10', () => {
    useSettingsStore.getState().setJsonExpandDepth(0)
    expect(useSettingsStore.getState().jsonExpandDepth).toBe(1)
    useSettingsStore.getState().setJsonExpandDepth(99)
    expect(useSettingsStore.getState().jsonExpandDepth).toBe(10)
  })

  it('clamps an out-of-range value saved by an older version on rehydrate', async () => {
    saved.set(
      'data-peek-settings',
      JSON.stringify({ state: { jsonExpandDepth: 0, expandJsonByDefault: true }, version: 0 })
    )
    await useSettingsStore.persist.rehydrate()
    expect(useSettingsStore.getState().jsonExpandDepth).toBe(1)
    expect(useSettingsStore.getState().expandJsonByDefault).toBe(true)
  })
})
