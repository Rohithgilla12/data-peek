import type { IpcMainInvokeEvent } from 'electron'

/**
 * Standard IPC response wrapper
 */
export interface IpcResponse<T = void> {
  success: boolean
  data?: T
  error?: string
}

/**
 * IPC handler function type
 */
export type IpcHandler<TArgs = unknown, TResult = unknown> = (
  event: IpcMainInvokeEvent,
  args: TArgs
) => Promise<IpcResponse<TResult>> | IpcResponse<TResult>

/**
 * Handler registration entry
 */
export interface HandlerRegistration {
  channel: string
  handler: IpcHandler<unknown, unknown>
}

/**
 * Helper to create a successful response
 */
export function success<T>(data?: T): IpcResponse<T> {
  return { success: true, data }
}

/**
 * Helper to create an error response
 */
export function error(message: string): IpcResponse<never> {
  return { success: false, error: message }
}

/**
 * Helper to wrap async handler with error handling
 */
export function wrapHandler<TArgs, TResult>(
  handler: (event: IpcMainInvokeEvent, args: TArgs) => Promise<TResult>
): IpcHandler<TArgs, TResult> {
  return async (event, args) => {
    try {
      const result = await handler(event, args)
      return success(result)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      return error(errorMessage)
    }
  }
}

/**
 * Helper to wrap sync handler with error handling
 */
export function wrapSyncHandler<TArgs, TResult>(
  handler: (event: IpcMainInvokeEvent, args: TArgs) => TResult
): IpcHandler<TArgs, TResult> {
  return (event, args) => {
    try {
      const result = handler(event, args)
      return success(result)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      return error(errorMessage)
    }
  }
}
