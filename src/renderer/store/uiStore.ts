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
  setProfile: (p: Profile | null) => void
  setAuthReady: (v: boolean) => void
  setPacemanName: (name: string | null) => void
}

export const useUi = create<UiState>((set) => ({
  profile: null,
  authReady: false,
  pacemanName: null,
  setProfile: (profile) => set({ profile }),
  setAuthReady: (authReady) => set({ authReady }),
  setPacemanName: (pacemanName) => set({ pacemanName })
}))
