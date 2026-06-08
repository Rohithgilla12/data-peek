import { app, safeStorage } from 'electron'
import { existsSync, unlinkSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { createLogger } from './lib/logger'

const log = createLogger('storage')

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
 * Common surface shared by the plaintext and encrypted storage facades, so callers
 * can accept either backing without knowing how persistence is implemented.
 */
export interface PersistentStore<T extends StoreRecord> {
  get<K extends keyof T>(key: K): T[K]
  get<K extends keyof T>(key: K, defaultValue: T[K]): T[K]
  set<K extends keyof T>(key: K, value: T[K]): void
  delete<K extends keyof T>(key: K): void
  clear(): void
  has<K extends keyof T>(key: K): boolean
  readonly path: string
  reset(): void
}

/** Thrown when OS-level secure storage is unavailable and secrets cannot be encrypted. */
export class EncryptionUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EncryptionUnavailableError'
  }
}

// Cache the encryption key in memory for the session
let cachedEncryptionKey: string | null = null

/**
 * Get or create a persistent encryption key using Electron's safeStorage.
 *
 * The key is generated once and stored encrypted on disk, then reused across
 * sessions. This function is fail-closed: if secure storage is unavailable or the
 * key cannot be persisted, it throws rather than substituting a constant key
 * (which would make encryption meaningless). Callers decide how to degrade.
 *
 * @throws {EncryptionUnavailableError} when OS secure storage is not available
 */
export function getEncryptionKey(): string {
  // Return cached key if available
  if (cachedEncryptionKey) {
    return cachedEncryptionKey
  }

  // Fail closed — never fall back to a static key. A constant key would let anyone
  // with the source decrypt the store, so it is no better than plaintext.
  if (!safeStorage.isEncryptionAvailable()) {
    throw new EncryptionUnavailableError('OS secure storage (safeStorage) is unavailable')
  }

  const userDataPath = app.getPath('userData')
  const keyFilePath = join(userDataPath, '.encryption-key')

  if (existsSync(keyFilePath)) {
    // Do NOT delete the key on failure. On Linux the safeStorage backend can change
    // between launches; deleting and regenerating the key here would orphan every
    // store previously written under it (the original cause of the "corruption" that
    // led to encryption being disabled). Let a genuine decrypt failure propagate.
    const encryptedKey = readFileSync(keyFilePath)
    cachedEncryptionKey = safeStorage.decryptString(encryptedKey)
    return cachedEncryptionKey
  }

  // No key yet: generate one and persist it. If it can't be written, throw — a key
  // that isn't stable across sessions can't protect anything.
  const newKey = randomBytes(32).toString('hex')
  const encryptedKey = safeStorage.encryptString(newKey)
  writeFileSync(keyFilePath, encryptedKey)
  cachedEncryptionKey = newKey
  log.debug('Generated and stored new encryption key')
  return cachedEncryptionKey
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
      log.warn('Deleted corrupted store:', storePath)
    }
  } catch (error) {
    log.error('Failed to delete store file:', error)
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
export class DpStorage<T extends StoreRecord> implements PersistentStore<T> {
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
    } catch {
      log.warn(`Store "${options.name}" corrupted, recreating`)
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
 * Uses a persistent encryption key stored securely via Electron's safeStorage.
 * The key is generated once and reused across sessions (see getEncryptionKey).
 *
 * Used for connection credentials. If secure storage is unavailable, creation
 * throws EncryptionUnavailableError and the caller is expected to degrade
 * gracefully (see createConnectionsStore in index.ts).
 *
 * Usage:
 *   const store = await DpSecureStorage.create<{ secret: string }>({
 *     name: 'secure-store',
 *     defaults: { secret: '' }
 *   })
 */
export class DpSecureStorage<T extends StoreRecord> implements PersistentStore<T> {
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
    options: Omit<StoreOptions<T>, 'encryptionKey'>
  ): Promise<DpSecureStorage<T>> {
    const Store = (await import('electron-store')).default
    const encryptionKey = getEncryptionKey()

    try {
      const store = new Store<T>({ ...options, encryptionKey })
      return new DpSecureStorage(store, options.name)
    } catch (error) {
      // The encryption key is now stable across sessions, so reaching here means the
      // store file is genuinely corrupt rather than encrypted under a different key.
      // Recreate it as a last resort, but log loudly — this discards stored secrets.
      log.error(
        `Secure store "${options.name}" unreadable, recreating (stored secrets lost):`,
        error
      )
      deleteStoreFile(options.name)
      const store = new Store<T>({ ...options, encryptionKey })
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
