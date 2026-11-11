import { create } from 'zustand'
import type { Profile } from '@shared/types'

interface UiState {
  profile: Profile | null
  authReady: boolean
  pacemanName: string | null
  favorites: string[]
  railOpen: boolean
  setProfile: (p: Profile | null) => void
  setAuthReady: (v: boolean) => void
  setPacemanName: (name: string | null) => void
  setFavorites: (uuids: string[]) => void
  setRailOpen: (open: boolean) => void
}

export const useUi = create<UiState>((set) => ({
  profile: null,
  authReady: false,
  pacemanName: null,
  favorites: [],
  railOpen: false,
  setProfile: (profile) => set({ profile }),
  setAuthReady: (authReady) => set({ authReady }),
  setPacemanName: (pacemanName) => set({ pacemanName }),
  setFavorites: (favorites) => set({ favorites }),
  setRailOpen: (railOpen) => set({ railOpen })
}))
