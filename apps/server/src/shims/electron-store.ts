/**
 * Shim for 'electron-store' module.
 * This should never actually be called since the server uses ServerStorage.
 * But if desktop's storage.ts gets imported transitively, this prevents crashes.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

class Store<T extends Record<string, any> = Record<string, any>> {
  private data: T
  private filePath: string

  constructor(opts: { name: string; defaults?: T; encryptionKey?: string }) {
    const dataDir = process.env.DATA_DIR || './data'
    mkdirSync(dataDir, { recursive: true })
    this.filePath = join(dataDir, `${opts.name}.json`)

    if (existsSync(this.filePath)) {
      try {
        this.data = JSON.parse(readFileSync(this.filePath, 'utf-8'))
      } catch {
        this.data = (opts.defaults || {}) as T
      }
    } else {
      this.data = (opts.defaults || {}) as T
    }
  }

  get<K extends keyof T>(key: K, defaultValue?: T[K]): T[K] {
    return (this.data[key] ?? defaultValue) as T[K]
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.data[key] = value
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2))
  }

  delete<K extends keyof T>(key: K): void {
    delete this.data[key]
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2))
  }

  has<K extends keyof T>(key: K): boolean {
    return key in this.data
  }

  clear(): void {
    this.data = {} as T
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2))
  }

  get path(): string {
    return this.filePath
  }
}

export default Store
