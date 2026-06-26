import { create } from 'zustand'
import type { Profile } from '@shared/types'

interface UiState {
  profile: Profile | null
  authReady: boolean
  pacemanName: string | null
  setProfile: (p: Profile | null) => void
  setAuthReady: (v: boolean) => void
  setPacemanName: (name: string | null) => void
}

export const useUi = create<UiState>((set) => ({
  profile: null,
  authReady: false,
  pacemanName: null,
  setProfile: (profile) =>
    set((s) => ({ profile, pacemanName: s.pacemanName ?? profile?.name ?? null })),
  setAuthReady: (authReady) => set({ authReady }),
  setPacemanName: (pacemanName) => set({ pacemanName })
}))
