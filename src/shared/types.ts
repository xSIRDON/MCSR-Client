import { ALL_MAP_IDS } from './maps'

export type InstanceId = 'ranked' | 'rsg' | 'zsg'

export const INSTANCE_IDS = ['ranked', 'rsg', 'zsg'] as const

export function isInstanceId(value: unknown): value is InstanceId {
  return value === 'ranked' || value === 'rsg' || value === 'zsg'
}

export interface Profile {
  uuid: string
  name: string
}

export interface Account {
  uuid: string
  name: string
  active: boolean
}

export interface ProgressEvent {
  instance: InstanceId
  phase: 'java' | 'client' | 'assets' | 'libraries' | 'fabric' | 'mods' | 'configs' | 'launch'
  fraction: number | null
  message: string
}

export type InstanceState =
  | 'not-installed'
  | 'installing'
  | 'ready'
  | 'launching'
  | 'running'
  | 'error'

export interface InstanceStatus {
  id: InstanceId
  state: InstanceState
  versionId?: string
  error?: string
}

export interface TrackerStatus {
  running: boolean
  hasKey: boolean
  message?: string
}

export interface AppConfig {
  ram: Record<InstanceId, number>
  java: Record<InstanceId, string | null>
  maps: Record<InstanceId, string[]>
  seedQueueOverride: string | null
  pacemanName: string | null
  ninjabrain: boolean
  toolscreen: boolean
  favorites: string[]
  friendsServerUrl: string | null
  extraOptionsPromptSeen: boolean
  seedQueueAutoTune: boolean
}

export interface SeedQueueSizing {
  maxCapacity: number
  maxConcurrently: number
  maxConcurrentlyOnWall: number
}

export interface SeedQueueInfo {
  current: SeedQueueSizing
  recommended: SeedQueueSizing
  ramMb: number
  neededRamMb: number
  cpuThreads: number
}

export const DEFAULT_FRIENDS_SERVER = 'https://mcsrfriends.duckdns.org:8787'

export type FriendNetPresence = 'idle' | 'ranked' | 'rsg' | 'zsg' | 'offline'

export interface FriendEntry {
  uuid: string
  nickname: string
  state: FriendNetPresence
  lastSeen: number | null
}

export interface FriendsNetState {
  configured: boolean
  connected: boolean
  error: string | null
  friends: FriendEntry[]
  incoming: FriendEntry[]
  outgoing: FriendEntry[]
}

export interface FriendMessage {
  id: number
  from: string
  to: string
  body: string
  at: number
  read: boolean
  readAt?: number | null
}

export interface MessageStore {
  byFriend: Record<string, FriendMessage[]>
  unread: Record<string, number>
}

export interface MessagesEvent {
  store: MessageStore
  toast?: { uuid: string; nickname: string; body: string }
}

export const DEFAULT_CONFIG: AppConfig = {
  ram: { ranked: 3072, rsg: 3072, zsg: 3072 },
  java: { ranked: null, rsg: null, zsg: null },
  maps: { ranked: [...ALL_MAP_IDS], rsg: [...ALL_MAP_IDS], zsg: [...ALL_MAP_IDS] },
  seedQueueOverride: null,
  pacemanName: null,
  ninjabrain: true,
  toolscreen: true,
  favorites: [],
  friendsServerUrl: DEFAULT_FRIENDS_SERVER,
  extraOptionsPromptSeen: false,
  seedQueueAutoTune: true
}

export interface ModInfo {
  file: string
  name: string
  version: string
  enabled: boolean
}

export interface JavaInfo {
  found: boolean
  version: string | null
  major: number | null
  ok: boolean
  bundled?: boolean
}

export type StandardSettings = Record<string, string>

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'ready' | 'error'
  version?: string
  progress?: number
  error?: string
  note?: string
}

export interface LogLine {
  source: 'game' | 'system'
  text: string
}
