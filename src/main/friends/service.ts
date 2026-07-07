// Client for the friends/presence backend (see server/). Runs in the main process:
// it holds the session token (OS keychain via store.secret), proves account ownership
// through Mojang's session server (the same joinServer/hasJoined handshake real
// Minecraft servers use), heartbeats presence while the app is open, and polls the
// friends list, pushing changes to the renderer.

import { store } from '../store'
import { getLaunchToken } from '../auth/msmc-auth'
import { DEFAULT_FRIENDS_SERVER } from '../../shared/types'
import type { FriendsNetState, FriendEntry, FriendNetPresence } from '../../shared/types'

const SESSION_SECRET = 'friends-session'
const HEARTBEAT_MS = 60_000
const POLL_MS = 30_000

interface StoredSession {
  url: string
  token: string
  uuid: string
}

type StateProvider = () => FriendNetPresence
type ChangeSink = (s: FriendsNetState) => void

let session: StoredSession | null = null
let connected = false
let lastError: string | null = null
let lists: Pick<FriendsNetState, 'friends' | 'incoming' | 'outgoing'> = {
  friends: [],
  incoming: [],
  outgoing: []
}
let heartbeatTimer: NodeJS.Timeout | null = null
let pollTimer: NodeJS.Timeout | null = null
let stateProvider: StateProvider = () => 'idle'
let sink: ChangeSink | null = null

export function onChanged(cb: ChangeSink): void {
  sink = cb
}
export function setStateProvider(p: StateProvider): void {
  stateProvider = p
}

function serverUrl(): string {
  // The friends network URL is baked in (DEFAULT_FRIENDS_SERVER) and not user-configurable, so
  // use it directly. This also migrates any client off a stale persisted URL from an older build.
  return DEFAULT_FRIENDS_SERVER
}

function readSession(): StoredSession | null {
  const raw = store.secret.get(SESSION_SECRET)
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as StoredSession
    return s && typeof s.token === 'string' && typeof s.url === 'string' ? s : null
  } catch {
    return null
  }
}

function emit(): void {
  sink?.(getState())
}

export function getState(): FriendsNetState {
  return {
    configured: !!serverUrl(),
    connected,
    error: lastError,
    ...lists
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!session) throw new Error('not connected')
  const res = await fetchT(`${session.url}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.token}`,
      ...(init.headers ?? {})
    }
  })
  if (res.status === 401) {
    // Session expired/revoked — drop to disconnected; it re-handshakes on next launch.
    stop()
    session = null
    store.secret.delete(SESSION_SECRET)
    lastError = 'Session expired — reconnecting on next launch.'
    emit()
    throw new Error('unauthorized')
  }
  if (!res.ok) throw new Error(`friends server error (${res.status})`)
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

/** fetch with a hard timeout — a hung connection becomes an error instead of freezing connect(). */
async function fetchT(u: string, init: RequestInit, ms = 12_000): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(u, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

/** Sign in: prove account ownership via the Mojang session server, store the session. */
export async function connect(): Promise<FriendsNetState> {
  const url = serverUrl()?.replace(/\/+$/, '')
  lastError = null
  try {
    if (!url) throw new Error('No server URL configured.')
    const launch = getLaunchToken()
    const accessToken = launch?.access_token
    const profileId = launch?.profile?.id?.replace(/-/g, '').toLowerCase()
    const username = launch?.profile?.name
    if (!accessToken || !profileId || !username) {
      throw new Error('Sign in to a Minecraft account first.')
    }

    // 1. Ask the backend for a one-time serverId nonce.
    const hs = await fetchT(`${url}/v1/auth/handshake`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ uuid: profileId })
    })
    if (!hs.ok) throw new Error(`Handshake failed (${hs.status}).`)
    const { serverId } = (await hs.json()) as { serverId: string }

    // 2. "Join" that serverId with Mojang — cryptographic proof we own the account.
    const join = await fetchT('https://sessionserver.mojang.com/session/minecraft/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessToken, selectedProfile: profileId, serverId })
    })
    if (join.status !== 204 && !join.ok) throw new Error(`Mojang join failed (${join.status}).`)

    // 3. The backend confirms via hasJoined and issues our session token.
    const vf = await fetchT(`${url}/v1/auth/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ uuid: profileId, username, serverId })
    })
    if (!vf.ok) throw new Error(`Verification failed (${vf.status}).`)
    const { token } = (await vf.json()) as { token: string }

    session = { url, token, uuid: profileId }
    store.secret.set(SESSION_SECRET, JSON.stringify(session))
    connected = true
    start()
    await refresh()
    emit() // the connected flag flipped even if the lists didn't — the rail needs to hear it
    return getState()
  } catch (e) {
    connected = false
    lastError = e instanceof Error ? e.message : String(e)
    console.error('[friends] connect failed:', lastError, (e as { cause?: { code?: string } })?.cause?.code ?? '')
    emit()
    return getState()
  }
}

export function disconnect(): FriendsNetState {
  stop()
  session = null
  connected = false
  lastError = null
  lists = { friends: [], incoming: [], outgoing: [] }
  store.secret.delete(SESSION_SECRET)
  emit()
  return getState()
}

/** Silently resume a stored session on startup (token may still be valid for weeks). */
export async function resume(): Promise<void> {
  const stored = readSession()
  const url = serverUrl()?.replace(/\/+$/, '')
  if (!stored || !url || stored.url !== url) return
  session = stored
  connected = true
  start()
  try {
    await refresh()
  } catch {
    // 401 handling in api() already downgraded us; anything else keeps polling.
  }
  emit()
}

let autoInflight: Promise<FriendsNetState> | null = null

/**
 * Bring the friends network up on startup with no user action: reuse a stored session if we
 * have one (no Mojang round-trip), otherwise do a fresh handshake. Deduped so the renderer's
 * boot effect (which may fire twice under React StrictMode) can't double-connect.
 */
export function autoConnect(): Promise<FriendsNetState> {
  if (connected) return Promise.resolve(getState())
  if (autoInflight) return autoInflight
  autoInflight = (async () => {
    await resume()
    if (!connected && serverUrl() && getLaunchToken()?.access_token) {
      await connect()
    }
    return getState()
  })().finally(() => {
    autoInflight = null
  })
  return autoInflight
}

const NET_STATES = new Set<FriendNetPresence>(['idle', 'ranked', 'rsg', 'zsg', 'offline'])

/** Sanitize an untrusted server entry — the server is remote (and, until TLS, MITM-able),
 *  so never hand the renderer unvalidated uuids/states/names. */
function sanitizeEntry(e: unknown): FriendEntry | null {
  if (!e || typeof e !== 'object') return null
  const o = e as Record<string, unknown>
  const uuid = typeof o.uuid === 'string' ? o.uuid.replace(/-/g, '').toLowerCase() : ''
  if (!/^[0-9a-f]{32}$/.test(uuid)) return null
  const nickname = typeof o.nickname === 'string' ? o.nickname.slice(0, 16) : ''
  const state = (typeof o.state === 'string' && NET_STATES.has(o.state as FriendNetPresence)
    ? o.state
    : 'offline') as FriendNetPresence
  const lastSeen = typeof o.lastSeen === 'number' && Number.isFinite(o.lastSeen) ? o.lastSeen : null
  return { uuid, nickname, state, lastSeen }
}
function sanitizeList(v: unknown): FriendEntry[] {
  return Array.isArray(v) ? v.map(sanitizeEntry).filter((x): x is FriendEntry => x !== null) : []
}

async function refresh(): Promise<void> {
  const raw = await api<Record<string, unknown>>('/v1/friends')
  const data = {
    friends: sanitizeList(raw?.friends),
    incoming: sanitizeList(raw?.incoming),
    outgoing: sanitizeList(raw?.outgoing)
  }
  const changed = JSON.stringify(data) !== JSON.stringify(lists)
  lists = data
  if (changed) emit()
}

async function heartbeat(): Promise<void> {
  try {
    await api('/v1/presence', { method: 'PUT', body: JSON.stringify({ state: stateProvider() }) })
  } catch {
    /* transient — next beat retries */
  }
}

function start(): void {
  stop()
  void heartbeat()
  heartbeatTimer = setInterval(() => void heartbeat(), HEARTBEAT_MS)
  pollTimer = setInterval(() => void refresh().catch(() => {}), POLL_MS)
}

function stop(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  if (pollTimer) clearInterval(pollTimer)
  heartbeatTimer = null
  pollTimer = null
}

export async function request(uuid: string, nickname?: string): Promise<FriendsNetState> {
  await api('/v1/friends/requests', {
    method: 'POST',
    body: JSON.stringify({ to: uuid, nickname })
  })
  await refresh()
  return getState()
}
export async function accept(uuid: string): Promise<FriendsNetState> {
  await api(`/v1/friends/requests/${uuid}/accept`, { method: 'POST' })
  await refresh()
  return getState()
}
export async function decline(uuid: string): Promise<FriendsNetState> {
  await api(`/v1/friends/requests/${uuid}/decline`, { method: 'POST' })
  await refresh()
  return getState()
}
export async function remove(uuid: string): Promise<FriendsNetState> {
  await api(`/v1/friends/${uuid}`, { method: 'DELETE' })
  await refresh()
  return getState()
}

export type { FriendEntry }
