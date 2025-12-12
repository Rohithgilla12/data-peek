import { useCallback, useEffect, useRef, useState } from 'react'

interface UseCopyToClipboardOptions {
  /** Duration in ms before copied state resets (default: 2000) */
  resetDelay?: number
  /** Callback after successful copy */
  onSuccess?: (text: string) => void
  /** Callback on copy error */
  onError?: (error: Error) => void
}

interface UseCopyToClipboardReturn {
  copied: boolean
  copy: (text: string) => Promise<void>
  reset: () => void
}

export function useCopyToClipboard(
  options: UseCopyToClipboardOptions = {}
): UseCopyToClipboardReturn {
  const { resetDelay = 2000, onSuccess, onError } = options
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        onSuccess?.(text)
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = setTimeout(() => setCopied(false), resetDelay)
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to copy')
        onError?.(error)
      }
    },
    [resetDelay, onSuccess, onError]
  )

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setCopied(false)
  }, [])

  return { copied, copy, reset }
}
