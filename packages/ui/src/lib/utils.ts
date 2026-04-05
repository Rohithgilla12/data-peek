import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export const isMac =
  typeof navigator !== 'undefined'
    ? navigator.platform.toUpperCase().indexOf('MAC') >= 0
    : false

export const keys = {
  mod: isMac ? '⌘' : 'Ctrl',
  alt: isMac ? '⌥' : 'Alt',
  shift: isMac ? '⇧' : 'Shift',
  enter: isMac ? '↵' : 'Enter',
} as const

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
