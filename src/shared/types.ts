// Shared DTOs used across the main process, preload bridge, and renderer.

import { ALL_MAP_IDS } from './maps'

export type InstanceId = 'ranked' | 'rsg' | 'zsg'

/** Minecraft account profile returned after Microsoft login. */
export interface Profile {
  uuid: string // dashless
  name: string
}

/** A stored Microsoft account shown in the account switcher (no token exposed). */
export interface Account {
  uuid: string
  name: string
  active: boolean
}

/** Progress event streamed during install/launch. */
export interface ProgressEvent {
  instance: InstanceId
  phase: 'java' | 'client' | 'assets' | 'libraries' | 'fabric' | 'mods' | 'configs' | 'launch'
  /** 0..1, or null for indeterminate. */
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
  /** Pack versionId currently installed, if known. */
  versionId?: string
  error?: string
}

export interface TrackerStatus {
  running: boolean
  hasKey: boolean
  message?: string
}

export interface AppConfig {
  /** Per-instance allocated RAM, in MB. */
  ram: Record<InstanceId, number>
  /** Per-instance Java executable path override; null = use the bundled JRE. */
  java: Record<InstanceId, string | null>
  /** Per-instance selected practice-map ids (from the shared MAP_CATALOG). */
  maps: Record<InstanceId, string[]>
  /** Absolute path to a user-provided SeedQueue jar to override the pack's, or null. */
  seedQueueOverride: string | null
  /** Last seen MCSR username for the live-pace name match (defaults to profile name). */
  pacemanName: string | null
  /** Launch Ninjabrain Bot (stronghold calculator) alongside the game. */
  ninjabrain: boolean
  /** Auto-install Toolscreen into an instance on its first launch (Windows only). */
  toolscreen: boolean
  /** Favorited runners for the friends rail — MCSR uuids (dashless, lowercase). */
  favorites: string[]
  /** Base URL of the friends/presence backend (see server/). Defaults to the official
   *  MCSR Client network so friends work out of the box; overridable via the config file. */
  friendsServerUrl: string | null
}

/** The official friends network, baked in so every client is on the same network by default.
 *  HTTPS via Caddy + Let's Encrypt (DuckDNS DNS-01) on :8787, proxying to the internal service. */
export const DEFAULT_FRIENDS_SERVER = 'https://mcsrfriends.duckdns.org:8787'

// ---- Friends network (mutual friends via the bundled backend) ----

export type FriendNetPresence = 'idle' | 'ranked' | 'rsg' | 'zsg' | 'offline'

export interface FriendEntry {
  uuid: string
  nickname: string
  /** Presence reported by their client's heartbeat ('offline' when stale). */
  state: FriendNetPresence
  /** Unix seconds of their last heartbeat, or null if they've never connected. */
  lastSeen: number | null
}

export interface FriendsNetState {
  /** A server URL is saved in Settings. */
  configured: boolean
  /** Signed in to the friends network with a valid session. */
  connected: boolean
  /** Last connection error, for the Settings card. */
  error: string | null
  friends: FriendEntry[]
  incoming: FriendEntry[]
  outgoing: FriendEntry[]
}

/** A direct message between two mutual friends. `from`/`to` are dashless-lowercase uuids. */
export interface FriendMessage {
  id: number
  from: string
  to: string
  body: string
  /** Unix seconds. */
  at: number
  /** For my incoming: whether I've read it. My own outgoing are always read. */
  read: boolean
}

/** The full DM cache the main process owns and hands the renderer. */
export interface MessageStore {
  /** Messages per friend uuid, oldest-first. */
  byFriend: Record<string, FriendMessage[]>
  /** Unread incoming count per friend uuid. */
  unread: Record<string, number>
}

/** Push payload when the DM store changes; `toast` is set for a fresh incoming message. */
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
  friendsServerUrl: DEFAULT_FRIENDS_SERVER
}

/** A single mod jar inside an instance's mods/ folder. */
export interface ModInfo {
  /** On-disk base filename of the jar (without any trailing ".disabled"). */
  file: string
  /** Display name derived from the filename. */
  name: string
  /** Version string derived from the filename, or '' when none is present. */
  version: string
  /** False when the jar is parked as "<file>.disabled". */
  enabled: boolean
}

/** System Java detection. The bundled tools (paceman, later Ninjabrain) need Java 17+. */
export interface JavaInfo {
  found: boolean
  version: string | null
  major: number | null
  /** True when Java is present and major >= 17. */
  ok: boolean
}

/** StandardSettings config as key->value pairs (mirrors standardoptions.txt on disk). */
export type StandardSettings = Record<string, string>

/** App auto-update lifecycle, streamed from the main process to the UI. */
export interface UpdateStatus {
  state: 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'ready' | 'error'
  /** Version of the available/downloaded update. */
  version?: string
  /** Download progress 0..100 while state === 'downloading'. */
  progress?: number
  error?: string
  /** Human note, e.g. why updates are inactive in dev. */
  note?: string
}

/** A line of console output streamed to the UI (game stdout/stderr or client lifecycle). */
export interface LogLine {
  source: 'game' | 'system'
  text: string
}
