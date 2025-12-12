import { BrowserWindow, screen } from 'electron'
import { DpStorage } from './storage'

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized?: boolean
}

const DEFAULT_STATE: WindowState = {
  width: 1400,
  height: 900
}

let store: DpStorage<WindowState> | null = null

async function getStore(): Promise<DpStorage<WindowState>> {
  if (!store) {
    store = await DpStorage.create<WindowState>({
      name: 'data-peek-window-state',
      defaults: DEFAULT_STATE
    })
  }
  return store
}

export async function getWindowState(): Promise<WindowState> {
  const storeInstance = await getStore()
  const state = {
    x: storeInstance.get('x'),
    y: storeInstance.get('y'),
    width: storeInstance.get('width', DEFAULT_STATE.width),
    height: storeInstance.get('height', DEFAULT_STATE.height),
    isMaximized: storeInstance.get('isMaximized', false)
  }

  // Validate that the window is within screen bounds
  const displays = screen.getAllDisplays()
  const isVisible = displays.some((display) => {
    const { x, y, width, height } = display.bounds
    const stateX = state.x ?? 0
    const stateY = state.y ?? 0
    return (
      stateX >= x &&
      stateY >= y &&
      stateX + state.width <= x + width &&
      stateY + state.height <= y + height
    )
  })

  if (!isVisible) {
    // Reset to default if window would be off-screen
    return DEFAULT_STATE
  }

  return state
}

export async function saveWindowState(window: BrowserWindow): Promise<void> {
  if (window.isDestroyed()) return

  const storeInstance = await getStore()
  const isMaximized = window.isMaximized()

  if (!isMaximized) {
    const bounds = window.getBounds()
    storeInstance.set('x', bounds.x)
    storeInstance.set('y', bounds.y)
    storeInstance.set('width', bounds.width)
    storeInstance.set('height', bounds.height)
  }
  storeInstance.set('isMaximized', isMaximized)
}

export function trackWindowState(window: BrowserWindow): void {
  // Save state on various events
  const saveState = (): void => {
    saveWindowState(window)
  }

  let debounceTimer: NodeJS.Timeout | undefined
  const debouncedSaveState = () => {
    if (debounceTimer) clearTimeout(debounceTimer)

    debounceTimer = setTimeout(() => {
      saveState()
    }, 200)
  }

  window.on('resize', debouncedSaveState)
  window.on('move', debouncedSaveState)
  window.on('close', saveState)
}
