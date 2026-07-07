import { create } from 'zustand'
import type { Profile } from '@shared/types'

interface UiState {
  profile: Profile | null
  /** Whether the initial silent auth-restore has finished. */
  authReady: boolean
  /** The paceman name for live-pace / PB lookups. null = paceman not connected. Set only
   *  explicitly (Settings) — never auto-filled from the Minecraft IGN, so an unconnected
   *  player's IGN can't silently surface someone's paceman runs. */
  pacemanName: string | null
  /** Favorited runners for the friends rail (dashless lowercase uuids). Mirrors AppConfig. */
  favorites: string[]
  /** Whether the right-hand friends rail is expanded. */
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
