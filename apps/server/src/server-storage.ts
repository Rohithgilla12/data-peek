import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

type StoreRecord = Record<string, any>

interface StoreOptions<T extends StoreRecord> {
  name: string
  defaults: T
  dataDir: string
}

/**
 * Drop-in replacement for DpStorage (electron-store) that uses plain JSON files.
 * Implements the same get/set/delete/has/clear interface so handler code works unchanged.
 */
export class ServerStorage<T extends StoreRecord> {
  private data: T
  private filePath: string
  private defaults: T

  private constructor(data: T, filePath: string, defaults: T) {
    this.data = data
    this.filePath = filePath
    this.defaults = defaults
  }

  static create<T extends StoreRecord>(options: StoreOptions<T>): ServerStorage<T> {
    mkdirSync(options.dataDir, { recursive: true })
    const filePath = join(options.dataDir, `${options.name}.json`)

    let data: T
    if (existsSync(filePath)) {
      try {
        data = JSON.parse(readFileSync(filePath, 'utf-8'))
      } catch {
        // Corrupted file — reset to defaults
        data = { ...options.defaults }
      }
    } else {
      data = { ...options.defaults }
    }

    return new ServerStorage(data, filePath, options.defaults)
  }

  get<K extends keyof T>(key: K): T[K]
  get<K extends keyof T>(key: K, defaultValue: T[K]): T[K]
  get<K extends keyof T>(key: K, defaultValue?: T[K]): T[K] {
    const value = this.data[key]
    if (value !== undefined) return value
    if (defaultValue !== undefined) return defaultValue
    return this.defaults[key]
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.data[key] = value
    this.persist()
  }

  delete<K extends keyof T>(key: K): void {
    delete this.data[key]
    this.persist()
  }

  has<K extends keyof T>(key: K): boolean {
    return key in this.data
  }

  clear(): void {
    this.data = {} as T
    this.persist()
  }

  get path(): string {
    return this.filePath
  }

  reset(): void {
    this.data = { ...this.defaults }
    this.persist()
  }

  private persist(): void {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2))
  }
}
