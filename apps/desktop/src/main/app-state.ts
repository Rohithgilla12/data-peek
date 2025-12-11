// Shared application state that can be accessed from multiple modules
// This avoids circular dependencies between index.ts and other modules

// Used by macOS to determine if the app should quit or hide on close
let forceQuit = false

export function setForceQuit(value: boolean): void {
  forceQuit = value
}

export function shouldForceQuit(): boolean {
  return forceQuit
}
