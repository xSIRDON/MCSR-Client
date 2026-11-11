import { Auth } from 'msmc'
import type { types as MsmcTypes } from 'msmc'
import { store } from '../store'
import { logFailure } from '../log'
import { SIGN_IN_CANCELLED, type Account, type Profile } from '../../shared/types'

type GmllUser = MsmcTypes.GmllUser

const ACCOUNTS_SECRET = 'accounts'
const LEGACY_SECRET = 'ms-refresh'
const PENDING = '__pending__'

interface StoredAccount {
  uuid: string
  name: string
  token: string
}
interface AccountsState {
  active: string | null
  list: StoredAccount[]
}

let activeToken: GmllUser | null = null

function toProfile(name: string, id: string): Profile {
  return { name, uuid: id.replace(/-/g, '').toLowerCase() }
}

function readState(): AccountsState {
  const raw = store.secret.get(ACCOUNTS_SECRET)
  if (raw) {
    try {
      const s = JSON.parse(raw) as AccountsState
      if (Array.isArray(s.list)) return { active: s.active ?? null, list: s.list }
    } catch (e) {
      logFailure('Saved accounts could not be read, sign in again', e)
    }
  }
  const legacy = store.secret.get(LEGACY_SECRET)
  if (legacy) return { active: PENDING, list: [{ uuid: PENDING, name: '', token: legacy }] }
  return { active: null, list: [] }
}

function writeState(state: AccountsState): void {
  store.secret.set(ACCOUNTS_SECRET, JSON.stringify(state))
}

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

export async function addAccount(): Promise<Profile> {
  const auth = new Auth('select_account')
  const xbox = await auth.launch('electron', { width: 480, height: 640 }).catch((e: unknown) => {
    throw e === 'error.gui.closed' ? new Error(SIGN_IN_CANCELLED) : e
  })
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

export const login = addAccount

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

export function getLaunchToken(): GmllUser | null {
  return activeToken
}
