import { create } from 'zustand'

interface ConnectionState {
  activeConnectionId: string | null
  setActiveConnection: (id: string | null) => void
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  activeConnectionId: null,
  setActiveConnection: (id) => set({ activeConnectionId: id }),
}))
