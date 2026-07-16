import { randomUUID } from 'crypto'
import type { McpApprovalRequest } from '@shared/index'

interface Pending {
  resolve: (approved: boolean) => void
  timer: NodeJS.Timeout
}

export class ApprovalManager {
  private pending = new Map<string, Pending>()
  private queue: Promise<unknown> = Promise.resolve()
  private inFlight = 0

  constructor(
    private send: (req: McpApprovalRequest) => void,
    private timeoutMs = 60_000,
    private onResolved?: (id: string) => void
  ) {}

  request(connectionName: string, sql: string): Promise<boolean> {
    const run = (): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        const id = randomUUID()
        const timer = setTimeout(() => {
          this.pending.delete(id)
          resolve(false)
          this.onResolved?.(id)
        }, this.timeoutMs)
        this.pending.set(id, { resolve, timer })
        this.send({ id, connectionName, sql })
      })

    const exec = (): Promise<boolean> =>
      run().finally(() => {
        this.inFlight--
      })
    this.inFlight++
    const result = this.inFlight === 1 ? exec() : this.queue.then(exec, exec)
    this.queue = result.catch(() => undefined)
    return result
  }

  respond(id: string, approved: boolean): void {
    const entry = this.pending.get(id)
    if (!entry) return
    clearTimeout(entry.timer)
    this.pending.delete(id)
    entry.resolve(approved)
    this.onResolved?.(id)
  }
}
