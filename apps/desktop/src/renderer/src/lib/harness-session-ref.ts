import type { AIProvider } from '@data-peek/shared'

/**
 * A CLI session id captured from a BYOH harness turn, tagged with the
 * provider that was active when it arrived. All BYOH harness providers are
 * resumable, but a session id minted by one is meaningless — and often an
 * outright invalid CLI argument — to the others.
 */
export interface HarnessSessionRef {
  provider: AIProvider
  sessionId: string
}

/**
 * Resolve the CLI session id to resume for the next turn. Drops the stored
 * id whenever the active provider no longer matches the one that produced
 * it, so switching providers mid-conversation starts a fresh CLI session
 * instead of resuming a foreign one.
 */
export function resolveHarnessResumeId(
  ref: HarnessSessionRef | undefined,
  activeProvider: AIProvider | undefined
): string | undefined {
  if (!ref || !activeProvider || ref.provider !== activeProvider) return undefined
  return ref.sessionId
}
