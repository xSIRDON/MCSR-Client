import { create } from 'zustand'
import type { Profile } from '@shared/types'

interface UiState {
  profile: Profile | null
  authReady: boolean
  pacemanName: string | null
  favorites: string[]
  friendsOpen: boolean
  setProfile: (p: Profile | null) => void
  setAuthReady: (v: boolean) => void
  setPacemanName: (name: string | null) => void
  setFavorites: (uuids: string[]) => void
  setFriendsOpen: (open: boolean) => void
}

export const useUi = create<UiState>((set) => ({
  profile: null,
  authReady: false,
  pacemanName: null,
  favorites: [],
  friendsOpen: false,
  setProfile: (profile) => set({ profile }),
  setAuthReady: (authReady) => set({ authReady }),
  setPacemanName: (pacemanName) => set({ pacemanName }),
  setFavorites: (favorites) => set({ favorites }),
  setFriendsOpen: (friendsOpen) => set({ friendsOpen })
}))
