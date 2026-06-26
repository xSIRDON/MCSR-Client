// Microsoft / Minecraft authentication via msmc.
// Uses msmc's bundled default client id (the vanilla Minecraft launcher OAuth
// client) so no Azure app registration is required. The refresh token from
// xbox.save() is persisted (encrypted) so sessions survive restarts.

import { Auth } from 'msmc'
import type { types as MsmcTypes } from 'msmc'
import { store } from '../store'
import type { Profile } from '../../shared/types'

type GmllUser = MsmcTypes.GmllUser

const REFRESH_KEY = 'ms-refresh'

let currentToken: GmllUser | null = null

function toProfile(name: string, id: string): Profile {
  // msmc returns a dashed or dashless uuid depending on source; normalise to dashless.
  return { name, uuid: id.replace(/-/g, '') }
}

/** Interactive login through an Electron popup window. */
export async function login(): Promise<Profile> {
  const auth = new Auth('select_account')
  const xbox = await auth.launch('electron', { width: 480, height: 640 })
  const mc = await xbox.getMinecraft()
  if (!mc.profile) throw new Error('No Minecraft profile on this account (Java Edition required).')
  store.secret.set(REFRESH_KEY, xbox.save())
  currentToken = mc.gmll()
  return toProfile(mc.profile.name, mc.profile.id)
}

/** Silent restore from a saved refresh token, or null if none/expired. */
export async function restore(): Promise<Profile | null> {
  const saved = store.secret.get(REFRESH_KEY)
  if (!saved) return null
  try {
    const auth = new Auth('select_account')
    const xbox = await auth.refresh(saved)
    const mc = await xbox.getMinecraft()
    if (!mc.profile) return null
    store.secret.set(REFRESH_KEY, xbox.save())
    currentToken = mc.gmll()
    return toProfile(mc.profile.name, mc.profile.id)
  } catch {
    return null
  }
}

export async function logout(): Promise<void> {
  currentToken = null
  store.secret.delete(REFRESH_KEY)
}

/** The GMLL launch token for the signed-in account, or null if not signed in. */
export function getLaunchToken(): GmllUser | null {
  return currentToken
}
