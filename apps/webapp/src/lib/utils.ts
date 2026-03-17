import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Platform detection for keyboard shortcuts
 */
export const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0

/**
 * Platform-specific modifier key symbols
 */
export const keys = {
  mod: isMac ? '⌘' : 'Ctrl',
  alt: isMac ? '⌥' : 'Alt',
  shift: isMac ? '⇧' : 'Shift',
  enter: isMac ? '↵' : 'Enter'
} as const

/**
 * Format a keyboard shortcut for display
 * @example shortcut('mod', 'K') => '⌘K' on Mac, 'Ctrl+K' on Windows
 */
export function shortcut(...parts: string[]): string {
  const mapped = parts.map((p) => {
    if (p === 'mod') return keys.mod
    if (p === 'alt') return keys.alt
    if (p === 'shift') return keys.shift
    if (p === 'enter') return keys.enter
    return p
  })
  return isMac ? mapped.join('') : mapped.join('+')
}
