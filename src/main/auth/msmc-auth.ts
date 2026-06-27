// Microsoft / Minecraft authentication via msmc, with multiple stored accounts.
// Each account keeps its msmc refresh token (xbox.save()) encrypted via the OS
// keychain. The active account drives the homepage and launches. MultiMC-style:
// add, switch, and remove accounts; the active session is restored on startup.
// Uses msmc's bundled default client id, so no Azure app registration is needed.

import { Auth } from 'msmc'
import type { types as MsmcTypes } from 'msmc'
import { store } from '../store'
import type { Account, Profile } from '../../shared/types'

type GmllUser = MsmcTypes.GmllUser

const ACCOUNTS_SECRET = 'accounts'
const LEGACY_SECRET = 'ms-refresh'
const PENDING = '__pending__'

interface StoredAccount {
  uuid: string
  name: string
  token: string // msmc xbox.save() refresh token
}
interface AccountsState {
  active: string | null
  list: StoredAccount[]
}

let activeToken: GmllUser | null = null

function toProfile(name: string, id: string): Profile {
  // msmc returns a dashed/dashless, mixed-case uuid depending on source. The MCSR Ranked
  // API uses lowercase dashless uuids, so normalise to that or every `result.uuid === uuid`
  // comparison (win counts, elo changes, splits) silently fails on case.
  return { name, uuid: id.replace(/-/g, '').toLowerCase() }
}

function readState(): AccountsState {
  const raw = store.secret.get(ACCOUNTS_SECRET)
  if (raw) {
    try {
      const s = JSON.parse(raw) as AccountsState
      if (Array.isArray(s.list)) return { active: s.active ?? null, list: s.list }
    } catch {
      // fall through to legacy adoption
    }
  }
  // Adopt the pre-multi-account single token so existing logins survive the upgrade.
  const legacy = store.secret.get(LEGACY_SECRET)
  if (legacy) return { active: PENDING, list: [{ uuid: PENDING, name: '', token: legacy }] }
  return { active: null, list: [] }
}

function writeState(state: AccountsState): void {
  store.secret.set(ACCOUNTS_SECRET, JSON.stringify(state))
}

/** Insert/replace an account (optionally replacing a placeholder uuid) and keep order. */
function upsert(state: AccountsState, acc: StoredAccount, replaceUuid?: string): void {
  if (replaceUuid && replaceUuid !== acc.uuid) {
    state.list = state.list.filter((a) => a.uuid !== replaceUuid)
    if (state.active === replaceUuid) state.active = acc.uuid
  }
  const i = state.list.findIndex((a) => a.uuid === acc.uuid)
  if (i >= 0) state.list[i] = acc
  else state.list.push(acc)
}

export function listAccounts(): Account[] {
  const state = readState()
  return state.list
    .filter((a) => a.uuid !== PENDING)
    .map((a) => ({ uuid: a.uuid, name: a.name, active: a.uuid === state.active }))
}

/** Run the Microsoft OAuth popup, store the account, and make it active. */
export async function addAccount(): Promise<Profile> {
  const auth = new Auth('select_account')
  const xbox = await auth.launch('electron', { width: 480, height: 640 })
  const mc = await xbox.getMinecraft()
  if (!mc.profile) throw new Error('No Minecraft profile on this account (Java Edition required).')
  const profile = toProfile(mc.profile.name, mc.profile.id)

  const state = readState()
  upsert(state, { uuid: profile.uuid, name: profile.name, token: xbox.save() }, PENDING)
  state.active = profile.uuid
  store.secret.delete(LEGACY_SECRET)
  writeState(state)
  activeToken = mc.gmll()
  return profile
}

// The Login screen's primary sign-in is the same flow as adding the first account.
export const login = addAccount

/** Refresh a stored account's session and make it active. */
async function activate(state: AccountsState, acc: StoredAccount): Promise<Profile | null> {
  try {
    const auth = new Auth('select_account')
    const xbox = await auth.refresh(acc.token)
    const mc = await xbox.getMinecraft()
    if (!mc.profile) return null
    const profile = toProfile(mc.profile.name, mc.profile.id)
    upsert(state, { uuid: profile.uuid, name: profile.name, token: xbox.save() }, acc.uuid)
    state.active = profile.uuid
    store.secret.delete(LEGACY_SECRET)
    writeState(state)
    activeToken = mc.gmll()
    return profile
  } catch (e) {
    console.error('[auth] account refresh failed:', e instanceof Error ? e.message : e)
    return null
  }
}

let restoreInFlight: Promise<Profile | null> | null = null

/**
 * Restore the active account silently on startup. Deduplicated: concurrent calls
 * share one in-flight refresh. This is essential because Microsoft refresh tokens
 * are single-use with reuse-detection — refreshing the same token twice (e.g. React
 * StrictMode double-invoking the effect in dev) revokes the whole token family and
 * forces a fresh login on the next launch.
 */
export function restore(): Promise<Profile | null> {
  if (restoreInFlight) return restoreInFlight
  restoreInFlight = (async () => {
    const state = readState()
    const acc = state.list.find((a) => a.uuid === state.active) ?? state.list[0]
    if (!acc) return null
    return activate(state, acc)
  })().finally(() => {
    restoreInFlight = null
  })
  return restoreInFlight
}

export async function switchAccount(uuid: string): Promise<Profile | null> {
  const state = readState()
  const acc = state.list.find((a) => a.uuid === uuid)
  if (!acc) return null
  return activate(state, acc)
}

export function removeAccount(uuid: string): Account[] {
  const state = readState()
  state.list = state.list.filter((a) => a.uuid !== uuid)
  if (state.active === uuid) {
    state.active = state.list[0]?.uuid ?? null
    activeToken = null
  }
  writeState(state)
  return listAccounts()
}

/** Sign out (remove) the active account. */
export async function logout(): Promise<void> {
  const state = readState()
  if (state.active) {
    state.list = state.list.filter((a) => a.uuid !== state.active)
    state.active = state.list[0]?.uuid ?? null
  }
  activeToken = null
  store.secret.delete(LEGACY_SECRET)
  writeState(state)
}

/** The GMLL launch token for the active account, or null if none is active. */
export function getLaunchToken(): GmllUser | null {
  return activeToken
}
