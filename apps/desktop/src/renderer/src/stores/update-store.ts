import { create } from 'zustand'

export type UpdateStatus = 'idle' | 'downloading' | 'ready'

export interface UpdateState {
  status: UpdateStatus
  version: string | null
  releaseNotes: string | null
  downloadProgress: number
}

interface UpdateStore extends UpdateState {
  isBannerDismissed: boolean
  setUpdateState: (state: UpdateState) => void
  dismissBanner: () => void
  restartAndUpdate: () => void
  initializeListener: () => () => void
}

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  status: 'idle',
  version: null,
  releaseNotes: null,
  downloadProgress: 0,
  isBannerDismissed: false,

  setUpdateState: (state) => {
    set(state)
    // Show banner when update is ready
    if (state.status === 'ready') {
      set({ isBannerDismissed: false })
    }
  },

  dismissBanner: () => set({ isBannerDismissed: true }),

  restartAndUpdate: () => {
    window.api.updater.restartAndUpdate()
  },

  initializeListener: () => {
    window.api.updater.getState().then((state) => {
      get().setUpdateState(state)
    })
    return window.api.updater.onStateChanged((state) => {
      get().setUpdateState(state)
    })
  }
}))
