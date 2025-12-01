import { app } from 'electron'
import { existsSync, unlinkSync } from 'fs'
import { join } from 'path'

// electron-store requires Record<string, any> constraint
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StoreRecord = Record<string, any>
type ElectronStore<T extends StoreRecord> = import('electron-store').default<T>
type StoreOptions<T extends StoreRecord> = {
  name: string
  encryptionKey?: string
  defaults: T
}

/**
 * Safely delete a store file if it exists
 */
function deleteStoreFile(storeName: string): void {
  try {
    const userDataPath = app.getPath('userData')
    const storePath = join(userDataPath, `${storeName}.json`)
    if (existsSync(storePath)) {
      unlinkSync(storePath)
      console.log(`[storage] Deleted corrupted store: ${storePath}`)
    }
  } catch (error) {
    console.error(`[storage] Failed to delete store file:`, error)
  }
}

/**
 * DpStorage - Facade for electron-store with automatic corruption recovery
 *
 * Usage:
 *   const store = await DpStorage.create<{ myData: string }>({
 *     name: 'my-store',
 *     defaults: { myData: '' }
 *   })
 *   store.get('myData')
 *   store.set('myData', 'value')
 */
export class DpStorage<T extends StoreRecord> {
  private store: ElectronStore<T>
  private storeName: string

  private constructor(store: ElectronStore<T>, storeName: string) {
    this.store = store
    this.storeName = storeName
  }

  /**
   * Create a new storage instance with automatic corruption recovery
   */
  static async create<T extends StoreRecord>(options: StoreOptions<T>): Promise<DpStorage<T>> {
    const Store = (await import('electron-store')).default

    try {
      const store = new Store<T>(options)
      return new DpStorage(store, options.name)
    } catch (error) {
      console.warn(`[storage] Store "${options.name}" corrupted, recreating:`, error)
      deleteStoreFile(options.name)
      const store = new Store<T>(options)
      return new DpStorage(store, options.name)
    }
  }

  get<K extends keyof T>(key: K): T[K]
  get<K extends keyof T>(key: K, defaultValue: T[K]): T[K]
  get<K extends keyof T>(key: K, defaultValue?: T[K]): T[K] {
    return defaultValue !== undefined ? this.store.get(key, defaultValue) : this.store.get(key)
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.store.set(key, value)
  }

  delete<K extends keyof T>(key: K): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  has<K extends keyof T>(key: K): boolean {
    return this.store.has(key)
  }

  get path(): string {
    return this.store.path
  }

  /**
   * Reset this store (delete file and clear in-memory data)
   */
  reset(): void {
    deleteStoreFile(this.storeName)
    this.store.clear()
  }
}

/**
 * DpSecureStorage - Encrypted storage with automatic corruption recovery
 *
 * Usage:
 *   const store = await DpSecureStorage.create<{ secret: string }>({
 *     name: 'secure-store',
 *     defaults: { secret: '' }
 *   })
 */
export class DpSecureStorage<T extends StoreRecord> {
  private store: ElectronStore<T>
  private storeName: string

  private constructor(store: ElectronStore<T>, storeName: string) {
    this.store = store
    this.storeName = storeName
  }

  /**
   * Create a new encrypted storage instance with automatic corruption recovery
   */
  static async create<T extends StoreRecord>(
    options: Omit<StoreOptions<T>, 'encryptionKey'> & { encryptionKey: string }
  ): Promise<DpSecureStorage<T>> {
    const Store = (await import('electron-store')).default

    try {
      const store = new Store<T>(options)
      return new DpSecureStorage(store, options.name)
    } catch (error) {
      console.warn(`[storage] Secure store "${options.name}" corrupted, recreating:`, error)
      deleteStoreFile(options.name)
      const store = new Store<T>(options)
      return new DpSecureStorage(store, options.name)
    }
  }

  get<K extends keyof T>(key: K): T[K]
  get<K extends keyof T>(key: K, defaultValue: T[K]): T[K]
  get<K extends keyof T>(key: K, defaultValue?: T[K]): T[K] {
    return defaultValue !== undefined ? this.store.get(key, defaultValue) : this.store.get(key)
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.store.set(key, value)
  }

  delete<K extends keyof T>(key: K): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  has<K extends keyof T>(key: K): boolean {
    return this.store.has(key)
  }

  get path(): string {
    return this.store.path
  }

  /**
   * Reset this store (delete file and clear in-memory data)
   */
  reset(): void {
    deleteStoreFile(this.storeName)
    this.store.clear()
  }
}
