import { readFileSync, writeFileSync } from 'node:fs'
import { store } from '../store'
import { paths } from '../paths'
import { getLaunchToken } from '../auth/msmc-auth'
import { nextReceiptBatch } from './receipt-batch'
import { friendsJoinId } from './join-id'
import { DEFAULT_FRIENDS_SERVER } from '../../shared/types'
import type {
  FriendsNetState,
  FriendEntry,
  FriendNetPresence,
  FriendMessage,
  MessageStore,
  MessagesEvent
} from '../../shared/types'

const SESSION_SECRET = 'friends-session'
const HEARTBEAT_MS = 60_000
const POLL_MS = 30_000
const MESSAGE_POLL_MS = 15_000

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
let receiptCursor = 0

export function onChanged(cb: ChangeSink): void {
  sink = cb
}
export function setStateProvider(p: StateProvider): void {
  stateProvider = p
}

function serverUrl(): string {
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

async function fetchT(u: string, init: RequestInit, ms = 12_000): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(u, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

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

    const hs = await fetchT(`${url}/v1/auth/handshake`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ uuid: profileId })
    })
    if (!hs.ok) throw new Error(`Handshake failed (${hs.status}).`)
    const { serverId } = (await hs.json()) as { serverId: unknown }
    if (typeof serverId !== 'string' || !/^[0-9a-f]{40}$/.test(serverId)) {
      throw new Error('Handshake failed (bad response).')
    }

    const join = await fetchT('https://sessionserver.mojang.com/session/minecraft/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessToken, selectedProfile: profileId, serverId: friendsJoinId(serverId) })
    })
    if (join.status !== 204 && !join.ok) throw new Error(`Mojang join failed (${join.status}).`)

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
    emit()
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
  byFriend = {}
  msgCursor = 0
  saveMessages()
  emitMessages()
  store.secret.delete(SESSION_SECRET)
  emit()
  return getState()
}

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
  }
  emit()
}

let autoInflight: Promise<FriendsNetState> | null = null

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
  }
}

function start(): void {
  stop()
  loadMessages()
  emitMessages()
  justConnected = true
  void heartbeat()
  void pollMessages()
  heartbeatTimer = setInterval(() => void heartbeat(), HEARTBEAT_MS)
  pollTimer = setInterval(() => void refresh().catch(() => {}), POLL_MS)
  msgTimer = setInterval(() => {
    void pollMessages()
    void pollReceipts()
  }, MESSAGE_POLL_MS)
}

function stop(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  if (pollTimer) clearInterval(pollTimer)
  if (msgTimer) clearInterval(msgTimer)
  heartbeatTimer = null
  pollTimer = null
  msgTimer = null
}

function friendId(uuid: unknown): string {
  const id = String(uuid ?? '').replace(/-/g, '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(id)) throw new Error('Not a valid player id.')
  return id
}

export async function request(uuid: string, nickname?: string): Promise<FriendsNetState> {
  await api('/v1/friends/requests', {
    method: 'POST',
    body: JSON.stringify({
      to: friendId(uuid),
      nickname: typeof nickname === 'string' ? nickname.slice(0, 16) : undefined
    })
  })
  await refresh()
  return getState()
}
export async function accept(uuid: string): Promise<FriendsNetState> {
  await api(`/v1/friends/requests/${friendId(uuid)}/accept`, { method: 'POST' })
  await refresh()
  return getState()
}
export async function decline(uuid: string): Promise<FriendsNetState> {
  await api(`/v1/friends/requests/${friendId(uuid)}/decline`, { method: 'POST' })
  await refresh()
  return getState()
}
export async function remove(uuid: string): Promise<FriendsNetState> {
  await api(`/v1/friends/${friendId(uuid)}`, { method: 'DELETE' })
  await refresh()
  return getState()
}

let msgSink: ((e: MessagesEvent) => void) | null = null
let msgTimer: NodeJS.Timeout | null = null
let msgCursor = 0
let byFriend: Record<string, FriendMessage[]> = {}
let justConnected = false
let messagesLoaded = false

export function onMessages(cb: (e: MessagesEvent) => void): void {
  msgSink = cb
}

function loadMessages(): void {
  try {
    const raw = JSON.parse(readFileSync(paths.messagesFile(), 'utf8')) as {
      cursor?: number
      byFriend?: Record<string, FriendMessage[]>
    }
    msgCursor = typeof raw?.cursor === 'number' ? raw.cursor : 0
    byFriend = raw?.byFriend && typeof raw.byFriend === 'object' ? raw.byFriend : {}
  } catch {
    msgCursor = 0
    byFriend = {}
  }
  messagesLoaded = true
}

function saveMessages(): void {
  try {
    writeFileSync(paths.messagesFile(), JSON.stringify({ cursor: msgCursor, byFriend }), 'utf8')
  } catch {
  }
}

function friendOf(m: FriendMessage, me: string): string {
  return m.from === me ? m.to : m.from
}

function mergeMessage(m: FriendMessage, me: string): boolean {
  const key = friendOf(m, me)
  const list = byFriend[key] ?? (byFriend[key] = [])
  const existing = list.find((x) => x.id === m.id)
  if (existing) {
    if (existing.read !== m.read || (existing.readAt ?? null) !== (m.readAt ?? null)) {
      existing.read = m.read
      existing.readAt = m.readAt ?? null
      return true
    }
    return false
  }
  list.push(m)
  list.sort((a, b) => a.id - b.id)
  return true
}

function sanitizeMessage(e: unknown): FriendMessage | null {
  if (!e || typeof e !== 'object') return null
  const o = e as Record<string, unknown>
  const id = typeof o.id === 'number' && Number.isFinite(o.id) ? o.id : null
  const from = typeof o.from === 'string' ? o.from.replace(/-/g, '').toLowerCase() : ''
  const to = typeof o.to === 'string' ? o.to.replace(/-/g, '').toLowerCase() : ''
  if (id == null || !/^[0-9a-f]{32}$/.test(from) || !/^[0-9a-f]{32}$/.test(to)) return null
  const body = typeof o.body === 'string' ? o.body.slice(0, 500) : ''
  if (!body) return null
  const at = typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : Math.floor(Date.now() / 1000)
  const readAt = typeof o.readAt === 'number' && Number.isFinite(o.readAt) ? o.readAt : null
  return { id, from, to, body, at, read: o.read === true, readAt }
}

function messagesSnapshot(): MessageStore {
  const me = session?.uuid ?? ''
  const unread: Record<string, number> = {}
  for (const [uuid, list] of Object.entries(byFriend)) {
    unread[uuid] = list.filter((m) => m.from === uuid && m.to === me && !m.read).length
  }
  return { byFriend, unread }
}

export function getMessages(): MessageStore {
  if (!messagesLoaded) loadMessages()
  return messagesSnapshot()
}

function emitMessages(toast?: MessagesEvent['toast']): void {
  msgSink?.({ store: messagesSnapshot(), toast })
}

async function pollMessages(): Promise<void> {
  const me = session?.uuid
  if (!me) return
  const suppressToast = justConnected
  justConnected = false
  try {
    const raw = await api<{ messages?: unknown[]; lastId?: number }>(
      `/v1/messages?since=${msgCursor}`
    )
    const items = Array.isArray(raw?.messages) ? raw.messages : []
    let added = false
    let toast: MessagesEvent['toast'] | undefined
    for (const item of items) {
      const m = sanitizeMessage(item)
      if (!m || (m.from !== me && m.to !== me)) continue
      if (mergeMessage(m, me)) {
        added = true
        if (!suppressToast && m.to === me && !m.read) {
          const nickname = lists.friends.find((f) => f.uuid === m.from)?.nickname || m.from.slice(0, 8)
          toast = { uuid: m.from, nickname, body: m.body }
        }
      }
    }
    if (typeof raw?.lastId === 'number' && raw.lastId > msgCursor) msgCursor = raw.lastId
    if (added) {
      saveMessages()
      emitMessages(toast)
    }
  } catch {
  }
}

async function pollReceipts(): Promise<void> {
  const me = session?.uuid
  if (!me) return
  const pending: number[] = []
  for (const list of Object.values(byFriend)) {
    for (const m of list) if (m.from === me && !m.read) pending.push(m.id)
  }
  if (pending.length === 0) return
  const { batch, nextCursor } = nextReceiptBatch(pending, receiptCursor)
  receiptCursor = nextCursor
  try {
    const raw = await api<{ receipts?: unknown[] }>(
      `/v1/messages/receipts?ids=${batch.join(',')}`
    )
    const receipts = Array.isArray(raw?.receipts) ? raw.receipts : []
    let changed = false
    for (const item of receipts) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const id = typeof o.id === 'number' ? o.id : null
      if (id == null) continue
      const readAt =
        typeof o.readAt === 'number' && Number.isFinite(o.readAt)
          ? o.readAt
          : Math.floor(Date.now() / 1000)
      for (const list of Object.values(byFriend)) {
        const msg = list.find((x) => x.id === id && x.from === me)
        if (msg && !msg.read) {
          msg.read = true
          msg.readAt = readAt
          changed = true
        }
      }
    }
    if (changed) {
      saveMessages()
      emitMessages()
    }
  } catch {
  }
}

export async function sendMessage(uuid: string, body: string): Promise<FriendMessage | null> {
  const me = session?.uuid
  const to = uuid.replace(/-/g, '').toLowerCase()
  const text = body.trim().slice(0, 500)
  if (!me || !/^[0-9a-f]{32}$/.test(to) || !text) return null
  try {
    const res = await api<{ id?: number; at?: number }>('/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ to, body: text })
    })
    if (!res || typeof res.id !== 'number') return null
    const msg: FriendMessage = {
      id: res.id,
      from: me,
      to,
      body: text,
      at: typeof res.at === 'number' ? res.at : Math.floor(Date.now() / 1000),
      read: true
    }
    mergeMessage(msg, me)
    saveMessages()
    emitMessages()
    return msg
  } catch {
    return null
  }
}

export async function markRead(uuid: string): Promise<void> {
  const me = session?.uuid
  const friend = uuid.replace(/-/g, '').toLowerCase()
  if (!me) return
  const list = byFriend[friend]
  if (!list) return
  let maxId = 0
  let changed = false
  for (const m of list) {
    if (m.from === friend && m.to === me) {
      if (!m.read) {
        m.read = true
        changed = true
      }
      if (m.id > maxId) maxId = m.id
    }
  }
  if (changed) {
    saveMessages()
    emitMessages()
  }
  if (maxId > 0) {
    try {
      await api('/v1/messages/read', {
        method: 'POST',
        body: JSON.stringify({ with: friend, upTo: maxId })
      })
    } catch {
    }
  }
}

export type { FriendEntry }
